import { describe, expect, it } from "vitest";
import { evaluateDay, resolveShift, summarize, viewRange, shiftAnchor, type Shift } from "./calc";

const day: Shift = { id: "d", name: "เช้า", start_time: "08:00:00", end_time: "17:00:00", break_minutes: 60, late_grace_minutes: 5 };
const night: Shift = { id: "n", name: "ดึก", start_time: "22:00:00", end_time: "06:00:00", break_minutes: 60, late_grace_minutes: 0 };
const ts = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString();
const base = { today: "2026-10-31", reason: "default" as const, dataLoaded: true };

describe("resolveShift", () => {
  it("uses the assigned shift even on a day off", () =>
    expect(resolveShift({ date: "2026-10-25", assigned: night, defaultShift: day, daysOff: [0], isHoliday: false }).shift).toBe(night));
  it("Sunday off", () => expect(resolveShift({ date: "2026-10-25", assigned: null, defaultShift: day, daysOff: [0], isHoliday: false }).reason).toBe("day_off"));
  it("holiday", () => expect(resolveShift({ date: "2026-10-23", assigned: null, defaultShift: day, daysOff: [0], isHoliday: true }).reason).toBe("holiday"));
  it("default shift", () => expect(resolveShift({ date: "2026-10-23", assigned: null, defaultShift: day, daysOff: [0], isHoliday: false }).shift).toBe(day));
  it("approved swap wins over assigned shift", () =>
    expect(resolveShift({ date: "2026-10-23", assigned: day, defaultShift: day, daysOff: [0], isHoliday: false, swapped: night }).shift).toBe(night));
  it("swap into a day off", () =>
    expect(resolveShift({ date: "2026-10-23", assigned: null, defaultShift: day, daysOff: [0], isHoliday: false, swapped: null }).reason).toBe("day_off"));
  it("swap onto a Sunday off means working", () =>
    expect(resolveShift({ date: "2026-10-25", assigned: null, defaultShift: day, daysOff: [0], isHoliday: false, swapped: day }).shift).toBe(day));
});

describe("evaluateDay", () => {
  it("on time inside grace", () => {
    const r = evaluateDay({ ...base, date: "2026-10-20", shift: day, record: { clock_in: ts("2026-10-20", "08:04"), clock_out: ts("2026-10-20", "17:02") } });
    expect(r.status).toBe("present");
    expect(r.lateMin).toBe(0);
    expect(r.workedMin).toBe(538 - 60);
    expect(r.clockIn).toBe("08:04");
  });
  it("late counts from shift start once past grace", () => {
    const r = evaluateDay({ ...base, date: "2026-10-20", shift: day, record: { clock_in: ts("2026-10-20", "08:20"), clock_out: ts("2026-10-20", "16:30") } });
    expect(r.status).toBe("late");
    expect(r.lateMin).toBe(20);
    expect(r.earlyMin).toBe(30);
  });
  it("night shift across midnight", () => {
    const r = evaluateDay({ ...base, date: "2026-10-20", shift: night, record: { clock_in: ts("2026-10-20", "21:55"), clock_out: ts("2026-10-21", "06:05") } });
    expect(r.status).toBe("present");
    expect(r.workedMin).toBe(8 * 60 + 10 - 60);
    expect(r.earlyMin).toBe(0);
  });
  it("absent only when that day's data is loaded", () => {
    expect(evaluateDay({ ...base, date: "2026-10-20", shift: day, record: null }).status).toBe("absent");
    expect(evaluateDay({ ...base, date: "2026-10-20", shift: day, record: null, dataLoaded: false }).status).toBe("no_data");
  });
  it("future day is upcoming", () => expect(evaluateDay({ ...base, date: "2026-11-02", shift: day, record: null }).status).toBe("upcoming"));
  it("work on day off", () => {
    const r = evaluateDay({ ...base, date: "2026-10-25", shift: null, reason: "day_off", record: { clock_in: ts("2026-10-25", "09:00"), clock_out: ts("2026-10-25", "12:00") } });
    expect(r.status).toBe("off_work");
    expect(r.workedMin).toBe(180);
  });
  it("one punch is incomplete", () =>
    expect(evaluateDay({ ...base, date: "2026-10-20", shift: day, record: { clock_in: ts("2026-10-20", "08:00"), clock_out: null } }).status).toBe("incomplete"));
});

describe("summarize", () => {
  it("adds up", () => {
    const days = [
      evaluateDay({ ...base, date: "2026-10-20", shift: day, record: { clock_in: ts("2026-10-20", "08:20"), clock_out: ts("2026-10-20", "17:00") }, otHours: 2 }),
      evaluateDay({ ...base, date: "2026-10-21", shift: day, record: null }),
      evaluateDay({ ...base, date: "2026-10-22", shift: day, record: { clock_in: ts("2026-10-22", "08:00"), clock_out: ts("2026-10-22", "17:00") } }),
    ];
    const s = summarize(days);
    expect(s).toMatchObject({ workDays: 2, lateDays: 1, lateMin: 20, absentDays: 1, otHours: 2 });
    expect(s.workedMin).toBe(460 + 480);
  });
});

describe("viewRange", () => {
  it("week starts Monday", () => expect(viewRange("week", "2026-10-25")).toEqual({ from: "2026-10-19", to: "2026-10-25" }));
  it("month", () => expect(viewRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" }));
  it("moves month", () => expect(shiftAnchor("month", "2026-12-15", 1)).toBe("2027-01-01"));
});

describe("leave", () => {
  it("approved leave is not absent", () =>
    expect(evaluateDay({ ...base, date: "2026-10-20", shift: day, record: null, leave: "sick" }).status).toBe("leave"));
});

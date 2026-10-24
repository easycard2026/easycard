// คิดสถานะการทำงานรายวันจากกะของวันนั้นกับเวลาเข้า-ออกจริง (ไม่แตะฐานข้อมูล ทดสอบใน calc.test.ts)

export type Shift = {
  id: string;
  name: string;
  start_time: string; // HH:MM[:SS]
  end_time: string;
  break_minutes: number;
  late_grace_minutes: number;
};

export type DayStatus =
  | "present" // มาทำงานตรงเวลา
  | "late" // มาสาย
  | "incomplete" // สแกนไม่ครบ (มีแค่เข้าหรือออก)
  | "absent" // ขาดงาน
  | "leave" // ลา (อนุมัติแล้ว)
  | "off_work" // ทำงานในวันหยุด
  | "holiday" // วันหยุดบริษัท
  | "day_off" // วันหยุดประจำสัปดาห์
  | "no_shift" // ไม่ได้จัดกะ
  | "no_data" // ยังไม่มีข้อมูลเวลาของวันนั้น
  | "upcoming"; // ยังไม่ถึง

export const STATUS_LABEL: Record<DayStatus, string> = {
  present: "มาทำงาน",
  late: "มาสาย",
  incomplete: "สแกนไม่ครบ",
  absent: "ขาดงาน",
  leave: "ลา",
  off_work: "ทำงานวันหยุด",
  holiday: "วันหยุดบริษัท",
  day_off: "วันหยุด",
  no_shift: "ไม่มีกะ",
  no_data: "ยังไม่มีข้อมูล",
  upcoming: "-",
};

export const STATUS_TONE: Record<DayStatus, "green" | "amber" | "red" | "blue" | "gray"> = {
  present: "green",
  late: "amber",
  incomplete: "amber",
  absent: "red",
  leave: "blue",
  off_work: "blue",
  holiday: "gray",
  day_off: "gray",
  no_shift: "gray",
  no_data: "gray",
  upcoming: "gray",
};

export type DayResult = {
  date: string;
  status: DayStatus;
  shift: Shift | null;
  clockIn: string | null; // HH:MM เวลาไทย
  clockOut: string | null;
  lateMin: number;
  earlyMin: number;
  workedMin: number;
  otHours: number;
};

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// นาทีนับจากเที่ยงคืนของวันทำงาน (เวลาไทย UTC+7) เช่น ออกตีหนึ่งของวันถัดไป = 1500
export function minutesFromDay(ts: string, date: string) {
  return Math.round((Date.parse(ts) - Date.parse(`${date}T00:00:00+07:00`)) / 60000);
}

export function hhmm(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

// วันในสัปดาห์ของวันที่ (0 = อาทิตย์)
export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function resolveShift(opts: {
  date: string;
  assigned: Shift | null; // จัดกะเฉพาะวัน (ชนะทุกกรณี)
  defaultShift: Shift | null;
  daysOff: number[];
  isHoliday: boolean;
}): { shift: Shift | null; reason: "assigned" | "default" | "holiday" | "day_off" | "no_shift" } {
  if (opts.assigned) return { shift: opts.assigned, reason: "assigned" };
  if (opts.isHoliday) return { shift: null, reason: "holiday" };
  if (opts.daysOff.includes(weekday(opts.date))) return { shift: null, reason: "day_off" };
  if (opts.defaultShift) return { shift: opts.defaultShift, reason: "default" };
  return { shift: null, reason: "no_shift" };
}

export function evaluateDay(opts: {
  date: string;
  today: string;
  shift: Shift | null;
  reason: "assigned" | "default" | "holiday" | "day_off" | "no_shift";
  record: { clock_in: string | null; clock_out: string | null } | null;
  dataLoaded: boolean; // มีข้อมูลเวลาของวันนั้นเข้าระบบแล้ว (ใช้แยก "ขาดงาน" กับ "ยังไม่มีข้อมูล")
  otHours?: number;
  leave?: string | null; // ชื่อประเภทการลาที่อนุมัติแล้วของวันนั้น
}): DayResult {
  const { date, shift, record } = opts;
  const base: DayResult = {
    date,
    status: "no_data",
    shift,
    clockIn: hhmm(record?.clock_in ?? null),
    clockOut: hhmm(record?.clock_out ?? null),
    lateMin: 0,
    earlyMin: 0,
    workedMin: 0,
    otHours: opts.otHours ?? 0,
  };

  const hasIn = !!record?.clock_in;
  const hasOut = !!record?.clock_out;

  if (!hasIn && !hasOut) {
    if (opts.leave && shift) return { ...base, status: "leave" };
    if (!shift) return { ...base, status: opts.reason === "holiday" ? "holiday" : opts.reason === "day_off" ? "day_off" : "no_shift" };
    if (date > opts.today) return { ...base, status: "upcoming" };
    if (date === opts.today && !opts.dataLoaded) return { ...base, status: "upcoming" };
    return { ...base, status: opts.dataLoaded ? "absent" : "no_data" };
  }

  const inMin = hasIn ? minutesFromDay(record!.clock_in!, date) : null;
  const outMin = hasOut ? minutesFromDay(record!.clock_out!, date) : null;

  let lateMin = 0;
  let earlyMin = 0;
  if (shift) {
    const start = toMin(shift.start_time);
    let end = toMin(shift.end_time);
    if (end <= start) end += 1440;
    if (inMin != null && inMin - start > shift.late_grace_minutes) lateMin = inMin - start;
    if (outMin != null && end - outMin > 0) earlyMin = end - outMin;
  }

  if (inMin == null || outMin == null) return { ...base, status: "incomplete", lateMin };

  const span = Math.max(0, outMin - inMin);
  const brk = shift && span > 5 * 60 ? shift.break_minutes : 0;
  const workedMin = Math.max(0, span - brk);
  const status: DayStatus = !shift ? (opts.reason === "no_shift" ? "present" : "off_work") : lateMin > 0 ? "late" : "present";
  return { ...base, status, lateMin, earlyMin, workedMin };
}

export type Summary = {
  workDays: number;
  lateDays: number;
  lateMin: number;
  earlyDays: number;
  absentDays: number;
  leaveDays: number;
  incompleteDays: number;
  offWorkDays: number;
  workedMin: number;
  otHours: number;
};

export function summarize(days: DayResult[]): Summary {
  const s: Summary = { workDays: 0, lateDays: 0, lateMin: 0, earlyDays: 0, absentDays: 0, leaveDays: 0, incompleteDays: 0, offWorkDays: 0, workedMin: 0, otHours: 0 };
  for (const d of days) {
    if (["present", "late", "off_work", "incomplete"].includes(d.status)) s.workDays++;
    if (d.status === "late") s.lateDays++;
    if (d.status === "absent") s.absentDays++;
    if (d.status === "leave") s.leaveDays++;
    if (d.status === "incomplete") s.incompleteDays++;
    if (d.status === "off_work") s.offWorkDays++;
    if (d.earlyMin > 0) s.earlyDays++;
    s.lateMin += d.lateMin;
    s.workedMin += d.workedMin;
    s.otHours += d.otHours;
  }
  return s;
}

export const fmtHours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
};

// ---------- ช่วงวันที่ของมุมมอง ----------
export type View = "day" | "week" | "month";

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function viewRange(view: View, anchor: string) {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const wd = weekday(anchor);
    const from = addDays(anchor, wd === 0 ? -6 : 1 - wd); // เริ่มวันจันทร์
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = anchor.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function shiftAnchor(view: View, anchor: string, dir: -1 | 1) {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  const [y, m] = anchor.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return d.toISOString().slice(0, 10);
}

export function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

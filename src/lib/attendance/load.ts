import type { SupabaseClient } from "@supabase/supabase-js";
import { datesBetween, evaluateDay, resolveShift, type DayResult, type Shift } from "./calc";

export type EmpRow = {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  department: string | null;
  start_date: string;
  default_shift_id: string | null;
  days_off: number[];
};

// โหลดข้อมูลช่วงวันที่ แล้วคิดสถานะของทุกคนทุกวัน (RLS กรองคนที่มองเห็นให้แล้ว)
export async function loadAttendance(supabase: SupabaseClient, from: string, to: string, today: string) {
  const [emps, shifts, assigns, holidays, records, loaded, ots, leaves, empHolidays] = await Promise.all([
    supabase.from("employees").select("id, code, first_name, last_name, start_date, default_shift_id, days_off, departments(name)").eq("active", true).order("code"),
    supabase.from("shifts").select("id, name, start_time, end_time, break_minutes, late_grace_minutes"),
    supabase.from("shift_assignments").select("employee_id, shift_id, work_date").gte("work_date", from).lte("work_date", to),
    supabase.from("holidays").select("holiday_date, name").gte("holiday_date", from).lte("holiday_date", to),
    supabase.from("attendance_days").select("employee_id, work_date, clock_in, clock_out, source, note").gte("work_date", from).lte("work_date", to),
    supabase.rpc("attendance_loaded_dates", { from_date: from, to_date: to }),
    supabase.from("ot_requests").select("employee_id, work_date, hours").eq("status", "approved").gte("work_date", from).lte("work_date", to),
    // มาจากระบบลา ถ้ายังไม่มีตารางนี้จะได้ error แล้วข้ามไป
    supabase.from("approved_leave_days").select("employee_id, leave_date, leave_type").gte("leave_date", from).lte("leave_date", to),
    // วันหยุดตามปฏิทินของแต่ละคน (ตามตำแหน่ง) จากระบบลา ถ้ายังไม่มีให้ใช้ holidays ร่วมกันทุกคน
    supabase.from("employee_holidays").select("employee_id, holiday_date, name").gte("holiday_date", from).lte("holiday_date", to),
  ]);

  const shiftById = new Map(((shifts.data ?? []) as Shift[]).map((s) => [s.id, s]));
  const assigned = new Map((assigns.data ?? []).map((a) => [`${a.employee_id}|${a.work_date}`, shiftById.get(a.shift_id) ?? null]));
  const holidayByDate = new Map((holidays.data ?? []).map((h) => [h.holiday_date as string, h.name as string]));
  const perEmpHoliday = empHolidays.error ? null : new Map((empHolidays.data ?? []).map((h) => [`${h.employee_id}|${h.holiday_date}`, h.name as string]));
  const holidayOf = (empId: string, date: string) => (perEmpHoliday ? perEmpHoliday.get(`${empId}|${date}`) : holidayByDate.get(date)) ?? null;
  const recordBy = new Map((records.data ?? []).map((r) => [`${r.employee_id}|${r.work_date}`, r]));
  const loadedDates = new Set(((loaded.data ?? []) as unknown[]).map((d) => (typeof d === "string" ? d : Object.values(d as object)[0]) as string));
  const otBy = new Map<string, number>();
  for (const o of ots.data ?? []) otBy.set(`${o.employee_id}|${o.work_date}`, (otBy.get(`${o.employee_id}|${o.work_date}`) ?? 0) + Number(o.hours));
  const leaveBy = new Map<string, string>();
  if (!leaves.error) for (const l of leaves.data ?? []) leaveBy.set(`${l.employee_id}|${l.leave_date}`, String(l.leave_type));

  const employees: EmpRow[] = (emps.data ?? []).map((e) => ({
    id: e.id,
    code: e.code,
    first_name: e.first_name,
    last_name: e.last_name,
    start_date: e.start_date,
    department: (e.departments as unknown as { name: string } | null)?.name ?? null,
    default_shift_id: e.default_shift_id,
    days_off: (e.days_off ?? []) as number[],
  }));

  const dates = datesBetween(from, to);
  const grid = new Map<string, DayResult[]>();
  for (const e of employees) {
    grid.set(
      e.id,
      dates.map((date) => {
        const key = `${e.id}|${date}`;
        // ก่อนวันเริ่มงาน ไม่นับอะไรเลย
        if (date < e.start_date) {
          return { date, status: "upcoming" as const, shift: null, clockIn: null, clockOut: null, lateMin: 0, earlyMin: 0, workedMin: 0, otHours: 0 };
        }
        const { shift, reason } = resolveShift({
          date,
          assigned: assigned.get(key) ?? null,
          defaultShift: e.default_shift_id ? shiftById.get(e.default_shift_id) ?? null : null,
          daysOff: e.days_off,
          isHoliday: holidayOf(e.id, date) != null,
        });
        const rec = recordBy.get(key);
        return evaluateDay({
          date,
          today,
          shift,
          reason,
          record: rec ? { clock_in: rec.clock_in, clock_out: rec.clock_out } : null,
          dataLoaded: loadedDates.has(date),
          otHours: otBy.get(key) ?? 0,
          leave: leaveBy.get(key) ?? null,
        });
      }),
    );
  }

  return { employees, dates, grid, holidayByDate, holidayOf, recordBy, hasAnyData: loadedDates.size > 0 };
}

import Link from "next/link";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { STATUS_LABEL, STATUS_TONE, fmtHours, shiftAnchor, summarize, viewRange, weekday, type DayResult, type View } from "@/lib/attendance/calc";
import { loadAttendance, type EmpRow } from "@/lib/attendance/load";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { Notice } from "@/components/notice";
import { deleteAttendance, saveAttendance } from "./actions";

const VIEWS: { key: View; label: string }[] = [
  { key: "day", label: "รายวัน" },
  { key: "week", label: "รายสัปดาห์" },
  { key: "month", label: "รายเดือน" },
];
const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const DOT: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-brand-500",
  gray: "bg-zinc-300",
};

function rangeLabel(view: View, from: string, to: string) {
  if (view === "day") return new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { dateStyle: "full", timeZone: "Asia/Bangkok" });
  if (view === "month") return new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" });
  return `${thaiDate(from)} – ${thaiDate(to)}`;
}

function Name({ e, href }: { e: EmpRow; href?: string }) {
  const body = (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-zinc-900">{e.first_name} {e.last_name}</span>
        <span className="block truncate text-[11px] text-zinc-400">{e.code}{e.department ? ` · ${e.department}` : ""}</span>
      </span>
    </span>
  );
  return href ? <Link href={href} className="hover:opacity-80">{body}</Link> : body;
}

function Stat({ label, value, unit, tone }: { label: string; value: string | number; unit?: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        {tone && <span className={`size-1.5 rounded-full ${DOT[tone]}`} />}
        {label}
      </p>
      <p className="tabular mt-1.5 text-lg font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-zinc-400">{unit}</span>}
      </p>
    </Card>
  );
}

function shiftText(d: DayResult) {
  if (!d.shift) return null;
  return `${d.shift.name} ${d.shift.start_time.slice(0, 5)}–${d.shift.end_time.slice(0, 5)}`;
}

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  const today = todayBangkok();
  const view: View = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : today;
  const { from, to } = viewRange(view, anchor);
  const isAdmin = role === "ceo" || role === "accounting";

  const { employees, dates, grid, holidayByDate, holidayOf, recordBy, hasAnyData } = await loadAttendance(supabase, from, to, today);

  // พนักงานทั่วไปเห็นแค่ตัวเอง → แสดงรายละเอียดรายวันของตัวเองเลย
  const focusId = sp.emp && employees.some((e) => e.id === sp.emp) ? sp.emp : employees.length === 1 ? employees[0].id : role === "employee" ? employeeId : null;
  const focus = employees.find((e) => e.id === focusId) ?? null;

  const url = (o: Partial<{ view: View; date: string; emp: string | null; edit: string | null }>) => {
    const q = new URLSearchParams();
    q.set("view", o.view ?? view);
    q.set("date", o.date ?? anchor);
    const emp = o.emp === undefined ? (sp.emp ?? null) : o.emp;
    if (emp) q.set("emp", emp);
    if (o.edit) q.set("edit", o.edit);
    return `/attendance?${q.toString()}`;
  };

  const rows = (focus ? [focus] : employees).map((e) => ({ e, days: grid.get(e.id) ?? [] }));
  const all = rows.flatMap((r) => r.days);
  const total = summarize(all);
  const editing = isAdmin && sp.edit ? employees.find((e) => e.id === sp.edit!.split("|")[0]) : null;
  const editDate = sp.edit?.split("|")[1] ?? anchor;
  const editRec = editing ? recordBy.get(`${editing.id}|${editDate}`) : null;
  const toLocal = (ts: string | null | undefined) =>
    ts ? new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }) : "";
  const returnUrl = url({});

  return (
    <div className="space-y-5">
      <PageHeader
        title="เวลาเข้าออก"
        description={role === "employee" ? "เวลาทำงานของคุณ" : role === "manager" ? "เวลาทำงานของทีม" : "เวลาทำงานของพนักงานทุกคน"}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={url({ view: v.key })}
                className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-all ${view === v.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"}`}
              >
                {v.label}
              </Link>
            ))}
          </div>
          {(role === "ceo" || role === "accounting" || role === "manager") && (
            <Link href="/shifts/schedule" className="inline-flex h-9 items-center rounded-lg border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
              ตั้งกะประจำ
            </Link>
          )}
        </div>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={url({ date: shiftAnchor(view, anchor, -1) })} className="grid size-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" aria-label="ก่อนหน้า">‹</Link>
          <Link href={url({ date: shiftAnchor(view, anchor, 1) })} className="grid size-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50" aria-label="ถัดไป">›</Link>
          <Link href={url({ date: today })} className="ml-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50">วันนี้</Link>
          <p className="ml-2 font-medium">{rangeLabel(view, from, to)}</p>
          {view === "day" && holidayByDate.get(from) && <Badge tone="gray">{holidayByDate.get(from)}</Badge>}
        </div>
        {focus && role !== "employee" && employees.length > 1 && (
          <Link href={url({ emp: null })} className="text-[13px] text-zinc-500 hover:text-zinc-900">
            ‹ ดูทุกคน
          </Link>
        )}
      </div>

      {!hasAnyData && (
        <p className="rounded-lg bg-zinc-100 px-3.5 py-2.5 text-[13px] text-zinc-600">
          ยังไม่มีข้อมูลเวลาจากเครื่องสแกนในช่วงนี้ ตอนนี้จึงเห็นแค่กะ วันหยุด และ OT ระบบจะเติมเวลาเข้า-ออกให้เมื่อนำเข้าไฟล์จากเครื่องสแกน
          {isAdmin && " (บัญชีกรอกเวลาเองได้ที่ปุ่ม แก้ ในมุมมองรายวัน)"}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="มาทำงาน" value={total.workDays} unit={view === "day" && !focus ? "คน" : "วัน"} tone="green" />
        <Stat label="มาสาย" value={total.lateDays} unit={total.lateMin ? `ครั้ง · ${total.lateMin} นาที` : "ครั้ง"} tone="amber" />
        <Stat label="ขาดงาน" value={total.absentDays} unit="ครั้ง" tone="red" />
        <Stat label="ลา" value={total.leaveDays} unit="วัน" tone="blue" />
        <Stat label="ชั่วโมงทำงาน" value={fmtHours(total.workedMin)} unit="ชม." />
        <Stat label="OT ที่อนุมัติ" value={total.otHours} unit="ชม." />
      </section>

      {editing && (
        <Card className="p-4">
          <h2 className="font-semibold">
            แก้เวลา · {editing.first_name} {editing.last_name} · {thaiDate(editDate)}
          </h2>
          <form action={saveAttendance} className="mt-3 grid gap-3 sm:grid-cols-[8rem_8rem_1fr_auto] sm:items-end">
            <input type="hidden" name="employee_id" value={editing.id} />
            <input type="hidden" name="work_date" value={editDate} />
            <input type="hidden" name="return" value={returnUrl} />
            <Field label="เข้า">
              <input type="time" name="clock_in" defaultValue={toLocal(editRec?.clock_in)} className={inputClass} />
            </Field>
            <Field label="ออก">
              <input type="time" name="clock_out" defaultValue={toLocal(editRec?.clock_out)} className={inputClass} />
            </Field>
            <Field label="เหตุผล">
              <input name="note" defaultValue={editRec?.note ?? ""} placeholder="เช่น ลืมสแกนออก" className={inputClass} />
            </Field>
            <div className="flex gap-2">
              <SubmitButton>บันทึก</SubmitButton>
              <Link href={returnUrl} className="inline-flex h-10 items-center rounded-lg border border-zinc-200 px-3 text-sm text-zinc-600 hover:bg-zinc-50">ยกเลิก</Link>
            </div>
          </form>
          {editRec && (
            <form action={deleteAttendance} className="mt-2">
              <input type="hidden" name="employee_id" value={editing.id} />
              <input type="hidden" name="work_date" value={editDate} />
              <input type="hidden" name="return" value={returnUrl} />
              <SubmitButton size="sm" variant="danger" confirm="ลบเวลาของวันนี้?">ลบเวลาของวันนี้</SubmitButton>
            </form>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="ไม่มีพนักงาน" />
        ) : focus && view !== "day" ? (
          // รายละเอียดรายวันของคนเดียว (สัปดาห์ / เดือน)
          <>
            {role !== "employee" && (
              <div className="border-b border-zinc-100 px-4 py-3">
                <Name e={focus} />
              </div>
            )}
            <DayList days={grid.get(focus.id) ?? []} holidayName={(d) => holidayOf(focus.id, d)} editHref={isAdmin ? (d) => url({ edit: `${focus.id}|${d}` }) : undefined} />
          </>
        ) : view === "day" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] text-zinc-400">
                  <th className="py-2 pl-4 pr-3 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">กะ</th>
                  <th className="px-3 py-2 font-medium">เข้า</th>
                  <th className="px-3 py-2 font-medium">ออก</th>
                  <th className="px-3 py-2 text-right font-medium">สาย</th>
                  <th className="px-3 py-2 text-right font-medium">ชม.ทำงาน</th>
                  <th className="px-3 py-2 text-right font-medium">OT</th>
                  <th className="py-2 pl-3 pr-4 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-zinc-100">
                {rows.map(({ e, days }) => {
                  const d = days[0];
                  return (
                    <tr key={e.id} className="hover:bg-zinc-50/70">
                      <td className="py-2 pl-4 pr-3"><Name e={e} href={url({ view: "month", emp: e.id })} /></td>
                      <td className="px-3 py-2 text-zinc-600">{shiftText(d) ?? <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2">{d.clockIn ?? <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2">{d.clockOut ?? <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2 text-right">{d.lateMin ? <span className="text-amber-700">{d.lateMin} น.</span> : <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2 text-right">{d.workedMin ? fmtHours(d.workedMin) : <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2 text-right">{d.otHours || <span className="text-zinc-300">-</span>}</td>
                      <td className="py-2 pl-3 pr-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5">
                            {d.status === "upcoming" ? <span className="text-zinc-300">-</span> : <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>}
                            {d.earlyMin > 0 && <span className="text-[11px] text-amber-700">ออกก่อน {d.earlyMin} น.</span>}
                          </span>
                          {isAdmin && (
                            <Link href={url({ edit: `${e.id}|${d.date}` })} className="text-[12px] text-zinc-400 hover:text-zinc-900">
                              แก้
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : view === "week" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] text-zinc-400">
                  <th className="py-2 pl-4 pr-3 font-medium">พนักงาน</th>
                  {dates.map((d) => (
                    <th key={d} className={`px-2 py-2 text-center font-medium ${d === today ? "text-zinc-900" : ""}`}>
                      {WD[weekday(d)]} {Number(d.slice(8))}
                    </th>
                  ))}
                  <th className="py-2 pl-2 pr-4 text-right font-medium">รวม ชม.</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-zinc-100">
                {rows.map(({ e, days }) => {
                  const s = summarize(days);
                  return (
                    <tr key={e.id} className="hover:bg-zinc-50/70">
                      <td className="py-2 pl-4 pr-3"><Name e={e} href={url({ emp: e.id })} /></td>
                      {days.map((d) => (
                        <td key={d.date} className="px-1.5 py-2 text-center">
                          <Cell d={d} />
                        </td>
                      ))}
                      <td className="py-2 pl-2 pr-4 text-right">
                        <span className="font-medium">{fmtHours(s.workedMin)}</span>
                        {s.otHours > 0 && <span className="block text-[11px] text-zinc-400">OT {s.otHours}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-right text-[13px]">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] text-zinc-400">
                  <th className="py-2 pl-4 pr-3 text-left font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">มาทำงาน (วัน)</th>
                  <th className="px-3 py-2 font-medium">สาย (ครั้ง / นาที)</th>
                  <th className="px-3 py-2 font-medium">ออกก่อน (ครั้ง)</th>
                  <th className="px-3 py-2 font-medium">ขาด</th>
                  <th className="px-3 py-2 font-medium">ลา</th>
                  <th className="px-3 py-2 font-medium">ชม.ทำงาน</th>
                  <th className="py-2 pl-3 pr-4 font-medium">OT (ชม.)</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-zinc-100">
                {rows.map(({ e, days }) => {
                  const s = summarize(days);
                  const dash = <span className="text-zinc-300">-</span>;
                  return (
                    <tr key={e.id} className="hover:bg-zinc-50/70">
                      <td className="py-2 pl-4 pr-3 text-left"><Name e={e} href={url({ emp: e.id })} /></td>
                      <td className="px-3 py-2">{s.workDays || dash}</td>
                      <td className="px-3 py-2">{s.lateDays ? <span className="text-amber-700">{s.lateDays} / {s.lateMin}</span> : dash}</td>
                      <td className="px-3 py-2">{s.earlyDays || dash}</td>
                      <td className="px-3 py-2">{s.absentDays ? <span className="text-rose-600">{s.absentDays}</span> : dash}</td>
                      <td className="px-3 py-2">{s.leaveDays || dash}</td>
                      <td className="px-3 py-2">{s.workedMin ? fmtHours(s.workedMin) : dash}</td>
                      <td className="py-2 pl-3 pr-4">{s.otHours || dash}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {view !== "day" && !focus && <p className="text-xs text-zinc-400">กดที่ชื่อเพื่อดูรายละเอียดรายวันของคนนั้น</p>}
    </div>
  );
}

function Cell({ d }: { d: DayResult }) {
  const tone = STATUS_TONE[d.status];
  if (d.clockIn || d.clockOut) {
    return (
      <span className={`inline-block rounded-md px-1.5 py-1 leading-tight ${tone === "amber" ? "bg-amber-50 text-amber-800" : tone === "blue" ? "bg-brand-50 text-brand-700" : "bg-emerald-50 text-emerald-800"}`}>
        {d.clockIn ?? "--:--"}
        <br />
        {d.clockOut ?? "--:--"}
      </span>
    );
  }
  if (d.status === "absent") return <span className="inline-block rounded-md bg-rose-50 px-1.5 py-1 text-rose-700">ขาด</span>;
  if (d.status === "leave") return <span className="inline-block rounded-md bg-brand-50 px-1.5 py-1 text-brand-700">ลา</span>;
  if (d.status === "holiday" || d.status === "day_off") return <span className="text-zinc-300">หยุด</span>;
  if (d.shift) return <span className="text-[11px] text-zinc-400">{d.shift.start_time.slice(0, 5)}</span>;
  return <span className="text-zinc-300">-</span>;
}

function DayList({ days, holidayName, editHref }: { days: DayResult[]; holidayName: (date: string) => string | null; editHref?: (date: string) => string }) {
  return (
    <ul className="divide-y divide-zinc-100">
      {days.map((d) => (
        <li key={d.date} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
          <div className="w-24 shrink-0">
            <p className="font-medium">{WD[weekday(d.date)]} {Number(d.date.slice(8))}</p>
            <p className="truncate text-[11px] text-zinc-400">{holidayName(d.date) ?? shiftText(d) ?? ""}</p>
          </div>
          <div className="tabular min-w-0 flex-1 text-zinc-600">
            {d.clockIn || d.clockOut ? (
              <>
                {d.clockIn ?? "--:--"} – {d.clockOut ?? "--:--"}
                {d.workedMin > 0 && <span className="ml-2 text-zinc-400">{fmtHours(d.workedMin)} ชม.</span>}
                {d.lateMin > 0 && <span className="ml-2 text-amber-700">สาย {d.lateMin} น.</span>}
                {d.earlyMin > 0 && <span className="ml-2 text-amber-700">ออกก่อน {d.earlyMin} น.</span>}
              </>
            ) : (
              <span className="text-zinc-300">-</span>
            )}
            {d.otHours > 0 && <span className="ml-2 text-zinc-500">OT {d.otHours} ชม.</span>}
          </div>
          {d.status === "upcoming" ? <span className="text-zinc-300">-</span> : <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>}
          {editHref && (
            <Link href={editHref(d.date)} className="text-[12px] text-zinc-400 hover:text-zinc-900">
              แก้
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

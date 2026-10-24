import Link from "next/link";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { LEAVE_STATUS, fmtDays, leaveBalances, type LeaveStatus } from "@/lib/leave";
import { loadLeaveYear } from "@/lib/leave-load";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { Notice } from "@/components/notice";
import { BalanceGrid } from "./balance";
import { cancelLeave, createLeave, decideLeave } from "./actions";

type Emp = { code: string; first_name: string; last_name: string } | null;
type Row = {
  id: string;
  employee_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  half_day: "am" | "pm" | null;
  days: number;
  unpaid_days: number;
  reason: string;
  status: LeaveStatus;
  decision_note: string | null;
  requested_by: string | null;
  employees: Emp;
  leave_types: { name: string } | null;
};

const HALF = { am: "ครึ่งเช้า", pm: "ครึ่งบ่าย" } as const;

function dateRange(r: Pick<Row, "start_date" | "end_date" | "half_day">) {
  if (r.start_date === r.end_date) return `${thaiDate(r.start_date)}${r.half_day ? ` (${HALF[r.half_day]})` : ""}`;
  return `${thaiDate(r.start_date)} – ${thaiDate(r.end_date)}`;
}
function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export default async function LeavePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId, user } = await getSession();
  const today = todayBangkok();
  const year = Number(today.slice(0, 4));
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const { from, to } = monthRange(ym);

  const isApprover = role === "manager" || role === "ceo";
  const isAdmin = role === "ceo" || role === "accounting";

  // คนที่ยื่นแทนได้: ผู้จัดการ = ลูกทีม, CEO/บัญชี = ทุกคน
  let others: { id: string; code: string; first_name: string; last_name: string }[] = [];
  if (isApprover || isAdmin) {
    let q = supabase.from("employees").select("id, code, first_name, last_name").eq("active", true).order("code");
    if (employeeId) q = q.neq("id", employeeId);
    if (role === "manager" && employeeId) q = q.eq("manager_id", employeeId);
    others = (await q).data ?? [];
  }

  const select =
    "id, employee_id, leave_type, start_date, end_date, half_day, days, unpaid_days, reason, status, decision_note, requested_by, employees(code, first_name, last_name), leave_types(name)";
  const [{ data: rows }, { data: pendingRows }, mine, { data: me }] = await Promise.all([
    supabase.from("leave_requests").select(select).lte("start_date", to).gte("end_date", from).order("start_date", { ascending: false }),
    isApprover ? supabase.from("leave_requests").select(select).eq("status", "pending").order("start_date") : Promise.resolve({ data: [] as unknown[] }),
    employeeId ? loadLeaveYear(supabase, year, [employeeId]) : loadLeaveYear(supabase, year, []),
    employeeId ? supabase.from("employees").select("start_date").eq("id", employeeId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const list = (rows ?? []) as unknown as Row[];
  const pending = ((pendingRows ?? []) as unknown as Row[]).filter((r) => r.employee_id !== employeeId);
  const types = mine.types.filter((t) => t.active);
  const balances = employeeId
    ? leaveBalances({ ...mine, year, employeeStart: (me as { start_date: string } | null)?.start_date ?? null, today })
    : [];
  const canRequestSelf = !!employeeId && role !== "ceo";
  const showForm = canRequestSelf || others.length > 0;
  const monthLabel = new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <PageHeader
        title={isApprover ? "การลา / อนุมัติใบลา" : "การลา"}
        description="ยื่นใบลา ดูสิทธิ์และวันลาคงเหลือ หัวหน้าอนุมัติแล้วระบบนำไปคิดเงินเดือนและเวลาเข้าออกให้เอง"
      >
        {(isApprover || isAdmin) && (
          <div className="flex gap-2">
            <Link href="/leave/summary" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
              สรุปขาด ลา มาสาย
            </Link>
            {isAdmin && (
              <Link href="/leave/settings" className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
                ตั้งค่าการลา
              </Link>
            )}
          </div>
        )}
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      {employeeId && balances.length > 0 && (
        <section className="rise space-y-2">
          <h2 className="text-sm font-semibold">สิทธิ์การลาของฉัน ปี {year + 543}</h2>
          <BalanceGrid items={balances} />
        </section>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {showForm && (
          <Card className="rise p-4 lg:sticky lg:top-6">
            <h2 className="font-semibold">{canRequestSelf ? "ยื่นใบลา" : "บันทึกการลาให้พนักงาน"}</h2>
            <p className="text-[13px] text-zinc-400">
              {isApprover ? "บันทึกให้ลูกทีมจะอนุมัติทันที" : role === "accounting" ? "ยื่นแทนพนักงานได้ เช่น โทรมาลาป่วย (รอหัวหน้าอนุมัติ)" : "หัวหน้าจะได้รับใบลาเพื่ออนุมัติ"}
            </p>
            <form action={createLeave} className="mt-4 space-y-3">
              {others.length > 0 && (
                <Field label="พนักงาน">
                  <select name="employee_id" className={inputClass} defaultValue={canRequestSelf ? employeeId! : others[0]?.id}>
                    {canRequestSelf && <option value={employeeId!}>ตัวฉันเอง</option>}
                    {others.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="ประเภทการลา">
                <select name="leave_type" required className={inputClass} defaultValue="sick">
                  {types.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ตั้งแต่วันที่">
                  <input type="date" name="start_date" required defaultValue={today} className={inputClass} />
                </Field>
                <Field label="ถึงวันที่">
                  <input type="date" name="end_date" defaultValue={today} className={inputClass} />
                </Field>
              </div>
              <Field label="ช่วงเวลา" hint="ระบบไม่นับวันหยุดประจำปีและวันหยุดประจำสัปดาห์">
                <select name="half_day" className={inputClass} defaultValue="">
                  <option value="">เต็มวัน</option>
                  <option value="am">ครึ่งวันเช้า</option>
                  <option value="pm">ครึ่งวันบ่าย</option>
                </select>
              </Field>
              <Field label="เหตุผล">
                <textarea name="reason" required rows={2} className={`${inputClass} h-auto py-2.5`} placeholder="เช่น เป็นไข้ ไปหาหมอ" />
              </Field>
              <SubmitButton className="w-full">ส่งใบลา</SubmitButton>
              <p className="text-[11px] leading-relaxed text-zinc-400">ลาป่วยตั้งแต่ 3 วันขึ้นไป บริษัทขอใบรับรองแพทย์ได้ ลาเกินสิทธิ์ที่ได้ค่าจ้างจะถูกหักเงินเดือนตามวัน</p>
            </form>
          </Card>
        )}

        <div className={`space-y-4 ${showForm ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {isApprover && (
            <Card className="rise overflow-hidden">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="font-semibold">ใบลารออนุมัติ</h2>
                <p className="text-[13px] text-zinc-400">{role === "ceo" ? "ใบลาทั้งหมดที่ยังไม่มีคนอนุมัติ รวมของผู้จัดการ" : "ใบลาของลูกทีม"}</p>
              </div>
              {pending.length === 0 ? (
                <EmptyState title="ไม่มีใบลาค้าง" hint="ใบลาใหม่จะแสดงที่นี่" />
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {pending.map((r) => (
                    <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3">
                        <Avatar first={r.employees?.first_name} last={r.employees?.last_name} seed={r.employees?.code} size="sm" />
                        <div className="min-w-0">
                          <p className="font-medium">
                            {r.employees?.first_name} {r.employees?.last_name}
                            <span className="ml-2 text-xs font-normal text-zinc-400">{r.employees?.code}</span>
                          </p>
                          <p className="tabular text-sm text-zinc-600">
                            {r.leave_types?.name} · {dateRange(r)} · {fmtDays(Number(r.days))} วัน
                          </p>
                          <p className="mt-0.5 text-[13px] text-zinc-400">{r.reason}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <form action={decideLeave}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <SubmitButton size="sm" variant="danger" confirm="ไม่อนุมัติใบลานี้?">ไม่อนุมัติ</SubmitButton>
                        </form>
                        <form action={decideLeave}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="approve" />
                          <SubmitButton size="sm" variant="success">อนุมัติ</SubmitButton>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="rise overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">ใบลา · {monthLabel}</h2>
                <p className="text-[13px] text-zinc-400">{isAdmin ? "ทุกคน" : role === "manager" ? "ของฉันและลูกทีม" : "ของฉัน"}</p>
              </div>
              <div className="flex gap-1">
                <Link href={`/leave?month=${shiftMonth(ym, -1)}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50">
                  ‹ เดือนก่อน
                </Link>
                <Link href={`/leave?month=${shiftMonth(ym, 1)}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50">
                  เดือนถัดไป ›
                </Link>
              </div>
            </div>
            {list.length === 0 ? (
              <EmptyState title="ไม่มีใบลาในเดือนนี้" />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {list.map((r) => {
                  const st = LEAVE_STATUS[r.status];
                  const own = r.employee_id === employeeId;
                  const canCancel =
                    (r.status === "pending" && (own || r.requested_by === user.id)) ||
                    (r.status === "approved" && !own && isApprover);
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {!own && (
                            <span className="font-medium">
                              {r.employees?.first_name} {r.employees?.last_name}
                            </span>
                          )}
                          <Badge tone="gray" dot={false}>{r.leave_types?.name ?? r.leave_type}</Badge>
                          <span className="tabular text-sm text-zinc-600">{dateRange(r)}</span>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-zinc-400">
                          {r.reason}
                          {r.decision_note ? ` · หมายเหตุ: ${r.decision_note}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="tabular text-sm font-medium">{fmtDays(Number(r.days))} วัน</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {r.status === "approved" && Number(r.unpaid_days) > 0 && (
                          <span className="tabular text-[11px] text-rose-600">ไม่ได้ค่าจ้าง {fmtDays(Number(r.unpaid_days))} วัน</span>
                        )}
                        {canCancel && (
                          <form action={cancelLeave}>
                            <input type="hidden" name="id" value={r.id} />
                            <button
                              className="text-xs text-zinc-400 underline-offset-2 hover:text-rose-600 hover:underline"
                              title={r.status === "approved" ? "ยกเลิกใบลาที่อนุมัติแล้ว" : undefined}
                            >
                              ยกเลิก
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

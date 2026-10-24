import Link from "next/link";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { OT_TYPE_LABEL, type OtType } from "@/lib/payroll/calc";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { Notice } from "@/components/notice";
import { cancelOt, createOt, decideOt } from "./actions";

type Emp = { code: string; first_name: string; last_name: string } | null;
type Row = {
  id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  ot_type: OtType;
  hours: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_note: string | null;
  requested_by: string | null;
  employees: Emp;
};

const STATUS: Record<Row["status"], { label: string; tone: "amber" | "green" | "red" | "gray" }> = {
  pending: { label: "รออนุมัติ", tone: "amber" },
  approved: { label: "อนุมัติแล้ว", tone: "green" },
  rejected: { label: "ไม่อนุมัติ", tone: "red" },
  cancelled: { label: "ยกเลิก", tone: "gray" },
};

const hhmm = (t: string) => t.slice(0, 5);

function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export default async function OtPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId, user } = await getSession();
  const today = todayBangkok();
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const { from, to } = monthRange(ym);

  const isApprover = role === "manager" || role === "ceo";
  const canRequestSelf = (role === "employee" || role === "manager") && !!employeeId;

  // คนที่สั่ง OT ให้ได้: ผู้จัดการ = ลูกทีม, CEO = ทุกคน (RLS กรองให้แล้ว)
  let team: { id: string; code: string; first_name: string; last_name: string }[] = [];
  if (isApprover) {
    let q = supabase.from("employees").select("id, code, first_name, last_name").eq("active", true).order("code");
    if (employeeId) q = q.neq("id", employeeId);
    if (role === "manager" && employeeId) q = q.eq("manager_id", employeeId);
    team = (await q).data ?? [];
  }

  const select = "id, employee_id, work_date, start_time, end_time, ot_type, hours, reason, status, decision_note, requested_by, employees(code, first_name, last_name)";
  const [{ data: rows }, { data: pendingRows }] = await Promise.all([
    supabase.from("ot_requests").select(select).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false }).order("start_time", { ascending: false }),
    isApprover
      ? supabase.from("ot_requests").select(select).eq("status", "pending").order("work_date")
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const list = (rows ?? []) as unknown as Row[];
  const pending = ((pendingRows ?? []) as unknown as Row[]).filter((r) => r.employee_id !== employeeId);

  const approvedHours = list.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.hours), 0);
  const waitingCount = list.filter((r) => r.status === "pending").length;
  const showForm = canRequestSelf || (isApprover && team.length > 0);
  const monthLabel = new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ส่วนที่ 3"
        title={role === "accounting" ? "รายการ OT" : isApprover ? "ขอ / อนุมัติ OT" : "ขอ OT"}
        description={
          role === "accounting"
            ? "ดู OT ทุกคน OT ที่อนุมัติแล้วจะถูกนำไปคิดเงินเดือนอัตโนมัติ"
            : "ยื่นคำขอก่อนทำ OT หัวหน้าอนุมัติแล้วระบบนำไปคิดเงินเดือนให้เอง"
        }
      />
      <Notice ok={sp.ok} error={sp.error} />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {showForm && (
          <Card className="rise p-4 lg:sticky lg:top-6">
            <h2 className="font-semibold">{canRequestSelf ? "ยื่นคำขอ OT" : "สั่ง OT ให้ทีม"}</h2>
            <p className="text-[13px] text-zinc-400">
              {isApprover ? "เลือกลูกทีมเพื่อสั่ง OT ล่วงหน้า (อนุมัติทันที)" : "หัวหน้าจะได้รับคำขอเพื่ออนุมัติ"}
            </p>
            <form action={createOt} className="mt-4 space-y-3">
              {isApprover && team.length > 0 && (
                <Field label="พนักงาน">
                  <select name="employee_id" className={inputClass} defaultValue={canRequestSelf ? employeeId! : team[0]?.id}>
                    {canRequestSelf && <option value={employeeId!}>ตัวฉันเอง (รอ CEO อนุมัติ)</option>}
                    {team.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} {t.first_name} {t.last_name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="วันที่">
                <input type="date" name="work_date" required defaultValue={today} className={inputClass} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="เริ่ม">
                  <input type="time" name="start_time" required defaultValue="17:00" className={inputClass} />
                </Field>
                <Field label="ถึง">
                  <input type="time" name="end_time" required defaultValue="20:00" className={inputClass} />
                </Field>
              </div>
              <Field label="ประเภท" hint="วันหยุด = วันหยุดประจำสัปดาห์หรือวันหยุดตามประเพณี">
                <select name="ot_type" className={inputClass} defaultValue="workday">
                  <option value="workday">OT หลังเลิกงาน (วันทำงาน)</option>
                  <option value="holiday_work">ทำงานวันหยุด (เวลาปกติ)</option>
                  <option value="holiday_ot">OT วันหยุด (เกินเวลาปกติ)</option>
                </select>
              </Field>
              <Field label="เหตุผล / งานที่ทำ">
                <textarea name="reason" required rows={2} className={`${inputClass} h-auto py-2.5`} placeholder="เช่น ปิดงานลูกค้า A" />
              </Field>
              <SubmitButton className="w-full">ส่งคำขอ</SubmitButton>
            </form>
          </Card>
        )}

        <div className={`space-y-4 ${showForm ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {isApprover && (
            <Card className="rise overflow-hidden" >
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="font-semibold">รออนุมัติ</h2>
                <p className="text-[13px] text-zinc-400">{role === "ceo" ? "คำขอทั้งหมดที่ยังไม่มีคนอนุมัติ รวมของผู้จัดการ" : "คำขอของลูกทีม"}</p>
              </div>
              {pending.length === 0 ? (
                <EmptyState title="ไม่มีคำขอค้าง" hint="คำขอใหม่จะแสดงที่นี่" />
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
                            {thaiDate(r.work_date)} · {hhmm(r.start_time)}–{hhmm(r.end_time)} · {Number(r.hours)} ชม. · {OT_TYPE_LABEL[r.ot_type]}
                          </p>
                          <p className="mt-0.5 text-[13px] text-zinc-400">{r.reason}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <form action={decideOt}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="reject" />
                          <SubmitButton size="sm" variant="danger" confirm="ไม่อนุมัติคำขอนี้?">ไม่อนุมัติ</SubmitButton>
                        </form>
                        <form action={decideOt}>
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

          <Card className="rise overflow-hidden" >
            <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">ประวัติ OT · {monthLabel}</h2>
                <p className="tabular text-[13px] text-zinc-400">
                  อนุมัติแล้ว {approvedHours.toLocaleString("th-TH")} ชม. · รออนุมัติ {waitingCount} รายการ
                </p>
              </div>
              <div className="flex gap-1">
                <Link href={`/ot?month=${shiftMonth(ym, -1)}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50">
                  ‹ เดือนก่อน
                </Link>
                <Link href={`/ot?month=${shiftMonth(ym, 1)}`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50">
                  เดือนถัดไป ›
                </Link>
              </div>
            </div>
            {list.length === 0 ? (
              <EmptyState title="ยังไม่มี OT ในเดือนนี้" />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {list.map((r) => {
                  const st = STATUS[r.status];
                  const canCancel = r.status === "pending" && (r.employee_id === employeeId || r.requested_by === user.id);
                  return (
                    <li key={r.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {r.employee_id !== employeeId && (
                            <span className="font-medium">
                              {r.employees?.first_name} {r.employees?.last_name}
                            </span>
                          )}
                          <span className="tabular text-sm text-zinc-600">
                            {thaiDate(r.work_date)} · {hhmm(r.start_time)}–{hhmm(r.end_time)}
                          </span>
                          <Badge tone="gray" dot={false}>{OT_TYPE_LABEL[r.ot_type]}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-[13px] text-zinc-400">
                          {r.reason}
                          {r.decision_note ? ` · หมายเหตุ: ${r.decision_note}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="tabular text-sm font-medium">{Number(r.hours)} ชม.</span>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {canCancel && (
                          <form action={cancelOt}>
                            <input type="hidden" name="id" value={r.id} />
                            <button className="text-xs text-zinc-400 underline-offset-2 hover:text-rose-600 hover:underline">ยกเลิก</button>
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

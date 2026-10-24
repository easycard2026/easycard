import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { cancelSwap, decideSwap, requestSwap, respondSwap } from "./actions";

type Status = "pending_peer" | "pending_approval" | "approved" | "rejected" | "cancelled";
type Swap = {
  id: string;
  work_date: string;
  requester_id: string;
  target_id: string;
  requester_shift_id: string | null;
  target_shift_id: string | null;
  reason: string;
  status: Status;
  manager_at: string | null;
  accounting_at: string | null;
  decision_note: string | null;
};
type Person = { id: string; code: string; first_name: string; last_name: string };

const STATUS: Record<Status, { label: string; tone: "amber" | "green" | "red" | "gray" | "blue" }> = {
  pending_peer: { label: "รอเพื่อนตอบรับ", tone: "amber" },
  pending_approval: { label: "รออนุมัติ", tone: "blue" },
  approved: { label: "อนุมัติแล้ว", tone: "green" },
  rejected: { label: "ไม่อนุมัติ", tone: "red" },
  cancelled: { label: "ยกเลิก", tone: "gray" },
};

export default async function SwapsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  const today = todayBangkok();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") && sp.date! >= today ? sp.date! : today;
  const canRequest = !!employeeId && role !== "ceo";

  const [{ data: shifts }, { data: swapRows }, { data: visibleEmps }, cands, mine] = await Promise.all([
    supabase.from("shifts").select("id, name, start_time, end_time").order("start_time"),
    supabase
      .from("shift_swaps")
      .select("id, work_date, requester_id, target_id, requester_shift_id, target_shift_id, reason, status, manager_at, accounting_at, decision_note")
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("employees").select("id, code, first_name, last_name"),
    employeeId ? supabase.rpc("swap_candidates", { d: date }) : Promise.resolve({ data: [] }),
    employeeId ? supabase.rpc("my_shift_on", { d: date }) : Promise.resolve({ data: null }),
  ]);

  const shiftById = new Map((shifts ?? []).map((s) => [s.id, s]));
  const shiftLabel = (id: string | null) => {
    const s = id ? shiftById.get(id) : null;
    return s ? `${s.name} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : "วันหยุด";
  };
  const candidates = ((cands.data ?? []) as (Person & { shift_id: string | null })[]);
  const people = new Map<string, Person>();
  for (const p of [...(visibleEmps ?? []), ...candidates]) people.set(p.id, p);
  const nameOf = (id: string) => {
    const p = people.get(id);
    return p ? `${p.first_name} ${p.last_name}` : "พนักงาน";
  };
  const myShift = (mine.data ?? null) as string | null;
  const options = candidates.filter((c) => c.shift_id !== myShift);

  const swaps = (swapRows ?? []) as Swap[];
  const incoming = swaps.filter((s) => s.status === "pending_peer" && s.target_id === employeeId);

  // ขั้นที่ฉันอนุมัติได้ (ฐานข้อมูลตรวจสิทธิ์ซ้ำอีกครั้ง)
  const isTeam = (id: string) => role === "manager" && (visibleEmps ?? []).some((e) => e.id === id) && id !== employeeId;
  const stepsFor = (s: Swap) => {
    if (s.status !== "pending_approval" || s.requester_id === employeeId || s.target_id === employeeId) return [];
    const steps: ("manager" | "accounting")[] = [];
    if (!s.manager_at && (role === "ceo" || isTeam(s.requester_id) || isTeam(s.target_id))) steps.push("manager");
    if (!s.accounting_at && (role === "accounting" || role === "ceo")) steps.push("accounting");
    return steps;
  };
  const toApprove = swaps.filter((s) => stepsFor(s).length > 0).sort((a, b) => a.work_date.localeCompare(b.work_date));

  const Line = ({ s }: { s: Swap }) => (
    <>
      <p className="text-[13px] font-medium">
        {nameOf(s.requester_id)} <span className="font-normal text-zinc-400">⇄</span> {nameOf(s.target_id)}
      </p>
      <p className="tabular text-[13px] text-zinc-600">
        {thaiDate(s.work_date)} · {shiftLabel(s.requester_shift_id)} ⇄ {shiftLabel(s.target_shift_id)}
      </p>
      <p className="mt-0.5 text-xs text-zinc-400">
        {s.reason}
        {s.decision_note ? ` · หมายเหตุ: ${s.decision_note}` : ""}
      </p>
    </>
  );

  const Steps = ({ s }: { s: Swap }) => (
    <span className="flex flex-wrap gap-1 text-[11px]">
      <span className={s.manager_at ? "text-emerald-600" : "text-zinc-400"}>{s.manager_at ? "✓" : "○"} หัวหน้างาน</span>
      <span className={s.accounting_at ? "text-emerald-600" : "text-zinc-400"}>{s.accounting_at ? "✓" : "○"} บัญชี</span>
    </span>
  );

  return (
    <div className="space-y-5">
      <BackLink href="/shifts">กะการทำงาน</BackLink>
      <PageHeader
        title="แลกกะ"
        description="แลกกะกับเพื่อนเป็นรายวัน: เพื่อนตอบรับ แล้วหัวหน้างานและบัญชีอนุมัติ จึงมีผลกับเวลาเข้าออก สาย ขาด และ OT"
      />
      <Notice ok={sp.ok} error={sp.error} />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        {canRequest && (
          <Card className="rise p-4 lg:sticky lg:top-6">
            <h2 className="font-semibold">ขอแลกกะ</h2>
            <form method="get" className="mt-3 flex items-end gap-2">
              <Field label="วันที่" className="flex-1">
                <input type="date" name="date" min={today} defaultValue={date} className={inputClass} />
              </Field>
              <button className="h-10 rounded-lg border border-zinc-200 px-3 text-[13px] text-zinc-600 hover:bg-zinc-50">ดูกะ</button>
            </form>
            <p className="mt-2 text-[13px] text-zinc-500">
              กะของคุณวันนั้น: <span className="font-medium text-zinc-900">{shiftLabel(myShift)}</span>
            </p>
            {options.length === 0 ? (
              <p className="mt-3 text-[13px] text-zinc-400">วันนี้ไม่มีเพื่อนที่อยู่กะต่างจากคุณ ลองเลือกวันอื่น</p>
            ) : (
              <form action={requestSwap} className="mt-3 space-y-3">
                <input type="hidden" name="work_date" value={date} />
                <Field label="แลกกับ" hint="คุณจะได้กะของเพื่อน และเพื่อนได้กะของคุณ เฉพาะวันนี้">
                  <select name="target_id" required className={inputClass} defaultValue="">
                    <option value="" disabled>เลือกเพื่อน</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name} · {shiftLabel(c.shift_id)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="เหตุผล">
                  <textarea name="reason" required rows={2} className={`${inputClass} h-auto py-2.5`} placeholder="เช่น ติดธุระช่วงเช้า" />
                </Field>
                <SubmitButton className="w-full">ส่งคำขอ</SubmitButton>
              </form>
            )}
          </Card>
        )}

        <div className={`space-y-4 ${canRequest ? "lg:col-span-2" : "lg:col-span-3"}`}>
          {incoming.length > 0 && (
            <Card className="rise overflow-hidden">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="font-semibold">เพื่อนขอแลกกะกับคุณ</h2>
              </div>
              <ul className="divide-y divide-zinc-100">
                {incoming.map((s) => (
                  <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Line s={s} />
                      <p className="mt-1 text-xs text-zinc-500">ถ้าตอบรับ คุณจะได้ {shiftLabel(s.requester_shift_id)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <form action={respondSwap}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="decision" value="reject" />
                        <SubmitButton size="sm" variant="danger">ไม่สะดวก</SubmitButton>
                      </form>
                      <form action={respondSwap}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="decision" value="accept" />
                        <SubmitButton size="sm" variant="success">ตอบรับ</SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {role !== "employee" && (
            <Card className="rise overflow-hidden">
              <div className="border-b border-zinc-100 px-4 py-3">
                <h2 className="font-semibold">รออนุมัติ</h2>
                <p className="text-[13px] text-zinc-400">ต้องผ่านทั้งหัวหน้างานและบัญชี ใครอนุมัติก่อนก็ได้</p>
              </div>
              {toApprove.length === 0 ? (
                <EmptyState title="ไม่มีคำขอค้าง" />
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {toApprove.map((s) => (
                    <li key={s.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <Line s={s} />
                        <div className="mt-1"><Steps s={s} /></div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {stepsFor(s).map((step) => (
                          <div key={step} className="flex gap-2">
                            <form action={decideSwap}>
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="step" value={step} />
                              <input type="hidden" name="decision" value="reject" />
                              <SubmitButton size="sm" variant="danger" confirm="ไม่อนุมัติการแลกกะนี้?">ไม่อนุมัติ</SubmitButton>
                            </form>
                            <form action={decideSwap}>
                              <input type="hidden" name="id" value={s.id} />
                              <input type="hidden" name="step" value={step} />
                              <input type="hidden" name="decision" value="approve" />
                              <SubmitButton size="sm" variant="success">
                                อนุมัติ{role === "ceo" ? (step === "manager" ? " (หัวหน้างาน)" : " (บัญชี)") : ""}
                              </SubmitButton>
                            </form>
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card className="rise overflow-hidden">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="font-semibold">ประวัติการแลกกะ</h2>
            </div>
            {swaps.length === 0 ? (
              <EmptyState title="ยังไม่มีการแลกกะ" />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {swaps.map((s) => {
                  const st = STATUS[s.status];
                  const canCancel =
                    (s.requester_id === employeeId && (s.status === "pending_peer" || s.status === "pending_approval")) ||
                    ((role === "ceo" || role === "accounting") && s.status !== "rejected" && s.status !== "cancelled");
                  return (
                    <li key={s.id} className="flex items-start gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Line s={s} />
                        {s.status === "pending_approval" && <div className="mt-1"><Steps s={s} /></div>}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {canCancel && (
                          <form action={cancelSwap}>
                            <input type="hidden" name="id" value={s.id} />
                            <SubmitButton size="sm" variant="secondary" confirm={s.status === "approved" ? "ยกเลิกแล้วทั้งสองคนจะกลับไปใช้กะเดิม?" : "ยกเลิกคำขอนี้?"}>
                              ยกเลิก
                            </SubmitButton>
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

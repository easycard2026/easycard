import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { LEAVE_STATUS, fmtDays, leaveBalances, type LeaveStatus } from "@/lib/leave";
import { loadLeaveYear } from "@/lib/leave-load";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { BalanceGrid } from "../../balance";
import { saveEntitlement } from "../../actions";

export default async function EmployeeLeavePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  if (role === "employee") redirect("/leave");
  const today = todayBangkok();
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number(today.slice(0, 4));

  const { data: e } = await supabase.from("employees").select("id, code, first_name, last_name, start_date").eq("id", id).maybeSingle();
  if (!e) notFound();
  const [data, { data: reqs }] = await Promise.all([
    loadLeaveYear(supabase, year, [id]),
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date, half_day, days, unpaid_days, status, reason, leave_types(name)")
      .eq("employee_id", id)
      .gte("start_date", `${year}-01-01`)
      .lte("start_date", `${year}-12-31`)
      .order("start_date", { ascending: false }),
  ]);
  const balances = leaveBalances({ ...data, year, employeeStart: e.start_date, today });
  const canEdit = role === "ceo" || (role === "accounting" && id !== employeeId);

  return (
    <div className="space-y-5">
      <BackLink href={`/leave/summary?year=${year}`}>สรุปการลา</BackLink>
      <PageHeader title={`${e.first_name} ${e.last_name}`} description={`${e.code} · เริ่มงาน ${thaiDate(e.start_date)} · สิทธิ์การลาปี ${year + 543}`} />
      <Notice ok={sp.ok} error={sp.error} />
      <BalanceGrid items={balances} />

      {canEdit && (
        <Card className="rise overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold">ตั้งสิทธิ์เฉพาะคนนี้</h2>
            <p className="text-[13px] text-zinc-400">เช่น อายุงานมากได้พักร้อนเพิ่ม · ลาได้สูงสุดเว้นว่าง = ไม่จำกัด</p>
          </div>
          <ul className="divide-y divide-zinc-100">
            {data.types
              .filter((t) => t.active)
              .map((t) => {
                const en = data.entitlements.find((x) => x.leave_type === t.code);
                return (
                  <li key={t.code} className="px-4 py-2.5">
                    <form action={saveEntitlement} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="employee_id" value={id} />
                      <input type="hidden" name="leave_type" value={t.code} />
                      <span className="w-32 text-[13px] font-medium">
                        {t.name}
                        {en && <span className="ml-1 text-[10px] font-normal text-brand-600">เฉพาะคน</span>}
                      </span>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        ลาได้
                        <input name="max_days" type="number" min="0" step="0.5" defaultValue={(en ? en.max_days : t.max_days) ?? ""} placeholder="ไม่จำกัด" className={`${inputClass} h-8 w-24`} />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                        ได้ค่าจ้าง
                        <input name="paid_days" type="number" min="0" step="0.5" required defaultValue={en ? en.paid_days : t.paid_days} className={`${inputClass} h-8 w-20`} />
                        วัน
                      </label>
                      <SubmitButton size="sm" variant="secondary">บันทึก</SubmitButton>
                      {en && (
                        <button name="reset" value="1" className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-800 hover:underline">
                          ใช้ค่าเริ่มต้น
                        </button>
                      )}
                    </form>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}

      <Card className="rise overflow-hidden">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="font-semibold">ใบลาปี {year + 543}</h2>
        </div>
        {(reqs ?? []).length === 0 ? (
          <EmptyState title="ยังไม่มีใบลา" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {(reqs ?? []).map((r) => {
              const st = LEAVE_STATUS[r.status as LeaveStatus];
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="tabular text-sm">
                      <span className="font-medium">{(r.leave_types as unknown as { name: string } | null)?.name}</span>
                      <span className="text-zinc-500">
                        {" · "}
                        {r.start_date === r.end_date ? thaiDate(r.start_date) : `${thaiDate(r.start_date)} – ${thaiDate(r.end_date)}`}
                        {r.half_day ? " (ครึ่งวัน)" : ""}
                      </span>
                    </p>
                    <p className="truncate text-[13px] text-zinc-400">{r.reason}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="tabular text-sm font-medium">{fmtDays(Number(r.days))} วัน</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    {r.status === "approved" && Number(r.unpaid_days) > 0 && <span className="text-[11px] text-rose-600">หักเงิน {fmtDays(Number(r.unpaid_days))} วัน</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { thaiDate } from "@/lib/format";
import { periodLabel } from "@/lib/payroll/calc";
import { PAYROLL_STATUS, PAYROLL_STEPS, type PayrollStatus } from "@/lib/payroll/labels";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { BackLink, Notice, baht } from "@/components/notice";
import { PAYERS, type Payer } from "@/lib/payroll/bank";
import { loadTransferPlan } from "@/lib/payroll/transfers";
import { deletePeriod, recalculate, setStatus } from "../actions";

type Slip = {
  id: string;
  employee_id: string;
  salary_paid: number;
  ot_hours: number;
  ot_amount: number;
  allowances: number;
  other_earnings: number;
  deductions: number;
  gross: number;
  sso_employee: number;
  sso_employer: number;
  tax: number;
  net: number;
  employees: { code: string; first_name: string; last_name: string } | null;
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[13px] text-zinc-500">{label}</p>
      <p className="tabular mt-1.5 text-lg font-semibold tracking-tight">฿{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
    </Card>
  );
}

function Stepper({ status }: { status: PayrollStatus }) {
  const idx = PAYROLL_STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="flex items-center gap-2 overflow-x-auto text-[13px]">
      {PAYROLL_STEPS.map((s, i) => {
        const done = i < idx || status === "closed";
        const current = i === idx && status !== "closed";
        return (
          <li key={s.key} className="flex items-center gap-2 whitespace-nowrap">
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                done ? "bg-zinc-900 text-white" : current ? "bg-brand-50 text-brand-700 ring-1 ring-brand-500" : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span className={done || current ? "font-medium text-zinc-900" : "text-zinc-400"}>{s.label}</span>
            {i < PAYROLL_STEPS.length - 1 && <span className="mx-1 h-px w-6 bg-zinc-200" />}
          </li>
        );
      })}
    </ol>
  );
}

const transferReady = (s: PayrollStatus) => s === "approved" || s === "closed";

export default async function PeriodPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/payslips");

  const { data: period } = await supabase
    .from("payroll_periods")
    .select("id, year, month, start_date, end_date, pay_date, status, calculated_at, reviewed_at, approved_at")
    .eq("id", id)
    .maybeSingle();
  if (!period) notFound();

  const [{ data: slipRows }, { data: emps }, { data: salaries }] = await Promise.all([
    supabase
      .from("payslips")
      .select("id, employee_id, salary_paid, ot_hours, ot_amount, allowances, other_earnings, deductions, gross, sso_employee, sso_employer, tax, net, employees(code, first_name, last_name)")
      .eq("period_id", id),
    supabase.from("employees").select("id, code, first_name, last_name").eq("active", true).lte("start_date", period.end_date),
    supabase.from("salary_history").select("employee_id").lte("effective_date", period.end_date),
  ]);
  const slips = ((slipRows ?? []) as unknown as Slip[]).sort((a, b) => (a.employees?.code ?? "").localeCompare(b.employees?.code ?? ""));
  const withSalary = new Set((salaries ?? []).map((s) => s.employee_id));
  const missing = (emps ?? []).filter((e) => !withSalary.has(e.id));

  const plan = slips.length ? await loadTransferPlan(supabase, id) : null;
  const canTransfer = transferReady(period.status as PayrollStatus);

  const sum = (k: keyof Slip) => slips.reduce((s, x) => s + Number(x[k]), 0);
  const status = period.status as PayrollStatus;
  const st = PAYROLL_STATUS[status];
  const isDraft = status === "draft";

  return (
    <div className="space-y-5">
      <BackLink href="/payroll">เงินเดือน</BackLink>
      <PageHeader
        title={`งวด ${periodLabel(period.year, period.month)}`}
        description={`${thaiDate(period.start_date)} – ${thaiDate(period.end_date)} · จ่ายวันที่ ${thaiDate(period.pay_date)}`}
      >
        <Badge tone={st.tone}>{st.label}</Badge>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <Card className="rise flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
        <Stepper status={status} />
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <>
              <form action={recalculate}>
                <input type="hidden" name="id" value={id} />
                <SubmitButton variant="secondary">คำนวณใหม่</SubmitButton>
              </form>
              <form action={setStatus}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="status" value="reviewed" />
                <SubmitButton confirm="ยืนยันว่าตรวจครบแล้ว และส่งให้ CEO อนุมัติ?">ตรวจแล้ว ส่ง CEO</SubmitButton>
              </form>
            </>
          )}
          {status === "reviewed" && role === "ceo" && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="approved" />
              <SubmitButton variant="success" confirm="อนุมัติเงินเดือนงวดนี้? พนักงานจะเห็นสลิปทันที">อนุมัติเงินเดือน</SubmitButton>
            </form>
          )}
          {status === "approved" && role === "ceo" && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="closed" />
              <SubmitButton confirm="ปิดงวดแล้วจะแก้ไขไม่ได้อีก ยืนยัน?">ปิดงวด (จ่ายเงินแล้ว)</SubmitButton>
            </form>
          )}
          {(status === "reviewed" || (status === "approved" && role === "ceo")) && (
            <form action={setStatus}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="draft" />
              <SubmitButton variant="secondary" confirm="ย้อนกลับเป็นร่างเพื่อแก้ไข?">ย้อนกลับไปแก้ไข</SubmitButton>
            </form>
          )}
        </div>
      </Card>

      {isDraft && missing.length > 0 && (
        <p className="rise rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          ยังไม่ได้ตั้งเงินเดือน {missing.length} คน จึงยังไม่มีสลิป: {missing.map((e) => `${e.code} ${e.first_name}`).join(", ")} ·{" "}
          <Link href="/payroll/salaries" className="font-medium underline">ไปตั้งเงินเดือน</Link>
        </p>
      )}

      <section className="rise grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="รายได้รวม" value={baht(sum("gross"))} sub={`OT ${baht(sum("ot_amount"))}`} />
        <Stat label="ประกันสังคม (พนักงาน)" value={baht(sum("sso_employee"))} />
        <Stat label="ประกันสังคม (บริษัทสมทบ)" value={baht(sum("sso_employer"))} />
        <Stat label="ภาษีหัก ณ ที่จ่าย" value={baht(sum("tax"))} />
        <Stat label="รับสุทธิรวม" value={baht(sum("net"))} sub={`${slips.length} คน`} />
      </section>

      {plan && <TransferCard id={id} plan={plan} ready={canTransfer} />}

      <Card className="rise overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-zinc-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">สลิปรายคน</h2>
            <p className="text-[13px] text-zinc-400">{isDraft ? "กดที่ชื่อเพื่อดูรายละเอียด หรือเพิ่มรายการหัก/เพิ่มเอง" : "กดที่ชื่อเพื่อดูสลิป"}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-[13px]">
            <a href={`/payroll/${id}/export?type=summary`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50">สรุปเงินเดือน (Excel)</a>
            <a href={`/payroll/${id}/export?type=sso`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50">ประกันสังคม สปส.1-10</a>
            <a href={`/payroll/${id}/export?type=pnd1`} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-zinc-600 hover:bg-zinc-50">ภ.ง.ด.1</a>
          </div>
        </div>
        {slips.length === 0 ? (
          <EmptyState title="ยังไม่มีสลิป" hint="ตั้งเงินเดือนพนักงานแล้วกดคำนวณใหม่" />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-right text-[13px]">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] text-zinc-400">
                    <th className="py-2 pl-4 pr-3 text-left font-medium">พนักงาน</th>
                    <th className="px-3 py-2 font-medium">เงินเดือน</th>
                    <th className="px-3 py-2 font-medium">OT</th>
                    <th className="px-3 py-2 font-medium">เบี้ยเลี้ยง/อื่น ๆ</th>
                    <th className="px-3 py-2 font-medium">หัก</th>
                    <th className="px-3 py-2 font-medium">ประกันสังคม</th>
                    <th className="px-3 py-2 font-medium">ภาษี</th>
                    <th className="py-2 pl-3 pr-4 font-medium">รับสุทธิ</th>
                  </tr>
                </thead>
                <tbody className="tabular divide-y divide-zinc-100">
                  {slips.map((s) => (
                    <tr key={s.id} className="transition-colors hover:bg-zinc-50/70">
                      <td className="py-2 pl-4 pr-3 text-left">
                        <Link href={`/payslips/${s.id}`} className="flex items-center gap-3">
                          <Avatar first={s.employees?.first_name} last={s.employees?.last_name} seed={s.employees?.code} size="sm" />
                          <span>
                            <span className="block font-medium text-zinc-900">{s.employees?.first_name} {s.employees?.last_name}</span>
                            <span className="block text-xs text-zinc-400">{s.employees?.code}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2">{baht(s.salary_paid)}</td>
                      <td className="px-3 py-2">
                        {Number(s.ot_amount) > 0 ? baht(s.ot_amount) : <span className="text-zinc-300">-</span>}
                        {Number(s.ot_hours) > 0 && <span className="block text-xs text-zinc-400">{Number(s.ot_hours)} ชม.</span>}
                      </td>
                      <td className="px-3 py-2">{Number(s.allowances) + Number(s.other_earnings) > 0 ? baht(Number(s.allowances) + Number(s.other_earnings)) : <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2 text-rose-600">{Number(s.deductions) > 0 ? `-${baht(s.deductions)}` : <span className="text-zinc-300">-</span>}</td>
                      <td className="px-3 py-2 text-zinc-600">-{baht(s.sso_employee)}</td>
                      <td className="px-3 py-2 text-zinc-600">{Number(s.tax) > 0 ? `-${baht(s.tax)}` : <span className="text-zinc-300">-</span>}</td>
                      <td className="py-2 pl-3 pr-4 font-semibold text-zinc-900">{baht(s.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-zinc-100 md:hidden">
              {slips.map((s) => (
                <li key={s.id}>
                  <Link href={`/payslips/${s.id}`} className="flex items-center gap-3 p-4">
                    <Avatar first={s.employees?.first_name} last={s.employees?.last_name} seed={s.employees?.code} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.employees?.first_name} {s.employees?.last_name}</p>
                      <p className="tabular text-xs text-zinc-400">รายได้ {baht(s.gross)} · OT {baht(s.ot_amount)}</p>
                    </div>
                    <p className="tabular font-semibold">฿{baht(s.net)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      {isDraft && (
        <form action={deletePeriod} className="text-right">
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="danger" size="sm" confirm="ลบงวดนี้และสลิปทั้งหมดในงวด?">ลบงวดนี้</SubmitButton>
        </form>
      )}
    </div>
  );
}

function TransferCard({ id, plan, ready }: { id: string; plan: Awaited<ReturnType<typeof loadTransferPlan>>; ready: boolean }) {
  const blocked = plan.problems.length > 0;
  return (
    <Card className="rise p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-semibold">ไฟล์โอนเงินเดือนเข้าบัญชี</h2>
        <Link href="/payroll/settings#bank" className="text-[13px] text-zinc-500 hover:text-zinc-900">ตั้งค่าบัญชีบริษัท</Link>
      </div>
      <p className="text-[13px] text-zinc-400">
        {ready ? "ดาวน์โหลดแล้วนำไปอัปโหลดในระบบจ่ายเงินเดือนของธนาคาร" : "ดาวน์โหลดได้หลัง CEO อนุมัติเงินเดือนงวดนี้"}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(Object.keys(PAYERS) as Payer[]).map((p) => {
          const rows = plan.byPayer[p];
          const total = rows.reduce((s, r) => s + r.amount, 0);
          const other = rows.filter((r) => r.bankCode !== PAYERS[p].bankCode).length;
          const enabled = ready && !blocked && rows.length > 0;
          return (
            <div key={p} className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50/70 px-3 py-2.5 ring-1 ring-inset ring-zinc-100">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-zinc-900">{PAYERS[p].label}</p>
                <p className="tabular text-xs text-zinc-500">
                  {rows.length} คน · ฿{baht(total)}
                  {other > 0 && ` · ต่างธนาคาร ${other} คน`}
                </p>
              </div>
              {enabled ? (
                <a href={`/payroll/${id}/export?type=bank&bank=${p}`} className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-zinc-700">
                  ดาวน์โหลด
                </a>
              ) : (
                <span className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-300">ดาวน์โหลด</span>
              )}
            </div>
          );
        })}
      </div>
      {blocked && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">
          <p className="font-medium">ข้อมูลบัญชียังไม่ครบ {plan.problems.length} คน ต้องแก้ก่อนจึงจะดาวน์โหลดได้</p>
          <ul className="mt-1 space-y-0.5">
            {plan.problems.map((x) => (
              <li key={x.employeeId}>
                <Link href={`/employees/${x.employeeId}`} className="underline">{x.code} {x.name}</Link> · {x.problem}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

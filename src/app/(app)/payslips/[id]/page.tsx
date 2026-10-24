import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { thaiDate } from "@/lib/format";
import { periodLabel } from "@/lib/payroll/calc";
import { PAYROLL_STATUS, type PayrollStatus } from "@/lib/payroll/labels";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Field, PrintButton, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice, baht } from "@/components/notice";
import { addManualItem, removeManualItem } from "../actions";

type Item = { id: string; kind: "earning" | "deduction"; label: string; quantity: number | null; rate: number | null; amount: number; manual: boolean; sort: number; taxable: boolean };

const NOTE_LABEL: Record<string, string> = {
  hourly_rate: "ค่าจ้างต่อชั่วโมง",
  months_remaining: "จำนวนเดือนที่เหลือในปี (รวมเดือนนี้)",
  months_estimated: "เดือนก่อนหน้าที่ไม่มีสลิปในระบบ (ประมาณเท่าเดือนนี้)",
  annual_income_estimate: "ประมาณเงินได้ทั้งปี",
  expense_deduction: "หักค่าใช้จ่าย",
  allowances_total: "ค่าลดหย่อนรวม (รวมประกันสังคมทั้งปี)",
  net_taxable_income: "เงินได้สุทธิทั้งปี",
  annual_tax_estimate: "ภาษีทั้งปีโดยประมาณ",
  tax_paid_before: "ภาษีที่หักไปแล้วปีนี้",
};

function Lines({ title, items, total, negative, canEdit, slipId, periodId }: { title: string; items: Item[]; total: number; negative?: boolean; canEdit: boolean; slipId: string; periodId: string }) {
  return (
    <div>
      <h3 className="text-[13px] font-medium text-zinc-400">{title}</h3>
      <ul className="mt-2 divide-y divide-zinc-100">
        {items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              {it.label}
              {it.quantity != null && it.rate != null && (
                <span className="tabular ml-2 text-xs text-zinc-400">
                  {Number(it.quantity)} × {baht(it.rate)}
                </span>
              )}
              {it.manual && <span className="ml-2 text-xs text-zinc-400">(เพิ่มเอง{it.taxable ? "" : " · ไม่คิดภาษี"})</span>}
            </span>
            <span className="flex items-center gap-2">
              <span className={`tabular ${negative ? "text-rose-600" : ""}`}>{negative ? "-" : ""}{baht(it.amount)}</span>
              {canEdit && it.manual && (
                <form action={removeManualItem} className="print:hidden">
                  <input type="hidden" name="item_id" value={it.id} />
                  <input type="hidden" name="payslip_id" value={slipId} />
                  <input type="hidden" name="period_id" value={periodId} />
                  <button title="ลบ" className="text-xs text-zinc-300 hover:text-rose-600">✕</button>
                </form>
              )}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="py-2.5 text-sm text-zinc-300">-</li>}
      </ul>
      <div className="mt-1 flex justify-between border-t border-zinc-200 pt-2.5 text-sm font-semibold">
        <span>รวม</span>
        <span className="tabular">{negative ? "-" : ""}{baht(total)}</span>
      </div>
    </div>
  );
}

export default async function PayslipPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  const isAdmin = role === "ceo" || role === "accounting";

  // RLS: พนักงานเห็นเฉพาะสลิปตัวเองที่ CEO อนุมัติแล้ว
  const { data: slip } = await supabase
    .from("payslips")
    .select("*, employees(code, first_name, last_name, national_id, bank_name, bank_account, departments(name)), payroll_periods(id, year, month, start_date, end_date, pay_date, status), payslip_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (!slip) notFound();

  const e = slip.employees as { code: string; first_name: string; last_name: string; national_id: string | null; bank_name: string | null; bank_account: string | null; departments: { name: string } | null };
  const p = slip.payroll_periods as { id: string; year: number; month: number; start_date: string; end_date: string; pay_date: string | null; status: PayrollStatus };
  const items = ((slip.payslip_items ?? []) as Item[]).sort((a, b) => a.sort - b.sort);
  const earnings = items.filter((i) => i.kind === "earning");
  const deductions = items.filter((i) => i.kind === "deduction");
  const totalDeductions = Number(slip.deductions) + Number(slip.sso_employee) + Number(slip.tax);
  const canEdit = isAdmin && p.status === "draft";
  const note = (slip.calc_note ?? {}) as Record<string, number>;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <BackLink href={isAdmin ? `/payroll/${p.id}` : "/payslips"}>{isAdmin ? `งวด ${periodLabel(p.year, p.month)}` : "สลิปเงินเดือน"}</BackLink>
      </div>
      <PageHeader eyebrow={`สลิปเงินเดือน · ${periodLabel(p.year, p.month)}`} title={`${e.first_name} ${e.last_name}`} description={`${e.code} · ${e.departments?.name ?? "ไม่ระบุแผนก"}`}>
        <div className="flex items-center gap-2 print:hidden">
          {isAdmin && <Badge tone={PAYROLL_STATUS[p.status].tone}>{PAYROLL_STATUS[p.status].label}</Badge>}
          <PrintButton />
        </div>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="rise p-5 lg:col-span-2 print:border-0 print:shadow-none">
          <div className="grid gap-8 sm:grid-cols-2">
            <Lines title="รายได้" items={earnings} total={Number(slip.gross)} canEdit={canEdit} slipId={id} periodId={p.id} />
            <Lines title="รายการหัก" items={deductions} total={totalDeductions} negative canEdit={canEdit} slipId={id} periodId={p.id} />
          </div>
          <div className="mt-6 flex items-end justify-between rounded-xl bg-zinc-900 px-5 py-4 text-white">
            <div>
              <p className="text-[13px] text-zinc-400">รับสุทธิ</p>
              <p className="text-xs text-zinc-500">จ่ายวันที่ {thaiDate(p.pay_date)}{e.bank_account ? ` · ${e.bank_name ?? ""} ${e.bank_account}` : ""}</p>
            </div>
            <p className="tabular text-2xl font-semibold tracking-tight">฿{baht(slip.net)}</p>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-zinc-400">เงินได้สะสมทั้งปี</dt>
              <dd className="tabular mt-1 font-medium">{baht(slip.ytd_income)}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">ภาษีสะสมทั้งปี</dt>
              <dd className="tabular mt-1 font-medium">{baht(slip.ytd_tax)}</dd>
            </div>
            <div>
              <dt className="text-zinc-400">ประกันสังคมสะสม</dt>
              <dd className="tabular mt-1 font-medium">{baht(slip.ytd_sso)}</dd>
            </div>
          </dl>
        </Card>

        {isAdmin && (
          <div className="space-y-4 print:hidden">
            {canEdit && (
              <Card className="rise p-4">
                <h2 className="font-semibold">เพิ่มรายการเอง</h2>
                <p className="text-[13px] text-zinc-400">เช่น หักขาดงาน หักมาสาย โบนัส ค่าคอมมิชชั่น</p>
                <form action={addManualItem} className="mt-4 space-y-3">
                  <input type="hidden" name="payslip_id" value={id} />
                  <input type="hidden" name="period_id" value={p.id} />
                  <Field label="ประเภท">
                    <select name="kind" className={inputClass} defaultValue="deduction">
                      <option value="deduction">รายการหัก</option>
                      <option value="earning">รายได้เพิ่ม</option>
                    </select>
                  </Field>
                  <Field label="ชื่อรายการ">
                    <input name="label" required className={inputClass} placeholder="เช่น หักขาดงาน 1 วัน" />
                  </Field>
                  <Field label="จำนวนเงิน (บาท)">
                    <input name="amount" type="number" step="0.01" min="0.01" required className={inputClass} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input type="checkbox" name="taxable" defaultChecked className="size-4 rounded" />
                    นำไปคิดภาษีและประกันสังคม
                  </label>
                  <SubmitButton className="w-full">เพิ่มและคำนวณใหม่</SubmitButton>
                </form>
              </Card>
            )}
            <Card className="rise p-4">
              <h2 className="font-semibold">ที่มาของภาษีเดือนนี้</h2>
              <p className="text-[13px] text-zinc-400">ประมาณทั้งปีแล้วเฉลี่ยในเดือนที่เหลือ</p>
              <dl className="mt-3 space-y-2 text-sm">
                {Object.entries(NOTE_LABEL).map(([k, label]) =>
                  note[k] == null ? null : (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-zinc-500">{label}</dt>
                      <dd className="tabular font-medium">{k.startsWith("months_") ? note[k] : baht(note[k])}</dd>
                    </div>
                  ),
                )}
                <div className="flex justify-between gap-3 border-t border-zinc-100 pt-2">
                  <dt className="text-zinc-500">บริษัทสมทบประกันสังคม</dt>
                  <dd className="tabular font-medium">{baht(slip.sso_employer)}</dd>
                </div>
              </dl>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

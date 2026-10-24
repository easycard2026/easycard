import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { Avatar, Card, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice, baht } from "@/components/notice";
import { addAllowance, addSalary, deleteAllowance, deleteSalary, saveTaxProfile } from "../actions";

export default async function EmployeePayPage({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { employeeId: id } = await params;
  const sp = await searchParams;
  const { supabase, role, employeeId: me } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/");

  const [{ data: emp }, { data: history }, { data: allowances }, { data: tax }, { data: settings }] = await Promise.all([
    supabase.from("employees").select("id, code, first_name, last_name, start_date, probation_status, probation_end_date").eq("id", id).maybeSingle(),
    supabase.from("salary_history").select("id, monthly_salary, effective_date, note").eq("employee_id", id).order("effective_date", { ascending: false }),
    supabase.from("recurring_allowances").select("id, name, amount, taxable").eq("employee_id", id).eq("active", true).order("created_at"),
    supabase.from("tax_profiles").select("*").eq("employee_id", id).maybeSingle(),
    supabase.from("payroll_settings").select("days_per_month, hours_per_day").single(),
  ]);
  if (!emp) notFound();

  const readOnly = role === "accounting" && id === me;
  const today = todayBangkok();
  const current = (history ?? []).find((h) => h.effective_date <= today);
  const hourly = current && settings ? Number(current.monthly_salary) / Number(settings.days_per_month) / Number(settings.hours_per_day) : null;

  return (
    <div className="space-y-5">
      <BackLink href="/payroll/salaries">ตั้งเงินเดือนพนักงาน</BackLink>
      <PageHeader title={`${emp.first_name} ${emp.last_name}`} description={`${emp.code} · เริ่มงาน ${thaiDate(emp.start_date)}`}>
        <Avatar first={emp.first_name} last={emp.last_name} seed={emp.code} size="sm" />
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />
      {readOnly && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          นี่คือข้อมูลของคุณเอง ฝ่ายบัญชีแก้เงินเดือนตัวเองไม่ได้ ต้องให้ CEO แก้
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="rise p-4">
          <h2 className="font-semibold">เงินเดือน</h2>
          <p className="tabular text-[13px] text-zinc-400">
            {current ? `ปัจจุบัน ฿${baht(current.monthly_salary)} · ชั่วโมงละ ${baht(hourly)} บาท` : "ยังไม่ได้ตั้งเงินเดือน"}
          </p>
          {!readOnly && (
            <form action={addSalary} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="employee_id" value={id} />
              <Field label="เงินเดือน (บาท/เดือน)">
                <input name="monthly_salary" type="number" step="0.01" min="0" required className={inputClass} />
              </Field>
              <Field label="มีผลตั้งแต่">
                <input name="effective_date" type="date" required defaultValue={current ? today : emp.start_date} className={inputClass} />
              </Field>
              <Field label="หมายเหตุ" className="sm:col-span-2">
                <input name="note" className={inputClass} placeholder="เช่น ปรับหลังผ่านทดลองงาน" />
              </Field>
              <SubmitButton className="sm:col-span-2">บันทึกเงินเดือน</SubmitButton>
            </form>
          )}
          <h3 className="mt-6 text-[13px] font-medium text-zinc-400">ประวัติ</h3>
          <ul className="mt-1 divide-y divide-zinc-100">
            {(history ?? []).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  {thaiDate(h.effective_date)}
                  {h.note && <span className="ml-2 text-xs text-zinc-400">{h.note}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular font-medium">฿{baht(h.monthly_salary)}</span>
                  {!readOnly && (
                    <form action={deleteSalary}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="employee_id" value={id} />
                      <button title="ลบ" className="text-xs text-zinc-300 hover:text-rose-600">✕</button>
                    </form>
                  )}
                </span>
              </li>
            ))}
            {!history?.length && <li className="py-2.5 text-sm text-zinc-300">-</li>}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card className="rise p-4">
            <h2 className="font-semibold">เบี้ยเลี้ยงประจำทุกเดือน</h2>
            <p className="text-[13px] text-zinc-400">เช่น ค่ากะ ค่าเดินทาง เบี้ยขยัน</p>
            <ul className="mt-3 divide-y divide-zinc-100">
              {(allowances ?? []).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    {a.name}
                    {!a.taxable && <span className="ml-2 text-xs text-zinc-400">ไม่คิดภาษี</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular font-medium">฿{baht(a.amount)}</span>
                    {!readOnly && (
                      <form action={deleteAllowance}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="employee_id" value={id} />
                        <button title="ลบ" className="text-xs text-zinc-300 hover:text-rose-600">✕</button>
                      </form>
                    )}
                  </span>
                </li>
              ))}
              {!allowances?.length && <li className="py-2.5 text-sm text-zinc-300">ไม่มี</li>}
            </ul>
            {!readOnly && (
              <form action={addAllowance} className="mt-3 grid grid-cols-[1fr_8rem] gap-3">
                <input type="hidden" name="employee_id" value={id} />
                <input name="name" required placeholder="ชื่อเบี้ยเลี้ยง" className={inputClass} />
                <input name="amount" type="number" step="0.01" min="0.01" required placeholder="บาท" className={inputClass} />
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  <input type="checkbox" name="taxable" defaultChecked className="size-4 rounded" />
                  คิดภาษีและประกันสังคม
                </label>
                <SubmitButton size="sm" variant="secondary">เพิ่ม</SubmitButton>
              </form>
            )}
          </Card>

          <Card className="rise p-4">
            <h2 className="font-semibold">ค่าลดหย่อนภาษี</h2>
            <p className="text-[13px] text-zinc-400">ตามที่พนักงานแจ้ง (ล.ย.01) ค่าลดหย่อนส่วนตัว 60,000 บาทใส่ให้ทุกคนอยู่แล้ว</p>
            <form action={saveTaxProfile} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="employee_id" value={id} />
              <label className="flex items-center gap-2 text-sm text-zinc-700 sm:col-span-2">
                <input type="checkbox" name="spouse_no_income" defaultChecked={tax?.spouse_no_income ?? false} disabled={readOnly} className="size-4 rounded" />
                คู่สมรสไม่มีเงินได้
              </label>
              <Field label="จำนวนบุตร">
                <input name="children" type="number" min="0" defaultValue={tax?.children ?? 0} disabled={readOnly} className={inputClass} />
              </Field>
              <Field label="บิดามารดาที่อุปการะ (คน)">
                <input name="parents" type="number" min="0" max="4" defaultValue={tax?.parents ?? 0} disabled={readOnly} className={inputClass} />
              </Field>
              <Field label="ลดหย่อนอื่น ๆ ต่อปี (บาท)" hint="ประกันชีวิต กองทุน ดอกเบี้ยบ้าน ฯลฯ รวมกัน" className="sm:col-span-2">
                <input name="other_deductions" type="number" step="0.01" min="0" defaultValue={tax?.other_deductions ?? 0} disabled={readOnly} className={inputClass} />
              </Field>
              {!readOnly && <SubmitButton variant="secondary" className="sm:col-span-2">บันทึกค่าลดหย่อน</SubmitButton>}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

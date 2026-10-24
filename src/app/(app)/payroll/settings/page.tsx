import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { PAYERS } from "@/lib/payroll/bank";
import { saveBankSettings, saveSettings } from "./actions";

function Num({ name, label, value, hint, step = "any" }: { name: string; label: string; value: number | string; hint?: string; step?: string }) {
  return (
    <Field label={label} hint={hint}>
      <input name={name} type="number" step={step} min="0" required defaultValue={value} className={inputClass} />
    </Field>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/");
  const [{ data: s }, { data: bank }] = await Promise.all([
    supabase.from("payroll_settings").select("*").single(),
    supabase.from("payroll_bank_settings").select("*").maybeSingle(),
  ]);
  if (!s) return null;
  const brackets = (s.tax_brackets as { upto: number | null; rate: number }[]) ?? [];
  const rows = [...brackets, ...Array(Math.max(0, 10 - brackets.length)).fill(null)];

  return (
    <div className="space-y-5">
      <BackLink href="/payroll">เงินเดือน</BackLink>
      <PageHeader title="ค่าตั้งค่าการคำนวณ" description="อัตรา OT ประกันสังคม และภาษี แก้ได้เมื่อกฎหมายเปลี่ยน โดยไม่ต้องแก้โปรแกรม" />
      <Notice ok={sp.ok} error={sp.error} />
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
        ตัวเลขตั้งต้นเขียนจากความรู้ทั่วไป ควรให้ฝ่ายบัญชีตรวจก่อนจ่ายเงินเดือนจริง โดยเฉพาะฐานประกันสังคม อัตรา OT และขั้นภาษี
      </p>

      <form action={saveSettings} className="space-y-4">
        <Card className="rise p-4">
          <h2 className="font-semibold">ค่าจ้างและ OT</h2>
          <p className="text-[13px] text-zinc-400">ค่าจ้างต่อชั่วโมง = เงินเดือน ÷ วันต่อเดือน ÷ ชั่วโมงต่อวัน</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Num name="days_per_month" label="วันต่อเดือน" value={s.days_per_month} />
            <Num name="hours_per_day" label="ชั่วโมงต่อวัน" value={s.hours_per_day} />
            <Num name="ot_round_minutes" label="ปัด OT ลงทีละ (นาที)" value={s.ot_round_minutes} step="1" />
            <Num name="ot_rate_workday" label="OT หลังเลิกงาน (เท่า)" value={s.ot_rate_workday} />
            <Num name="ot_rate_holiday_work" label="ทำงานวันหยุด (เท่า)" value={s.ot_rate_holiday_work} hint="จ่ายเพิ่มจากเงินเดือน" />
            <Num name="ot_rate_holiday_ot" label="OT วันหยุด (เท่า)" value={s.ot_rate_holiday_ot} />
          </div>
        </Card>

        <Card className="rise p-4">
          <h2 className="font-semibold">ประกันสังคม</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Num name="sso_rate_pct" label="อัตราหัก (%)" value={Number(s.sso_rate) * 100} />
            <Num name="sso_min_base" label="ฐานค่าจ้างต่ำสุด (บาท)" value={s.sso_min_base} />
            <Num name="sso_max_base" label="ฐานค่าจ้างสูงสุด (บาท)" value={s.sso_max_base} />
          </div>
        </Card>

        <Card className="rise p-4">
          <h2 className="font-semibold">ภาษีเงินได้บุคคลธรรมดา</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Num name="expense_rate_pct" label="หักค่าใช้จ่าย (%)" value={Number(s.expense_rate) * 100} />
            <Num name="expense_cap" label="หักค่าใช้จ่ายไม่เกิน (บาท)" value={s.expense_cap} />
            <Num name="personal_allowance" label="ลดหย่อนส่วนตัว (บาท)" value={s.personal_allowance} />
            <Num name="spouse_allowance" label="ลดหย่อนคู่สมรส (บาท)" value={s.spouse_allowance} />
            <Num name="child_allowance" label="ลดหย่อนบุตร ต่อคน (บาท)" value={s.child_allowance} />
            <Num name="parent_allowance" label="ลดหย่อนบิดามารดา ต่อคน (บาท)" value={s.parent_allowance} />
          </div>
          <h3 className="mt-6 text-[13px] font-medium text-zinc-700">ขั้นบันไดภาษี (เงินได้สุทธิทั้งปี)</h3>
          <p className="text-xs text-zinc-400">ขั้นสุดท้ายเว้นช่อง &quot;ถึง&quot; ว่างไว้ = ส่วนที่เกิน · ขั้นที่ไม่ใช้ให้เว้นอัตราว่าง</p>
          <div className="mt-3 grid gap-2">
            <div className="grid grid-cols-[2rem_1fr_7rem] gap-3 text-xs text-zinc-400">
              <span>ขั้น</span>
              <span>ถึง (บาท)</span>
              <span>อัตรา (%)</span>
            </div>
            {rows.map((b, i) => (
              <div key={i} className="grid grid-cols-[2rem_1fr_7rem] items-center gap-3">
                <span className="text-sm text-zinc-400">{i + 1}</span>
                <input name={`upto_${i}`} type="number" min="0" defaultValue={b?.upto ?? ""} className={`${inputClass} h-10`} />
                <input name={`rate_${i}`} type="number" min="0" max="100" step="any" defaultValue={b ? Math.round(b.rate * 10000) / 100 : ""} className={`${inputClass} h-10`} />
              </div>
            ))}
          </div>
        </Card>

        <div className="flex justify-end">
          <SubmitButton>บันทึกค่าตั้งค่า</SubmitButton>
        </div>
      </form>

      <form action={saveBankSettings} id="bank" className="space-y-4">
        <Card className="rise p-4">
          <h2 className="font-semibold">บัญชีบริษัทสำหรับโอนเงินเดือน</h2>
          <p className="text-[13px] text-zinc-400">ใช้ในไฟล์โอนเงินเดือน รหัสบริษัทคือรหัสที่ธนาคารให้มาตอนสมัครบริการจ่ายเงินเดือน (ถ้ามี) เห็นเฉพาะ CEO และบัญชี</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อบริษัท">
              <input name="company_name" defaultValue={bank?.company_name ?? ""} className={inputClass} />
            </Field>
            <Field label="พนักงานที่ใช้ธนาคารอื่น โอนจาก" hint="พนักงาน SCB โอนจาก SCB พนักงานกสิกรโอนจากกสิกรเสมอ">
              <select name="other_bank_payer" defaultValue={bank?.other_bank_payer ?? "kbank"} className={inputClass}>
                {(Object.keys(PAYERS) as (keyof typeof PAYERS)[]).map((k) => (
                  <option key={k} value={k}>{PAYERS[k].label}</option>
                ))}
              </select>
            </Field>
            <Field label="เลขบัญชีบริษัท SCB">
              <input name="scb_account" inputMode="numeric" defaultValue={bank?.scb_account ?? ""} className={inputClass} />
            </Field>
            <Field label="รหัสบริษัท SCB">
              <input name="scb_company_id" defaultValue={bank?.scb_company_id ?? ""} className={inputClass} />
            </Field>
            <Field label="เลขบัญชีบริษัท กสิกรไทย">
              <input name="kbank_account" inputMode="numeric" defaultValue={bank?.kbank_account ?? ""} className={inputClass} />
            </Field>
            <Field label="รหัสบริษัท กสิกรไทย">
              <input name="kbank_company_id" defaultValue={bank?.kbank_company_id ?? ""} className={inputClass} />
            </Field>
          </div>
        </Card>
        <div className="flex justify-end">
          <SubmitButton>บันทึกบัญชีบริษัท</SubmitButton>
        </div>
      </form>
    </div>
  );
}

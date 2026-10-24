"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const NUM_FIELDS = [
  "days_per_month", "hours_per_day", "ot_rate_workday", "ot_rate_holiday_work", "ot_rate_holiday_ot", "ot_round_minutes",
  "sso_min_base", "sso_max_base", "expense_cap", "personal_allowance", "spouse_allowance", "child_allowance", "parent_allowance",
] as const;

export async function saveSettings(formData: FormData) {
  const { supabase } = await getSession();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of NUM_FIELDS) {
    const v = Number(formData.get(k));
    if (!Number.isFinite(v) || v < 0) back("/payroll/settings", "error", "ตัวเลขไม่ถูกต้อง");
    update[k] = v;
  }
  // หักเงินมาสาย ออกก่อน ขาดงาน
  update.late_deduct = formData.get("late_deduct") === "on";
  update.early_deduct = formData.get("early_deduct") === "on";
  update.absent_deduct = formData.get("absent_deduct") === "on";
  const lateAbsent = String(formData.get("late_absent_minutes") ?? "").trim();
  if (lateAbsent !== "" && !(Number.isInteger(Number(lateAbsent)) && Number(lateAbsent) > 0)) {
    back("/payroll/settings", "error", "นาทีที่นับเป็นขาดงานต้องเป็นเลขจำนวนเต็มมากกว่า 0 หรือเว้นว่าง");
  }
  update.late_absent_minutes = lateAbsent === "" ? null : Number(lateAbsent);

  // ช่องที่เป็นเปอร์เซ็นต์
  update.sso_rate = Number(formData.get("sso_rate_pct")) / 100;
  update.expense_rate = Number(formData.get("expense_rate_pct")) / 100;

  const brackets: { upto: number | null; rate: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const rate = formData.get(`rate_${i}`);
    if (rate == null || rate === "") continue;
    const upto = String(formData.get(`upto_${i}`) ?? "");
    brackets.push({ upto: upto === "" ? null : Number(upto), rate: Number(rate) / 100 });
  }
  if (!brackets.length || brackets[brackets.length - 1].upto !== null) {
    back("/payroll/settings", "error", "ขั้นภาษีขั้นสุดท้ายต้องเว้นช่อง \"ถึง\" ว่างไว้ (คือส่วนที่เกิน)");
  }
  for (let i = 1; i < brackets.length - 1; i++) {
    if ((brackets[i].upto ?? 0) <= (brackets[i - 1].upto ?? 0)) back("/payroll/settings", "error", "ขั้นภาษีต้องเรียงจากน้อยไปมาก");
  }
  update.tax_brackets = brackets;

  const { error, count } = await supabase.from("payroll_settings").update(update, { count: "exact" }).eq("id", true);
  if (error || !count) back("/payroll/settings", "error", "บันทึกไม่สำเร็จ");
  revalidatePath("/payroll/settings");
  back("/payroll/settings", "ok", "บันทึกค่าตั้งค่าแล้ว มีผลกับการคำนวณครั้งถัดไป");
}

export async function saveBankSettings(formData: FormData) {
  const { supabase } = await getSession();
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const digits = (k: string) => (text(k) ?? "").replace(/\D/g, "") || null;
  const payer = text("other_bank_payer");
  if (payer !== "scb" && payer !== "kbank") back("/payroll/settings", "error", "เลือกธนาคารที่ใช้โอนให้พนักงานธนาคารอื่น");
  for (const k of ["scb_account", "kbank_account"]) {
    const v = digits(k);
    if (v && v.length !== 10) back("/payroll/settings", "error", "เลขบัญชีบริษัทต้องมี 10 หลัก");
  }
  const { error, count } = await supabase
    .from("payroll_bank_settings")
    .update(
      {
        company_name: text("company_name"),
        scb_account: digits("scb_account"),
        scb_company_id: text("scb_company_id"),
        kbank_account: digits("kbank_account"),
        kbank_company_id: text("kbank_company_id"),
        other_bank_payer: payer,
        updated_at: new Date().toISOString(),
      },
      { count: "exact" },
    )
    .eq("id", true);
  if (error || !count) back("/payroll/settings", "error", "บันทึกบัญชีบริษัทไม่สำเร็จ");
  revalidatePath("/payroll/settings");
  back("/payroll/settings", "ok", "บันทึกบัญชีบริษัทแล้ว");
}

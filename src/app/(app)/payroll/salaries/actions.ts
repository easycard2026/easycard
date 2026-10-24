"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const OWN_PAY = "บัญชีแก้เงินเดือนของตัวเองไม่ได้ ต้องให้ CEO แก้";

export async function addSalary(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/payroll/salaries/${emp}`;
  const monthly_salary = Number(formData.get("monthly_salary"));
  const effective_date = String(formData.get("effective_date") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!(monthly_salary >= 0) || !effective_date) back(path, "error", "กรุณากรอกเงินเดือนและวันที่มีผล");
  const { error } = await supabase
    .from("salary_history")
    .upsert({ employee_id: emp, monthly_salary, effective_date, note }, { onConflict: "employee_id,effective_date" });
  if (error) back(path, "error", error.code === "42501" ? OWN_PAY : "บันทึกเงินเดือนไม่สำเร็จ");
  revalidatePath(path);
  back(path, "ok", "บันทึกเงินเดือนแล้ว");
}

export async function deleteSalary(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/payroll/salaries/${emp}`;
  const { error, count } = await supabase.from("salary_history").delete({ count: "exact" }).eq("id", String(formData.get("id")));
  if (error || !count) back(path, "error", OWN_PAY);
  revalidatePath(path);
  back(path, "ok", "ลบแล้ว");
}

export async function addAllowance(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/payroll/salaries/${emp}`;
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  if (!name || !(amount > 0)) back(path, "error", "กรุณากรอกชื่อเบี้ยเลี้ยงและจำนวนเงิน");
  const { error } = await supabase
    .from("recurring_allowances")
    .insert({ employee_id: emp, name, amount, taxable: formData.get("taxable") === "on" });
  if (error) back(path, "error", error.code === "42501" ? OWN_PAY : "บันทึกไม่สำเร็จ");
  revalidatePath(path);
  back(path, "ok", "เพิ่มเบี้ยเลี้ยงแล้ว");
}

export async function deleteAllowance(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/payroll/salaries/${emp}`;
  const { error, count } = await supabase.from("recurring_allowances").delete({ count: "exact" }).eq("id", String(formData.get("id")));
  if (error || !count) back(path, "error", OWN_PAY);
  revalidatePath(path);
  back(path, "ok", "ลบเบี้ยเลี้ยงแล้ว");
}

export async function saveTaxProfile(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/payroll/salaries/${emp}`;
  const { error } = await supabase.from("tax_profiles").upsert({
    employee_id: emp,
    spouse_no_income: formData.get("spouse_no_income") === "on",
    children: Math.max(0, Math.floor(Number(formData.get("children")) || 0)),
    parents: Math.min(4, Math.max(0, Math.floor(Number(formData.get("parents")) || 0))),
    other_deductions: Math.max(0, Number(formData.get("other_deductions")) || 0),
    updated_at: new Date().toISOString(),
  });
  if (error) back(path, "error", error.code === "42501" ? OWN_PAY : "บันทึกค่าลดหย่อนไม่สำเร็จ");
  revalidatePath(path);
  back(path, "ok", "บันทึกค่าลดหย่อนแล้ว");
}

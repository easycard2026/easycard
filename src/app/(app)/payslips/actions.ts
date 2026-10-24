"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";
import { calculatePeriod } from "@/lib/payroll/run";

// เพิ่ม / ลบรายการที่บัญชีใส่เอง (เช่น หักขาดงาน โบนัส) แล้วคำนวณภาษีและประกันสังคมใหม่ทั้งงวด
export async function addManualItem(formData: FormData) {
  const { supabase } = await getSession();
  const slipId = String(formData.get("payslip_id"));
  const periodId = String(formData.get("period_id"));
  const kind = formData.get("kind") === "earning" ? "earning" : "deduction";
  const label = String(formData.get("label") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const taxable = formData.get("taxable") === "on";
  const path = `/payslips/${slipId}`;
  if (!label || !(amount > 0)) back(path, "error", "กรุณากรอกชื่อรายการและจำนวนเงินมากกว่า 0");

  const { error } = await supabase
    .from("payslip_items")
    .insert({ payslip_id: slipId, kind, code: "manual", label, amount, taxable, manual: true, sort: 100 });
  if (error) back(path, "error", "เพิ่มรายการไม่สำเร็จ (งวดอาจส่งตรวจแล้ว หรือเป็นสลิปของคุณเอง ต้องให้ CEO แก้)");
  try {
    await calculatePeriod(supabase, periodId);
  } catch (e) {
    back(path, "error", (e as Error).message);
  }
  revalidatePath(path);
  back(path, "ok", "เพิ่มรายการและคำนวณใหม่แล้ว");
}

export async function removeManualItem(formData: FormData) {
  const { supabase } = await getSession();
  const slipId = String(formData.get("payslip_id"));
  const periodId = String(formData.get("period_id"));
  const path = `/payslips/${slipId}`;
  const { error, count } = await supabase
    .from("payslip_items")
    .delete({ count: "exact" })
    .eq("id", String(formData.get("item_id")))
    .eq("manual", true);
  if (error || !count) back(path, "error", "ลบรายการไม่สำเร็จ");
  try {
    await calculatePeriod(supabase, periodId);
  } catch (e) {
    back(path, "error", (e as Error).message);
  }
  revalidatePath(path);
  back(path, "ok", "ลบรายการและคำนวณใหม่แล้ว");
}

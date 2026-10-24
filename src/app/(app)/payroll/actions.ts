"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";
import { calculatePeriod } from "@/lib/payroll/run";
import { defaultPeriodDates } from "@/lib/payroll/calc";

async function requireAdmin() {
  const s = await getSession();
  if (s.role !== "ceo" && s.role !== "accounting") redirect("/");
  return s;
}

export async function createPeriod(formData: FormData) {
  const { supabase } = await requireAdmin();
  const [y, m] = String(formData.get("month") ?? "").split("-").map(Number);
  if (!y || !m) back("/payroll", "error", "กรุณาเลือกเดือน");
  const { start_date, end_date } = defaultPeriodDates(y, m);
  const pay_date = String(formData.get("pay_date") || "") || end_date;
  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({ year: y, month: m, start_date, end_date, pay_date })
    .select("id")
    .single();
  if (error || !data) back("/payroll", "error", error?.code === "23505" ? "มีงวดของเดือนนี้อยู่แล้ว" : "สร้างงวดไม่สำเร็จ");
  try {
    await calculatePeriod(supabase, data.id);
  } catch {
    // สร้างงวดสำเร็จแล้ว คำนวณใหม่ได้จากหน้างวด
  }
  revalidatePath("/payroll");
  redirect(`/payroll/${data.id}?ok=${encodeURIComponent("สร้างงวดและคำนวณเงินเดือนแล้ว กรุณาตรวจ")}`);
}

export async function recalculate(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  let msg: string;
  try {
    const r = await calculatePeriod(supabase, id);
    msg = `คำนวณใหม่แล้ว ${r.count} คน`;
    if (r.missingSalary.length) msg += ` · ยังไม่ได้ตั้งเงินเดือน ${r.missingSalary.length} คน`;
  } catch (e) {
    back(`/payroll/${id}`, "error", (e as Error).message);
  }
  revalidatePath(`/payroll/${id}`);
  back(`/payroll/${id}`, "ok", msg);
}

const STATUS_MSG: Record<string, string> = {
  reviewed: "ส่งให้ CEO อนุมัติแล้ว",
  approved: "อนุมัติเงินเดือนแล้ว พนักงานเห็นสลิปได้แล้ว",
  closed: "ปิดงวดแล้ว สลิปถูกล็อก",
  draft: "ย้อนกลับเป็นร่างแล้ว แก้ไขและคำนวณใหม่ได้",
};

export async function setStatus(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const { error } = await supabase.rpc("set_payroll_status", { period: id, new_status: status });
  if (error) back(`/payroll/${id}`, "error", error.message);
  revalidatePath(`/payroll/${id}`);
  back(`/payroll/${id}`, "ok", STATUS_MSG[status] ?? "บันทึกแล้ว");
}

export async function deletePeriod(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  const { error, count } = await supabase.from("payroll_periods").delete({ count: "exact" }).eq("id", id).eq("status", "draft");
  if (error || !count) back(`/payroll/${id}`, "error", "ลบได้เฉพาะงวดที่เป็นร่าง");
  revalidatePath("/payroll");
  back("/payroll", "ok", "ลบงวดแล้ว");
}

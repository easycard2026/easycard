"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

export async function saveSchedule(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const shift = String(formData.get("shift_id") || "") || null;
  const off = formData.getAll("days_off").map((v) => Number(v)).filter((n) => n >= 0 && n <= 6);
  const { error } = await supabase.rpc("set_employee_schedule", { emp, shift, off });
  if (error) back("/shifts/schedule", "error", error.message);
  revalidatePath("/shifts/schedule");
  revalidatePath("/attendance");
  back("/shifts/schedule", "ok", "บันทึกกะประจำแล้ว");
}

// ตั้งกะประจำทีละหลายคน: ทั้งแผนก (CEO/บัญชี) หรือทั้งทีม (ผู้จัดการ)
export async function saveScheduleBulk(formData: FormData) {
  const { supabase, role, employeeId } = await getSession();
  const dept = String(formData.get("department_id") || "");
  const shift = String(formData.get("shift_id") || "") || null;
  const off = formData.getAll("days_off").map((v) => Number(v)).filter((n) => n >= 0 && n <= 6);

  let q = supabase.from("employees").select("id").eq("active", true);
  if (role === "manager") q = q.eq("manager_id", employeeId ?? "");
  else if (dept === "none") q = q.is("department_id", null);
  else if (dept) q = q.eq("department_id", dept);
  const { data: emps, error } = await q;
  if (error) back("/shifts/schedule", "error", error.message);
  if (!emps?.length) back("/shifts/schedule", "error", "ไม่พบพนักงานในกลุ่มที่เลือก");

  for (const e of emps) {
    const { error: err } = await supabase.rpc("set_employee_schedule", { emp: e.id, shift, off });
    if (err) back("/shifts/schedule", "error", err.message);
  }
  revalidatePath("/shifts/schedule");
  revalidatePath("/attendance");
  back("/shifts/schedule", "ok", `ตั้งกะประจำให้ ${emps.length} คนแล้ว`);
}

"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const PATH = "/employees/new";

export async function createEmployee(formData: FormData) {
  const { supabase } = await getSession();
  const s = (k: string) => String(formData.get(k) ?? "").trim();
  const row = {
    code: s("code"),
    first_name: s("first_name"),
    last_name: s("last_name"),
    start_date: s("start_date"),
    department_id: s("department_id") || null,
    position_id: s("position_id") || null,
    manager_id: s("manager_id") || null,
  };
  if (!row.code || !row.first_name || !row.last_name) back(PATH, "error", "กรุณากรอกรหัส ชื่อ และนามสกุล");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.start_date)) back(PATH, "error", "กรุณาเลือกวันเริ่มงาน");
  const { data, error } = await supabase.from("employees").insert(row).select("id").single();
  if (error || !data) {
    back(PATH, "error", error?.code === "23505" ? "รหัสพนักงานนี้มีแล้ว" : "เพิ่มพนักงานไม่สำเร็จ (เฉพาะ CEO และบัญชี)");
  }
  revalidatePath("/employees");
  revalidatePath("/users");
  if (s("next") === "account") back(`/users/new?employee=${data.id}`, "ok", `เพิ่ม ${row.first_name} แล้ว สร้างบัญชีเข้าระบบต่อได้เลย`);
  back(`/employees/${data.id}`, "ok", "เพิ่มพนักงานแล้ว");
}

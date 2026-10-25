"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";
import { dbMessage, toLoginEmail, validUsername } from "@/lib/users";
import type { Role } from "@/lib/roles";

const ROLES: Role[] = ["ceo", "accounting", "manager", "employee"];
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const role = (f: FormData) => (ROLES.includes(str(f, "role") as Role) ? (str(f, "role") as Role) : "employee");

async function admin() {
  const s = await getSession();
  if (s.role !== "ceo" && s.role !== "accounting") back("/", "error", "ไม่มีสิทธิ์จัดการผู้ใช้");
  return s;
}

export async function createUser(formData: FormData) {
  const { supabase } = await admin();
  const employee = str(formData, "employee_id");
  const retry = `/users/new${employee ? `?employee=${employee}` : ""}`;
  const username = str(formData, "username");
  if (!validUsername(username)) back(retry, "error", "ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - (3-40 ตัว) หรือใส่อีเมล");
  const { data, error } = await supabase.rpc("admin_create_user", {
    p_email: toLoginEmail(username),
    p_password: str(formData, "password"),
    p_role: role(formData),
    p_employee_id: employee || null,
    p_display_name: str(formData, "display_name"),
  });
  if (error) back(retry, "error", dbMessage(error, "สร้างบัญชีไม่สำเร็จ"));
  revalidatePath("/users");
  back(`/users/${data}`, "ok", "สร้างบัญชีแล้ว ส่งชื่อผู้ใช้และรหัสผ่านชั่วคราวให้พนักงาน ระบบจะให้ตั้งรหัสใหม่ตอนเข้าครั้งแรก");
}

export async function updateUser(formData: FormData) {
  const { supabase } = await admin();
  const id = str(formData, "id");
  const path = `/users/${id}`;
  const { error } = await supabase.rpc("admin_update_user", {
    p_user: id,
    p_role: role(formData),
    p_employee_id: str(formData, "employee_id") || null,
    p_display_name: str(formData, "display_name"),
  });
  if (error) back(path, "error", dbMessage(error, "บันทึกไม่สำเร็จ"));
  revalidatePath("/users");
  revalidatePath(path);
  back(path, "ok", "บันทึกแล้ว");
}

// ทีม: แผนกและหัวหน้าของพนักงานที่ผูกกับบัญชี
export async function updateTeam(formData: FormData) {
  const { supabase } = await admin();
  const path = `/users/${str(formData, "id")}`;
  const emp = str(formData, "employee_id");
  const manager_id = str(formData, "manager_id") || null;
  if (manager_id === emp) back(path, "error", "เลือกตัวเองเป็นหัวหน้าไม่ได้");
  const { error, count } = await supabase
    .from("employees")
    .update({ department_id: str(formData, "department_id") || null, manager_id }, { count: "exact" })
    .eq("id", emp);
  if (error || !count) back(path, "error", "บันทึกทีมไม่สำเร็จ");
  revalidatePath(path);
  revalidatePath("/employees");
  back(path, "ok", "บันทึกทีมแล้ว");
}

export async function resetPassword(formData: FormData) {
  const { supabase } = await admin();
  const id = str(formData, "id");
  const path = `/users/${id}`;
  const { error } = await supabase.rpc("admin_reset_password", { p_user: id, p_password: str(formData, "password") });
  if (error) back(path, "error", dbMessage(error, "รีเซ็ตรหัสผ่านไม่สำเร็จ"));
  revalidatePath(path);
  back(path, "ok", "ตั้งรหัสผ่านชั่วคราวแล้ว ผู้ใช้ต้องตั้งรหัสใหม่ตอนเข้าระบบครั้งถัดไป");
}

export async function setActive(formData: FormData) {
  const { supabase } = await admin();
  const id = str(formData, "id");
  const path = `/users/${id}`;
  const active = str(formData, "active") === "true";
  const { error } = await supabase.rpc("admin_set_active", { p_user: id, p_active: active });
  if (error) back(path, "error", dbMessage(error, "เปลี่ยนสถานะไม่สำเร็จ"));
  revalidatePath("/users");
  revalidatePath(path);
  back(path, "ok", active ? "เปิดใช้งานบัญชีแล้ว" : "ปิดบัญชีแล้ว ผู้ใช้นี้เข้าระบบไม่ได้จนกว่าจะเปิดอีกครั้ง");
}

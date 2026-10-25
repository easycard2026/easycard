"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";
import type { Role } from "@/lib/roles";

const PATH = "/companies";
const ROLES: Role[] = ["ceo", "accounting", "manager", "employee"];

// สลับบริษัทที่เปิดดู แล้วกลับหน้าแรก (ข้อมูลทุกหน้าเปลี่ยนตามบริษัท)
export async function switchCompany(formData: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("switch_company", { cid: String(formData.get("company_id") ?? "") });
  if (error) back("/", "error", "สลับบริษัทไม่สำเร็จ");
  revalidatePath("/", "layout");
  redirect("/");
}

export async function createCompany(formData: FormData) {
  const { supabase } = await getSession();
  const name = String(formData.get("name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").replace(/\D/g, "");
  if (!name) back(PATH, "error", "กรุณากรอกชื่อบริษัท");
  if (taxId && taxId.length !== 13) back(PATH, "error", "เลขผู้เสียภาษีต้องมี 13 หลัก");
  const { error } = await supabase.rpc("create_company", { company_name: name, company_tax_id: taxId || null });
  if (error) back(PATH, "error", error.message || "สร้างบริษัทไม่สำเร็จ");
  revalidatePath("/", "layout");
  back(PATH, "ok", `สร้าง "${name}" แล้ว และสลับมาที่บริษัทนี้ เริ่มเพิ่มพนักงานและตั้งค่าเงินเดือนได้เลย`);
}

export async function updateCompany(formData: FormData) {
  const { supabase, companyId } = await getSession();
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const name = text("name");
  const taxId = (text("tax_id") ?? "").replace(/\D/g, "") || null;
  if (!name) back(PATH, "error", "กรุณากรอกชื่อบริษัท");
  if (taxId && taxId.length !== 13) back(PATH, "error", "เลขผู้เสียภาษีต้องมี 13 หลัก");
  const { error, count } = await supabase
    .from("companies")
    .update({ name, tax_id: taxId, branch: text("branch"), address: text("address") }, { count: "exact" })
    .eq("id", companyId ?? "");
  if (error || !count) back(PATH, "error", "บันทึกไม่สำเร็จ");
  revalidatePath("/", "layout");
  back(PATH, "ok", "บันทึกข้อมูลบริษัทแล้ว");
}

export async function addMember(formData: FormData) {
  const { supabase } = await getSession();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "employee") as Role;
  if (!email) back(PATH, "error", "กรุณากรอกอีเมล");
  if (!ROLES.includes(role)) back(PATH, "error", "Role ไม่ถูกต้อง");
  const { error } = await supabase.rpc("add_company_member", { member_email: email, member_role: role });
  if (error) back(PATH, "error", error.message || "เพิ่มผู้ใช้ไม่สำเร็จ");
  revalidatePath(PATH);
  back(PATH, "ok", `เพิ่ม ${email} เข้าบริษัทแล้ว`);
}

export async function removeMember(formData: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("remove_company_member", { member: String(formData.get("user_id") ?? "") });
  if (error) back(PATH, "error", error.message || "เอาออกไม่สำเร็จ");
  revalidatePath(PATH);
  back(PATH, "ok", "เอาผู้ใช้ออกจากบริษัทนี้แล้ว");
}

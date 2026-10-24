"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const PATH = "/employees/positions";

export async function addPosition(formData: FormData) {
  const { supabase } = await getSession();
  const name = String(formData.get("name") ?? "").trim();
  const department_id = String(formData.get("department_id") ?? "") || null;
  if (!name) back(PATH, "error", "กรุณากรอกชื่อตำแหน่ง");
  const { error } = await supabase.from("positions").insert({ name, department_id });
  if (error) back(PATH, "error", error.code === "23505" ? "มีตำแหน่งชื่อนี้แล้ว" : "เพิ่มตำแหน่งไม่สำเร็จ");
  revalidatePath(PATH);
  back(PATH, "ok", `เพิ่มตำแหน่ง "${name}" แล้ว`);
}

export async function updatePosition(formData: FormData) {
  const { supabase } = await getSession();
  const name = String(formData.get("name") ?? "").trim();
  const department_id = String(formData.get("department_id") ?? "") || null;
  if (!name) back(PATH, "error", "กรุณากรอกชื่อตำแหน่ง");
  const { error, count } = await supabase
    .from("positions")
    .update({ name, department_id }, { count: "exact" })
    .eq("id", String(formData.get("id")));
  if (error || !count) back(PATH, "error", error?.code === "23505" ? "มีตำแหน่งชื่อนี้แล้ว" : "บันทึกไม่สำเร็จ");
  revalidatePath(PATH);
  back(PATH, "ok", "บันทึกแล้ว");
}

export async function deletePosition(formData: FormData) {
  const { supabase } = await getSession();
  const { error, count } = await supabase.from("positions").delete({ count: "exact" }).eq("id", String(formData.get("id")));
  if (error || !count) back(PATH, "error", "ลบตำแหน่งไม่สำเร็จ");
  revalidatePath(PATH);
  back(PATH, "ok", "ลบตำแหน่งแล้ว พนักงานในตำแหน่งนี้จะเป็น \"ไม่ระบุตำแหน่ง\"");
}

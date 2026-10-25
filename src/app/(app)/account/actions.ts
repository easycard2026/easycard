"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { dbMessage } from "@/lib/users";

export type PasswordState = { ok?: string; error?: string } | undefined;

export async function changeMyPassword(_: PasswordState, formData: FormData): Promise<PasswordState> {
  const { supabase } = await getSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next !== confirm) return { error: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" };
  const { error } = await supabase.rpc("change_my_password", { p_current: current, p_new: next });
  if (error) return { error: dbMessage(error, "เปลี่ยนรหัสผ่านไม่สำเร็จ") };
  revalidatePath("/", "layout");
  return { ok: "เปลี่ยนรหัสผ่านแล้ว ครั้งหน้าใช้รหัสใหม่เข้าระบบ" };
}

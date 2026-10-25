"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toLoginEmail } from "@/lib/users";

export async function signIn(_: { error?: string } | undefined, formData: FormData) {
  const email = toLoginEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: /banned/i.test(error.message) ? "บัญชีนี้ถูกปิดใช้งาน ติดต่อผู้ดูแลระบบ" : "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" };

  redirect("/");
}

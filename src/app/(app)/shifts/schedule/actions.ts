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

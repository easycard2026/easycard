"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

// บัญชี / CEO กรอกหรือแก้เวลาเข้า-ออกเอง (ก่อนมีไฟล์เครื่องสแกน หรือกรณีลืมสแกน)
export async function saveAttendance(formData: FormData) {
  const { supabase } = await getSession();
  const ret = String(formData.get("return") || "/attendance");
  const employee_id = String(formData.get("employee_id"));
  const work_date = String(formData.get("work_date"));
  const tin = String(formData.get("clock_in") || "");
  const tout = String(formData.get("clock_out") || "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!employee_id || !work_date || (!tin && !tout)) back(ret, "error", "กรุณากรอกเวลาเข้าหรือเวลาออกอย่างน้อยหนึ่งช่อง");

  const at = (t: string, plusDay: boolean) => {
    const d = new Date(`${work_date}T${t}:00+07:00`);
    if (plusDay) d.setTime(d.getTime() + 864e5);
    return d.toISOString();
  };
  const clock_in = tin ? at(tin, false) : null;
  // เวลาออกน้อยกว่าเวลาเข้า = ออกหลังเที่ยงคืน (วันถัดไป)
  const clock_out = tout ? at(tout, !!tin && tout <= tin) : null;

  const { error } = await supabase
    .from("attendance_days")
    .upsert({ employee_id, work_date, clock_in, clock_out, note, source: "manual", updated_at: new Date().toISOString() }, { onConflict: "employee_id,work_date" });
  if (error) back(ret, "error", "บันทึกเวลาไม่สำเร็จ");
  revalidatePath("/attendance");
  back(ret, "ok", "บันทึกเวลาแล้ว");
}

export async function deleteAttendance(formData: FormData) {
  const { supabase } = await getSession();
  const ret = String(formData.get("return") || "/attendance");
  const { error } = await supabase
    .from("attendance_days")
    .delete()
    .eq("employee_id", String(formData.get("employee_id")))
    .eq("work_date", String(formData.get("work_date")));
  if (error) back(ret, "error", "ลบไม่สำเร็จ");
  revalidatePath("/attendance");
  back(ret, "ok", "ลบเวลาของวันนั้นแล้ว");
}

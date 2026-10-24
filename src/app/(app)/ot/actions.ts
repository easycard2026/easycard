"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const OT_TYPES = ["workday", "holiday_work", "holiday_ot"];

export async function createOt(formData: FormData) {
  const { supabase, role, employeeId } = await getSession();
  const target = String(formData.get("employee_id") || employeeId || "");
  const work_date = String(formData.get("work_date") ?? "");
  const start_time = String(formData.get("start_time") ?? "");
  const end_time = String(formData.get("end_time") ?? "");
  const ot_type = String(formData.get("ot_type") ?? "workday");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!target) back("/ot", "error", "บัญชีของคุณยังไม่ได้ผูกกับข้อมูลพนักงาน");
  if (!work_date || !start_time || !end_time || !reason) back("/ot", "error", "กรุณากรอกวันที่ เวลา และเหตุผลให้ครบ");
  if (start_time === end_time) back("/ot", "error", "เวลาเริ่มและเวลาสิ้นสุดต้องไม่เท่ากัน");
  if (!OT_TYPES.includes(ot_type)) back("/ot", "error", "ประเภท OT ไม่ถูกต้อง");

  const { data, error } = await supabase
    .from("ot_requests")
    .insert({ employee_id: target, work_date, start_time, end_time, ot_type, reason })
    .select("id")
    .single();
  if (error || !data) back("/ot", "error", "ส่งคำขอไม่สำเร็จ คุณอาจไม่มีสิทธิ์ขอ OT ให้คนนี้");

  // ผู้จัดการ / CEO สั่ง OT ให้ลูกทีม = อนุมัติทันที
  const ordered = target !== employeeId && (role === "manager" || role === "ceo");
  if (ordered) {
    const { error: e2 } = await supabase.rpc("decide_ot", { request_id: data.id, approve: true, note: "สั่ง OT ล่วงหน้า" });
    if (e2) back("/ot", "error", `บันทึกแล้วแต่ยังไม่ได้อนุมัติ: ${e2.message}`);
  }
  revalidatePath("/ot");
  back("/ot", "ok", ordered ? "สั่ง OT และอนุมัติเรียบร้อย" : "ส่งคำขอ OT แล้ว รอหัวหน้าอนุมัติ");
}

export async function decideOt(formData: FormData) {
  const { supabase } = await getSession();
  const id = String(formData.get("id"));
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabase.rpc("decide_ot", { request_id: id, approve, note });
  if (error) back("/ot", "error", error.message);
  revalidatePath("/ot");
  back("/ot", "ok", approve ? "อนุมัติ OT แล้ว" : "ไม่อนุมัติ OT แล้ว");
}

export async function cancelOt(formData: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("cancel_ot", { request_id: String(formData.get("id")) });
  if (error) back("/ot", "error", error.message);
  revalidatePath("/ot");
  back("/ot", "ok", "ยกเลิกคำขอแล้ว");
}

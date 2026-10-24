"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function createLeave(formData: FormData) {
  const { supabase, role, employeeId } = await getSession();
  const target = String(formData.get("employee_id") || employeeId || "");
  const leave_type = String(formData.get("leave_type") ?? "");
  const start_date = String(formData.get("start_date") ?? "");
  const end_date = String(formData.get("end_date") || start_date);
  const part = String(formData.get("half_day") ?? "");
  const half_day = part === "am" || part === "pm" ? part : null;
  const reason = String(formData.get("reason") ?? "").trim();

  if (!target) back("/leave", "error", "บัญชีของคุณยังไม่ได้ผูกกับข้อมูลพนักงาน");
  if (!leave_type || !DATE.test(start_date) || !DATE.test(end_date) || !reason) back("/leave", "error", "กรุณากรอกประเภท วันที่ และเหตุผลให้ครบ");
  if (end_date < start_date) back("/leave", "error", "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  if (start_date.slice(0, 4) !== end_date.slice(0, 4)) back("/leave", "error", "ใบลาข้ามปีให้แยกเป็น 2 ใบ (ก่อนและหลังวันที่ 1 ม.ค.)");
  if (half_day && start_date !== end_date) back("/leave", "error", "ลาครึ่งวันได้เฉพาะการลาวันเดียว");

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({ employee_id: target, leave_type, start_date, end_date, half_day, reason })
    .select("id, days")
    .single();
  if (error || !data) back("/leave", "error", error?.message?.includes("row-level security") ? "คุณไม่มีสิทธิ์ยื่นใบลาให้คนนี้" : `ส่งใบลาไม่สำเร็จ: ${error?.message}`);

  // ผู้จัดการ / CEO บันทึกการลาให้ลูกทีม = อนุมัติทันที
  const byApprover = target !== employeeId && (role === "manager" || role === "ceo");
  if (byApprover) {
    const { error: e2 } = await supabase.rpc("decide_leave", { request_id: data.id, approve: true, note: "หัวหน้าบันทึกให้" });
    if (e2) back("/leave", "error", `บันทึกแล้วแต่ยังไม่ได้อนุมัติ: ${e2.message}`);
  }
  revalidatePath("/leave");
  back("/leave", "ok", byApprover ? `บันทึกการลา ${data.days} วัน และอนุมัติแล้ว` : `ส่งใบลา ${data.days} วันแล้ว รอหัวหน้าอนุมัติ`);
}

export async function decideLeave(formData: FormData) {
  const { supabase } = await getSession();
  const approve = formData.get("decision") === "approve";
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabase.rpc("decide_leave", { request_id: String(formData.get("id")), approve, note });
  if (error) back("/leave", "error", error.message);
  revalidatePath("/leave");
  back("/leave", "ok", approve ? "อนุมัติใบลาแล้ว" : "ไม่อนุมัติใบลาแล้ว");
}

export async function cancelLeave(formData: FormData) {
  const { supabase } = await getSession();
  const to = String(formData.get("back") || "/leave");
  const { error } = await supabase.rpc("cancel_leave", { request_id: String(formData.get("id")) });
  if (error) back(to, "error", error.message);
  revalidatePath("/leave");
  back(to, "ok", "ยกเลิกใบลาแล้ว");
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s === "" ? null : Number(s);
};

// ตั้งค่าประเภทการลา (CEO / บัญชี)
export async function saveLeaveType(formData: FormData) {
  const { supabase } = await getSession();
  const code = String(formData.get("code"));
  const row = {
    name: String(formData.get("name") ?? "").trim(),
    max_days: num(formData.get("max_days")),
    paid_days: num(formData.get("paid_days")) ?? 0,
    min_service_days: num(formData.get("min_service_days")) ?? 0,
    doc_after_days: num(formData.get("doc_after_days")),
    note: String(formData.get("note") ?? "").trim() || null,
    active: formData.get("active") === "on",
  };
  if (!row.name) back("/leave/settings", "error", "กรุณาใส่ชื่อประเภทการลา");
  const { error } = await supabase.from("leave_types").update(row).eq("code", code);
  if (error) back("/leave/settings", "error", `บันทึกไม่สำเร็จ: ${error.message}`);
  revalidatePath("/leave");
  back("/leave/settings", "ok", `บันทึก "${row.name}" แล้ว`);
}

export async function addLeaveType(formData: FormData) {
  const { supabase } = await getSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) back("/leave/settings", "error", "กรุณาใส่ชื่อประเภทการลา");
  const code = `c_${Date.now().toString(36)}`;
  const { error } = await supabase.from("leave_types").insert({
    code,
    name,
    max_days: num(formData.get("max_days")),
    paid_days: num(formData.get("paid_days")) ?? 0,
    sort: 50,
  });
  if (error) back("/leave/settings", "error", `เพิ่มไม่สำเร็จ: ${error.message}`);
  revalidatePath("/leave");
  back("/leave/settings", "ok", `เพิ่ม "${name}" แล้ว`);
}

// สิทธิ์การลารายคน
export async function saveEntitlement(formData: FormData) {
  const { supabase } = await getSession();
  const employee_id = String(formData.get("employee_id"));
  const leave_type = String(formData.get("leave_type"));
  const to = `/leave/employee/${employee_id}`;
  if (formData.get("reset") === "1") {
    const { error } = await supabase.from("leave_entitlements").delete().eq("employee_id", employee_id).eq("leave_type", leave_type);
    if (error) back(to, "error", `คืนค่าไม่สำเร็จ: ${error.message}`);
    revalidatePath(to);
    back(to, "ok", "ใช้สิทธิ์ตามค่าเริ่มต้นแล้ว");
  }
  const paid = num(formData.get("paid_days"));
  if (paid == null || paid < 0) back(to, "error", "กรุณาใส่จำนวนวันที่ได้ค่าจ้าง");
  const { error } = await supabase
    .from("leave_entitlements")
    .upsert({ employee_id, leave_type, max_days: num(formData.get("max_days")), paid_days: paid, updated_at: new Date().toISOString() });
  if (error) back(to, "error", error.message.includes("row-level security") ? "คุณไม่มีสิทธิ์แก้สิทธิ์การลาของคนนี้" : `บันทึกไม่สำเร็จ: ${error.message}`);
  revalidatePath(to);
  back(to, "ok", "บันทึกสิทธิ์การลาแล้ว");
}

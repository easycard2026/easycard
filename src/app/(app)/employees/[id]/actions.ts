"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";
import { DOC_BUCKET } from "@/lib/documents";

export async function deleteDocument(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/employees/${emp}`;
  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, file_path")
    .eq("id", String(formData.get("id")))
    .maybeSingle();
  if (!doc) back(path, "error", "ไม่พบเอกสาร");

  // ลบไฟล์ก่อน ถ้าไม่มีสิทธิ์ Storage จะไม่ลบอะไรเลย
  const { data: removed, error: storageError } = await supabase.storage.from(DOC_BUCKET).remove([doc.file_path]);
  if (storageError || !removed?.length) back(path, "error", "คุณไม่มีสิทธิ์ลบเอกสารนี้");
  const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
  if (error) back(path, "error", "ลบเอกสารไม่สำเร็จ");
  revalidatePath(path);
  back(path, "ok", "ลบเอกสารแล้ว");
}

export async function updateStartDate(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/employees/${emp}`;
  const start_date = String(formData.get("start_date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date)) back(path, "error", "กรุณาเลือกวันเริ่มงาน");
  const { error, count } = await supabase.from("employees").update({ start_date }, { count: "exact" }).eq("id", emp);
  if (error || !count) back(path, "error", "บันทึกวันเริ่มงานไม่สำเร็จ (เฉพาะ CEO และบัญชีแก้ได้)");
  revalidatePath(path);
  revalidatePath("/employees");
  back(path, "ok", "บันทึกวันเริ่มงานแล้ว");
}

export async function updatePosition(formData: FormData) {
  const { supabase } = await getSession();
  const emp = String(formData.get("employee_id"));
  const path = `/employees/${emp}`;
  const position_id = String(formData.get("position_id") ?? "") || null;
  const { error, count } = await supabase.from("employees").update({ position_id }, { count: "exact" }).eq("id", emp);
  if (error || !count) back(path, "error", "บันทึกตำแหน่งไม่สำเร็จ (เฉพาะ CEO และบัญชีแก้ได้)");
  revalidatePath(path);
  revalidatePath("/employees");
  back(path, "ok", "บันทึกตำแหน่งแล้ว");
}

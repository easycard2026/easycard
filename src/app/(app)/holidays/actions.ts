"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const page = (f: FormData) => s(f, "back") || "/holidays";

function done(path: string, msg: string): never {
  revalidatePath("/holidays");
  back(path, "ok", msg);
}

export async function addHoliday(f: FormData) {
  const { supabase } = await getSession();
  const to = page(f);
  const holiday_date = s(f, "holiday_date");
  const name = s(f, "name");
  if (!DATE.test(holiday_date) || !name) back(to, "error", "กรุณาใส่วันที่และชื่อวันหยุด");
  const { error } = await supabase.from("holidays").insert({ calendar_id: s(f, "calendar_id"), holiday_date, name });
  if (error) back(to, "error", error.code === "23505" ? "มีวันหยุดวันนี้ในชุดนี้แล้ว" : `เพิ่มไม่สำเร็จ: ${error.message}`);
  done(to, `เพิ่ม "${name}" แล้ว`);
}

export async function deleteHoliday(f: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.from("holidays").delete().eq("id", s(f, "id"));
  if (error) back(page(f), "error", `ลบไม่สำเร็จ: ${error.message}`);
  done(page(f), "ลบวันหยุดแล้ว");
}

// คัดลอกวันหยุดทั้งปีจากอีกชุด (ข้ามวันที่มีอยู่แล้ว)
export async function copyHolidays(f: FormData) {
  const { supabase } = await getSession();
  const to = page(f);
  const target = s(f, "calendar_id");
  const source = s(f, "source_id");
  const year = s(f, "year");
  if (!source || source === target) back(to, "error", "เลือกชุดวันหยุดที่จะคัดลอกมา");
  const { data } = await supabase.from("holidays").select("holiday_date, name").eq("calendar_id", source).gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`);
  if (!data?.length) back(to, "error", "ชุดที่เลือกยังไม่มีวันหยุดในปีนี้");
  const { error } = await supabase
    .from("holidays")
    .upsert(data.map((h) => ({ ...h, calendar_id: target })), { onConflict: "calendar_id,holiday_date", ignoreDuplicates: true });
  if (error) back(to, "error", `คัดลอกไม่สำเร็จ: ${error.message}`);
  done(to, `คัดลอก ${data.length} วันแล้ว`);
}

export async function createCalendar(f: FormData) {
  const { supabase } = await getSession();
  const name = s(f, "name");
  if (!name) back("/holidays", "error", "กรุณาตั้งชื่อชุดวันหยุด");
  const { data, error } = await supabase.from("holiday_calendars").insert({ name }).select("id").single();
  if (error || !data) back("/holidays", "error", error?.code === "23505" ? "มีชื่อชุดนี้แล้ว" : "สร้างไม่สำเร็จ");
  done(`/holidays?cal=${data.id}`, `สร้างชุด "${name}" แล้ว`);
}

export async function renameCalendar(f: FormData) {
  const { supabase } = await getSession();
  const to = page(f);
  const name = s(f, "name");
  if (!name) back(to, "error", "กรุณาตั้งชื่อ");
  const { error } = await supabase.from("holiday_calendars").update({ name }).eq("id", s(f, "id"));
  if (error) back(to, "error", error.code === "23505" ? "มีชื่อชุดนี้แล้ว" : "บันทึกไม่สำเร็จ");
  done(to, "เปลี่ยนชื่อแล้ว");
}

export async function deleteCalendar(f: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.from("holiday_calendars").delete().eq("id", s(f, "id")).eq("is_default", false);
  if (error) back(page(f), "error", `ลบไม่สำเร็จ: ${error.message}`);
  done("/holidays", "ลบชุดวันหยุดแล้ว ตำแหน่งและพนักงานที่ใช้ชุดนี้กลับไปใช้ชุดค่าเริ่มต้น");
}

// ตำแหน่ง → ชุดวันหยุด
export async function setPositionCalendar(f: FormData) {
  const { supabase } = await getSession();
  const cal = s(f, "calendar_id") || null;
  const { error } = await supabase.from("positions").update({ holiday_calendar_id: cal }).eq("id", s(f, "position_id"));
  if (error) back(page(f), "error", `บันทึกไม่สำเร็จ: ${error.message}`);
  done(page(f), "บันทึกชุดวันหยุดของตำแหน่งแล้ว");
}

// พนักงานรายคน → ชุดวันหยุด (ว่าง = ตามตำแหน่ง)
export async function setEmployeeCalendar(f: FormData) {
  const { supabase } = await getSession();
  const cal = s(f, "calendar_id") || null;
  const { error } = await supabase.from("employees").update({ holiday_calendar_id: cal }).eq("id", s(f, "employee_id"));
  if (error) back(page(f), "error", `บันทึกไม่สำเร็จ: ${error.message}`);
  done(page(f), cal ? "ตั้งชุดวันหยุดเฉพาะคนแล้ว" : "ใช้ชุดวันหยุดตามตำแหน่งแล้ว");
}

// วันหยุดเพิ่ม / มาทำงานในวันหยุด รายคน
export async function addOverride(f: FormData) {
  const { supabase } = await getSession();
  const to = page(f);
  const holiday_date = s(f, "holiday_date");
  if (!DATE.test(holiday_date) || !s(f, "employee_id")) back(to, "error", "กรุณาเลือกพนักงานและวันที่");
  const { error } = await supabase.from("employee_holiday_overrides").upsert(
    { employee_id: s(f, "employee_id"), holiday_date, is_holiday: s(f, "kind") !== "work", name: s(f, "name") || null },
    { onConflict: "employee_id,holiday_date" },
  );
  if (error) back(to, "error", `บันทึกไม่สำเร็จ: ${error.message}`);
  done(to, "บันทึกวันหยุดรายคนแล้ว");
}

export async function deleteOverride(f: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.from("employee_holiday_overrides").delete().eq("id", s(f, "id"));
  if (error) back(page(f), "error", `ลบไม่สำเร็จ: ${error.message}`);
  done(page(f), "ลบแล้ว");
}

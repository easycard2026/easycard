"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function readShift(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const start = String(formData.get("start_time") ?? "");
  const end = String(formData.get("end_time") ?? "");
  const noBreak = formData.get("no_break") === "on";
  const breakMin = noBreak ? 0 : Math.round(Number(formData.get("break_minutes") || 0));
  const breakStart = noBreak ? "" : String(formData.get("break_start") ?? "");
  const grace = Math.round(Number(formData.get("late_grace_minutes") || 0));

  if (!name) return { error: "กรุณาใส่ชื่อกะ" };
  if (!TIME.test(start) || !TIME.test(end)) return { error: "กรุณาใส่เวลาเข้าและเลิกงาน" };
  if (start === end) return { error: "เวลาเข้าและเลิกงานต้องไม่เท่ากัน" };
  if (!Number.isFinite(breakMin) || breakMin < 0) return { error: "เวลาพักไม่ถูกต้อง" };
  if (!Number.isFinite(grace) || grace < 0 || grace > 240) return { error: "เวลาผ่อนผันมาสายต้องอยู่ระหว่าง 0-240 นาที" };
  if (breakStart && !TIME.test(breakStart)) return { error: "เวลาเริ่มพักไม่ถูกต้อง" };

  // ความยาวกะ (นาที) ข้ามเที่ยงคืนได้
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  let len = toMin(end) - toMin(start);
  if (len <= 0) len += 1440;
  if (breakMin >= len) return { error: "เวลาพักต้องน้อยกว่าเวลาของกะ" };
  if (breakStart && breakMin > 0) {
    let off = toMin(breakStart) - toMin(start);
    if (off < 0) off += 1440;
    if (off + breakMin > len) return { error: "ช่วงพักต้องอยู่ภายในเวลาของกะ" };
  }

  return {
    row: {
      name,
      start_time: start,
      end_time: end,
      break_minutes: breakMin,
      break_start: breakStart && breakMin > 0 ? breakStart : null,
      late_grace_minutes: grace,
    },
  };
}

function friendly(message: string, code?: string) {
  if (code === "23505") return "มีกะชื่อนี้อยู่แล้ว";
  if (code === "42501") return "ไม่มีสิทธิ์แก้ไขกะ (เฉพาะ CEO และฝ่ายบัญชี)";
  return message;
}

function refresh() {
  revalidatePath("/shifts");
  revalidatePath("/shifts/schedule");
  revalidatePath("/attendance");
}

export async function createShift(formData: FormData) {
  const { supabase } = await getSession();
  const r = readShift(formData);
  if (!r.row) back("/shifts/new", "error", r.error);
  const { data, error } = await supabase.from("shifts").insert(r.row).select("id");
  if (error) back("/shifts/new", "error", friendly(error.message, error.code));
  if (!data?.length) back("/shifts/new", "error", friendly("", "42501"));
  refresh();
  back("/shifts", "ok", `เพิ่ม${r.row.name}แล้ว`);
}

export async function updateShift(formData: FormData) {
  const { supabase } = await getSession();
  const id = String(formData.get("id"));
  const path = `/shifts/${id}`;
  const r = readShift(formData);
  if (!r.row) back(path, "error", r.error);
  const { data, error } = await supabase.from("shifts").update(r.row).eq("id", id).select("id");
  if (error) back(path, "error", friendly(error.message, error.code));
  if (!data?.length) back(path, "error", friendly("", "42501"));
  refresh();
  back("/shifts", "ok", `บันทึก${r.row.name}แล้ว`);
}

export async function deleteShift(formData: FormData) {
  const { supabase } = await getSession();
  const id = String(formData.get("id"));
  const path = `/shifts/${id}`;

  // ห้ามลบกะที่ยังมีคนใช้อยู่ เพราะประวัติเวลาเข้าออกและการแลกกะอ้างถึงกะนี้
  const [emps, assigns, swaps] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("default_shift_id", id),
    supabase.from("shift_assignments").select("id", { count: "exact", head: true }).eq("shift_id", id),
    supabase.from("shift_swaps").select("id", { count: "exact", head: true }).or(`requester_shift_id.eq.${id},target_shift_id.eq.${id}`),
  ]);
  if (emps.count) back(path, "error", `ลบไม่ได้ มีพนักงาน ${emps.count} คนใช้กะนี้เป็นกะประจำ ย้ายไปกะอื่นก่อนที่หน้าตั้งกะประจำ`);

  if (assigns.count || swaps.count) back(path, "error", "ลบไม่ได้ กะนี้มีประวัติการจัดกะหรือแลกกะแล้ว แก้ไขชื่อหรือเวลาแทนได้");

  const { data, error } = await supabase.from("shifts").delete().eq("id", id).select("id");
  if (error?.code === "23503") back(path, "error", "ลบไม่ได้ กะนี้มีประวัติการจัดกะหรือแลกกะแล้ว แก้ไขชื่อหรือเวลาแทนได้");
  if (error) back(path, "error", friendly(error.message, error.code));
  if (!data?.length) back(path, "error", friendly("", "42501"));
  refresh();
  redirect(`/shifts?ok=${encodeURIComponent("ลบกะแล้ว")}`);
}

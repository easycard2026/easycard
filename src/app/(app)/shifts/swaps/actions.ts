"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const PAGE = "/shifts/swaps";

function done(message: string): never {
  revalidatePath(PAGE);
  revalidatePath("/attendance");
  back(PAGE, "ok", message);
}

export async function requestSwap(formData: FormData) {
  const { supabase } = await getSession();
  const d = String(formData.get("work_date") ?? "");
  const target = String(formData.get("target_id") ?? "");
  const why = String(formData.get("reason") ?? "").trim();
  if (!d || !target || !why) back(`${PAGE}?date=${d}`, "error", "กรุณาเลือกวัน เพื่อนที่จะแลก และใส่เหตุผล");
  const { error } = await supabase.rpc("request_shift_swap", { target, d, why });
  if (error) back(`${PAGE}?date=${d}`, "error", error.message);
  done("ส่งคำขอแล้ว รอเพื่อนตอบรับ");
}

export async function respondSwap(formData: FormData) {
  const { supabase } = await getSession();
  const accept = formData.get("decision") === "accept";
  const { error } = await supabase.rpc("respond_shift_swap", { swap_id: String(formData.get("id")), accept });
  if (error) back(PAGE, "error", error.message);
  done(accept ? "ตอบรับแล้ว รอหัวหน้างานและบัญชีอนุมัติ" : "ปฏิเสธคำขอแล้ว");
}

export async function decideSwap(formData: FormData) {
  const { supabase } = await getSession();
  const approve = formData.get("decision") === "approve";
  const step = String(formData.get("step"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await supabase.rpc("decide_shift_swap", { swap_id: String(formData.get("id")), step, approve, note });
  if (error) back(PAGE, "error", error.message);
  done(approve ? "อนุมัติแล้ว" : "ไม่อนุมัติคำขอนี้แล้ว");
}

export async function cancelSwap(formData: FormData) {
  const { supabase } = await getSession();
  const { error } = await supabase.rpc("cancel_shift_swap", { swap_id: String(formData.get("id")) });
  if (error) back(PAGE, "error", error.message);
  done("ยกเลิกการแลกกะแล้ว");
}

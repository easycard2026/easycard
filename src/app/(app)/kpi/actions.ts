"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";

const ITEMS = "/kpi/items";

function num(v: FormDataEntryValue | null) {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function itemFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const target = num(formData.get("target"));
  const weight = num(formData.get("weight")) ?? 1;
  const direction = formData.get("direction") === "lower" ? "lower" : "higher";
  const unit = String(formData.get("unit") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  return { name, target, weight, direction, unit, description };
}

export async function addKpiItem(formData: FormData) {
  const { supabase } = await getSession();
  const f = itemFields(formData);
  const backTo = String(formData.get("back") ?? "") || ITEMS;
  if (!f.name) back(backTo, "error", "กรุณากรอกชื่อหัวข้อ");
  if (f.target === null || Number.isNaN(f.target) || f.target < 0) back(backTo, "error", "เป้าหมายต้องเป็นตัวเลข 0 ขึ้นไป");
  if (Number.isNaN(f.weight) || f.weight <= 0) back(backTo, "error", "น้ำหนักต้องมากกว่า 0");

  // scope: "all" | "pos:<id>" | "emp:<id>"
  const scope = String(formData.get("scope") ?? "all");
  const position_id = scope.startsWith("pos:") ? scope.slice(4) : null;
  const employee_id = scope.startsWith("emp:") ? scope.slice(4) : null;

  const { error } = await supabase.from("kpi_items").insert({ ...f, position_id, employee_id });
  if (error) back(backTo, "error", "เพิ่มหัวข้อไม่สำเร็จ (อาจไม่มีสิทธิ์ตั้ง KPI ให้คนนี้)");
  revalidatePath("/kpi", "layout");
  back(backTo, "ok", `เพิ่มหัวข้อ "${f.name}" แล้ว`);
}

export async function updateKpiItem(formData: FormData) {
  const { supabase } = await getSession();
  const f = itemFields(formData);
  const backTo = String(formData.get("back") ?? "") || ITEMS;
  if (!f.name || f.target === null || Number.isNaN(f.target) || f.target < 0 || Number.isNaN(f.weight) || f.weight <= 0)
    back(backTo, "error", "กรอกชื่อ เป้าหมาย และน้ำหนักให้ถูกต้อง");
  const active = formData.get("active") === "on";
  const { error, count } = await supabase
    .from("kpi_items")
    .update({ ...f, active }, { count: "exact" })
    .eq("id", String(formData.get("id")));
  if (error || !count) back(backTo, "error", "บันทึกไม่สำเร็จ");
  revalidatePath("/kpi", "layout");
  back(backTo, "ok", "บันทึกแล้ว");
}

export async function deleteKpiItem(formData: FormData) {
  const { supabase } = await getSession();
  const backTo = String(formData.get("back") ?? "") || ITEMS;
  const { error, count } = await supabase.from("kpi_items").delete({ count: "exact" }).eq("id", String(formData.get("id")));
  if (error || !count) back(backTo, "error", "ลบไม่สำเร็จ");
  revalidatePath("/kpi", "layout");
  back(backTo, "ok", "ลบหัวข้อแล้ว (คะแนนเก่าของหัวข้อนี้ถูกลบด้วย)");
}

// บันทึกผลงานทุกหัวข้อของพนักงาน 1 คนใน 1 เดือน; ช่องว่าง = ลบคะแนนเดิม
export async function saveKpiScores(formData: FormData) {
  const { supabase } = await getSession();
  const employee_id = String(formData.get("employee_id"));
  const month = String(formData.get("month"));
  const path = `/kpi/${employee_id}?month=${month}`;
  if (!/^\d{4}-\d{2}$/.test(month)) back(path, "error", "เดือนไม่ถูกต้อง");
  const period = `${month}-01`;

  const ids = formData.getAll("item_id").map(String);
  const { data: items } = await supabase.from("kpi_items").select("id, target").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const target = new Map((items ?? []).map((i) => [i.id, Number(i.target)]));

  const upserts: { item_id: string; employee_id: string; period: string; target: number; actual: number; note: string | null; scored_at: string }[] = [];
  const clears: string[] = [];
  for (const id of ids) {
    const actual = num(formData.get(`actual_${id}`));
    if (actual === null) {
      clears.push(id);
      continue;
    }
    if (Number.isNaN(actual)) back(path, "error", "ผลงานต้องเป็นตัวเลข");
    if (!target.has(id)) continue;
    // เก็บเป้าเดิมไว้ถ้าเคยให้คะแนนแล้ว (ส่งมาจากฟอร์ม)
    const keep = num(formData.get(`target_${id}`));
    upserts.push({
      item_id: id,
      employee_id,
      period,
      target: keep !== null && !Number.isNaN(keep) ? keep : target.get(id)!,
      actual,
      note: String(formData.get(`note_${id}`) ?? "").trim() || null,
      scored_at: new Date().toISOString(),
    });
  }

  if (upserts.length) {
    const { error } = await supabase.from("kpi_scores").upsert(upserts, { onConflict: "item_id,employee_id,period" });
    if (error) back(path, "error", "บันทึกไม่สำเร็จ (อาจไม่มีสิทธิ์ให้คะแนนคนนี้)");
  }
  if (clears.length) {
    await supabase.from("kpi_scores").delete().eq("employee_id", employee_id).eq("period", period).in("item_id", clears);
  }
  revalidatePath("/kpi", "layout");
  back(path, "ok", "บันทึกผล KPI แล้ว");
}

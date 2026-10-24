import type { SupabaseClient } from "@supabase/supabase-js";
import { itemScore, itemsFor, totalScore, type KpiItem } from "@/lib/kpi";
import type { Role } from "@/lib/roles";

export type KpiEmp = {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  position_id: string | null;
  manager_id: string | null;
  positions: { name: string } | null;
};

export type KpiScore = { item_id: string; employee_id: string; target: number; actual: number; note: string | null };

export const EMP_SELECT = "id, code, first_name, last_name, position_id, manager_id, positions(name)";

export async function loadItems(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("kpi_items")
    .select("id, name, description, unit, target, weight, direction, position_id, employee_id, active")
    .order("created_at");
  return ((data ?? []) as KpiItem[]).map((i) => ({ ...i, target: Number(i.target), weight: Number(i.weight) }));
}

export async function loadScores(supabase: SupabaseClient, period: string, employeeIds?: string[]) {
  let q = supabase.from("kpi_scores").select("item_id, employee_id, target, actual, note").eq("period", period);
  if (employeeIds) q = q.in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return ((data ?? []) as KpiScore[]).map((s) => ({ ...s, target: Number(s.target), actual: Number(s.actual) }));
}

// ผล KPI ของพนักงาน 1 คน: หัวข้อที่ใช้ (รวมหัวข้อที่ปิดแล้วแต่มีคะแนนเดือนนั้น)
export function evaluate(emp: { id: string; position_id: string | null }, items: KpiItem[], scores: KpiScore[]) {
  const mine = scores.filter((s) => s.employee_id === emp.id);
  const byItem = new Map(mine.map((s) => [s.item_id, s]));
  const rows = itemsFor(items, emp)
    .filter((i) => i.active || byItem.has(i.id))
    .map((i) => {
      const s = byItem.get(i.id);
      const target = s ? s.target : i.target;
      return { item: i, target, actual: s ? s.actual : null, note: s?.note ?? null, score: s ? itemScore(target, s.actual, i.direction) : null };
    });
  return { rows, total: totalScore(rows.map((r) => ({ weight: r.item.weight, score: r.score }))), scored: rows.filter((r) => r.score !== null).length };
}

// ให้คะแนน / ตั้ง KPI รายคนได้ไหม (ตรงกับ private.can_manage_kpi_of ในฐานข้อมูล)
export function canManage(role: Role, myEmployeeId: string | null, emp: { id: string; manager_id: string | null }) {
  if (role === "ceo") return true;
  if (role === "accounting") return emp.id !== myEmployeeId;
  if (role === "manager") return !!myEmployeeId && emp.manager_id === myEmployeeId;
  return false;
}

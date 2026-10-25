// สูตรคะแนน KPI
export type KpiDirection = "higher" | "lower";

export type KpiItem = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  target: number;
  weight: number;
  direction: KpiDirection;
  position_id: string | null;
  employee_id: string | null;
  active: boolean;
};

export const DIRECTION_LABEL: Record<KpiDirection, string> = {
  higher: "ยิ่งมากยิ่งดี",
  lower: "ยิ่งน้อยยิ่งดี",
};

// คะแนนสูงสุดต่อหัวข้อ (ทำเกินเป้าได้ไม่เกิน 120%)
export const MAX_SCORE = 120;

// คะแนนเป็น % ของเป้า
// ยิ่งมากยิ่งดี: ผลงาน ÷ เป้า; ยิ่งน้อยยิ่งดี (เช่น ของเสีย): เป้า ÷ ผลงาน (ทำได้ 0 = เต็ม)
export function itemScore(target: number, actual: number, direction: KpiDirection) {
  let pct: number;
  if (direction === "higher") {
    pct = target <= 0 ? (actual > 0 ? MAX_SCORE : 100) : (actual / target) * 100;
  } else {
    if (actual <= 0) pct = MAX_SCORE;
    else if (target <= 0) pct = 0;
    else pct = (target / actual) * 100;
  }
  return Math.round(Math.max(0, Math.min(MAX_SCORE, pct)) * 10) / 10;
}

// คะแนนรวมแบบถ่วงน้ำหนัก เฉพาะหัวข้อที่ให้คะแนนแล้ว (null = ยังไม่มีคะแนน)
export function totalScore(rows: { weight: number; score: number | null }[]) {
  const scored = rows.filter((r) => r.score !== null);
  const w = scored.reduce((s, r) => s + r.weight, 0);
  if (!w) return null;
  return Math.round((scored.reduce((s, r) => s + r.weight * r.score!, 0) / w) * 10) / 10;
}

export function grade(score: number | null): { label: string; tone: "green" | "blue" | "amber" | "red" | "gray" } {
  if (score === null) return { label: "ยังไม่ประเมิน", tone: "gray" };
  if (score >= 100) return { label: "ดีเยี่ยม", tone: "green" };
  if (score >= 80) return { label: "ดี", tone: "blue" };
  if (score >= 60) return { label: "พอใช้", tone: "amber" };
  return { label: "ต้องปรับปรุง", tone: "red" };
}

// หัวข้อที่ใช้กับพนักงานคนนี้: หัวข้อกลาง + ตามตำแหน่ง + รายคน
export function itemsFor<T extends Pick<KpiItem, "position_id" | "employee_id">>(items: T[], emp: { id: string; position_id: string | null }) {
  return items.filter(
    (i) => i.employee_id === emp.id || (i.employee_id === null && (i.position_id === null || i.position_id === emp.position_id)),
  );
}

// "2026-10" → ช่วงวันของเดือน
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export const fmtNum = (v: number) => v.toLocaleString("th-TH", { maximumFractionDigits: 2 });

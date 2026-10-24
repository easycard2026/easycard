// แสดงวันที่แบบไทย เช่น 24 ต.ค. 2569
export function thaiDate(iso: string | null | undefined, month: "short" | "long" = "short") {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString("th-TH", { day: "numeric", month, year: "numeric", timeZone: "Asia/Bangkok" });
}

// วันนี้ตามเวลาไทย ในรูปแบบ YYYY-MM-DD
export function todayBangkok() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

// จำนวนวันจากวันนี้ถึงวันที่ระบุ (ติดลบ = เลยมาแล้ว)
export function daysUntil(iso: string) {
  const a = Date.parse(`${todayBangkok()}T00:00:00Z`);
  const b = Date.parse(`${iso}T00:00:00Z`);
  return Math.round((b - a) / 864e5);
}

// ตัวย่อชื่อสำหรับรูปโปรไฟล์ (ข้ามสระหน้า เช่น "เ" ใน "เอกชัย")
function firstLetter(s?: string | null) {
  return (s ?? "").trim().replace(/^[เแโใไ]+/, "").charAt(0).toUpperCase();
}
export function initials(first?: string | null, last?: string | null) {
  return firstLetter(first) + firstLetter(last) || "?";
}

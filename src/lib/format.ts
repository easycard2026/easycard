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

// อายุงานจากวันเริ่มงานถึงวันนี้ เช่น "2 ปี 3 เดือน"
export function serviceLength(startIso: string | null | undefined, today = todayBangkok()) {
  if (!startIso) return "-";
  const dayDiff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / 864e5);
  if (dayDiff < 0) return `เริ่มงานอีก ${-dayDiff} วัน`;
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return dayDiff === 0 ? "เริ่มวันนี้" : `${dayDiff} วัน`;
  return [y && `${y} ปี`, m && `${m} เดือน`].filter(Boolean).join(" ");
}

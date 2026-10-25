// พนักงานที่ไม่มีอีเมล ใช้ "ชื่อผู้ใช้" แทนได้ ระบบเก็บเป็นอีเมลภายในโดเมนนี้
export const USERNAME_DOMAIN = "staff.easycard.local";

export function toLoginEmail(input: string) {
  const v = input.trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : `${v}@${USERNAME_DOMAIN}`;
}

// แสดงชื่อเข้าระบบ: ถ้าเป็นชื่อผู้ใช้ ตัดโดเมนภายในออก
export function loginName(email: string | null | undefined) {
  if (!email) return "-";
  const suffix = `@${USERNAME_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

export function validUsername(input: string) {
  const v = input.trim().toLowerCase();
  return v.includes("@") ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) : /^[a-z0-9._-]{3,40}$/.test(v);
}

// รหัสผ่านชั่วคราว อ่านง่าย (ไม่มี 0/O, 1/l)
export function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// ข้อความ error จากฟังก์ชันในฐานข้อมูลเป็นภาษาไทยอยู่แล้ว
export function dbMessage(error: { message?: string } | null, fallback: string) {
  const m = error?.message ?? "";
  return /[฀-๿]/.test(m) ? m : fallback;
}

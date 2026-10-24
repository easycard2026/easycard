export type Role = "ceo" | "accounting" | "manager" | "employee";

export const ROLE_LABEL: Record<Role, string> = {
  ceo: "เจ้าของบริษัท (CEO)",
  accounting: "พนักงานบัญชี",
  manager: "ผู้จัดการ",
  employee: "พนักงาน",
};

export type MenuIcon = "home" | "users" | "clock" | "upload" | "fingerprint" | "timer" | "wallet" | "receipt" | "shield" | "megaphone";
export type MenuItem = { href: string; label: string; icon: MenuIcon; roles: Role[]; soon?: boolean };

// เมนูตามตารางสิทธิ์ในเอกสารออกแบบ; soon = ยังไม่ได้ทำ (ส่วนที่ 2-4)
export const MENU: MenuItem[] = [
  { href: "/", icon: "home", label: "ภาพรวม", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/announcements", icon: "megaphone", label: "ประกาศ", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/employees", icon: "users", label: "พนักงาน", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/shifts", icon: "clock", label: "กะการทำงาน", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/time-import", icon: "upload", label: "นำเข้าไฟล์เครื่องสแกน", roles: ["ceo", "accounting"], soon: true },
  { href: "/attendance", icon: "fingerprint", label: "เวลาเข้าออก", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/ot", icon: "timer", label: "OT", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/payroll", icon: "wallet", label: "เงินเดือน", roles: ["ceo", "accounting"] },
  { href: "/payslips", icon: "receipt", label: "สลิปเงินเดือน", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/users", icon: "shield", label: "จัดการผู้ใช้และ Role", roles: ["ceo"], soon: true },
];

export const PROBATION_LABEL: Record<string, string> = {
  on_probation: "ทดลองงาน",
  passed: "ผ่านทดลองงาน",
  failed: "ไม่ผ่าน",
  extended: "ขยายเวลาทดลองงาน",
};

// สีป้ายสถานะทดลองงาน
export const PROBATION_TONE: Record<string, "amber" | "green" | "red" | "blue"> = {
  on_probation: "amber",
  passed: "green",
  failed: "red",
  extended: "blue",
};

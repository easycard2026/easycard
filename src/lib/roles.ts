export type Role = "ceo" | "accounting" | "manager" | "employee";

export const ROLE_LABEL: Record<Role, string> = {
  ceo: "เจ้าของบริษัท (CEO)",
  accounting: "พนักงานบัญชี",
  manager: "ผู้จัดการ",
  employee: "พนักงาน",
};

export type MenuItem = { href: string; label: string; roles: Role[]; soon?: boolean };

// เมนูตามตารางสิทธิ์ในเอกสารออกแบบ; soon = ยังไม่ได้ทำ (ส่วนที่ 2-4)
export const MENU: MenuItem[] = [
  { href: "/", label: "ภาพรวม", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/employees", label: "พนักงาน", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/shifts", label: "กะการทำงาน", roles: ["ceo", "accounting", "manager", "employee"] },
  { href: "/time-import", label: "นำเข้าไฟล์เครื่องสแกน", roles: ["ceo", "accounting"], soon: true },
  { href: "/attendance", label: "เวลาเข้าออก", roles: ["ceo", "accounting", "manager", "employee"], soon: true },
  { href: "/ot", label: "ขอ / อนุมัติ OT", roles: ["ceo", "manager", "employee"], soon: true },
  { href: "/payroll", label: "เงินเดือน", roles: ["ceo", "accounting"], soon: true },
  { href: "/payslips", label: "สลิปเงินเดือน", roles: ["ceo", "accounting", "manager", "employee"], soon: true },
  { href: "/users", label: "จัดการผู้ใช้และ Role", roles: ["ceo"], soon: true },
];

export const PROBATION_LABEL: Record<string, string> = {
  on_probation: "ทดลองงาน",
  passed: "ผ่านทดลองงาน",
  failed: "ไม่ผ่าน",
  extended: "ขยายเวลาทดลองงาน",
};

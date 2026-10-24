// สิทธิ์การลาและวันลาคงเหลือ (ไม่แตะฐานข้อมูล ทดสอบใน leave.test.ts)

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LeaveType = {
  code: string;
  name: string;
  max_days: number | null;
  paid_days: number;
  min_service_days: number;
  doc_after_days: number | null;
  note: string | null;
  active: boolean;
  sort: number;
};

export type Entitlement = { leave_type: string; max_days: number | null; paid_days: number };
export type LeaveReq = { leave_type: string; start_date: string; days: number; unpaid_days: number; status: LeaveStatus };

export type Balance = {
  code: string;
  name: string;
  max: number | null; // ลาได้ทั้งปี (null = ไม่จำกัด)
  paid: number; // ได้ค่าจ้างทั้งปี
  used: number; // อนุมัติแล้ว
  pending: number; // รออนุมัติ
  unpaidUsed: number; // ส่วนที่ไม่ได้ค่าจ้าง (อนุมัติแล้ว)
  remaining: number | null; // ลาได้อีก (หักที่รออนุมัติด้วย)
  paidRemaining: number; // ลาแบบได้ค่าจ้างได้อีก
  eligibleFrom: string | null; // ยังไม่มีสิทธิ์จนถึงวันนี้
  custom: boolean; // ตั้งสิทธิ์เฉพาะคน
};

export const LEAVE_STATUS: Record<LeaveStatus, { label: string; tone: "amber" | "green" | "red" | "gray" }> = {
  pending: { label: "รออนุมัติ", tone: "amber" },
  approved: { label: "อนุมัติแล้ว", tone: "green" },
  rejected: { label: "ไม่อนุมัติ", tone: "red" },
  cancelled: { label: "ยกเลิก", tone: "gray" },
};

const r1 = (n: number) => Math.round(n * 10) / 10;

export function addDays(iso: string, days: number) {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
}

// วันลาคงเหลือของพนักงานหนึ่งคนในปีที่ระบุ (ปี ค.ศ.)
export function leaveBalances(opts: {
  types: LeaveType[];
  entitlements: Entitlement[];
  requests: LeaveReq[];
  year: number;
  employeeStart: string | null;
  today: string;
}): Balance[] {
  const { types, entitlements, requests, year, employeeStart, today } = opts;
  const inYear = requests.filter((r) => Number(r.start_date.slice(0, 4)) === year);
  return types
    .filter((t) => t.active)
    .sort((a, b) => a.sort - b.sort)
    .map((t) => {
      const en = entitlements.find((e) => e.leave_type === t.code);
      const max = en ? (en.max_days == null ? null : Number(en.max_days)) : t.max_days == null ? null : Number(t.max_days);
      const paid = Number(en ? en.paid_days : t.paid_days);
      const mine = inYear.filter((r) => r.leave_type === t.code);
      const used = r1(mine.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.days), 0));
      const pending = r1(mine.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.days), 0));
      const unpaidUsed = r1(mine.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.unpaid_days), 0));
      const eligible = t.min_service_days > 0 && employeeStart ? addDays(employeeStart, t.min_service_days) : null;
      return {
        code: t.code,
        name: t.name,
        max,
        paid,
        used,
        pending,
        unpaidUsed,
        remaining: max == null ? null : r1(Math.max(0, max - used - pending)),
        paidRemaining: r1(Math.max(0, paid - (used - unpaidUsed) - pending)),
        eligibleFrom: eligible && eligible > today ? eligible : null,
        custom: !!en,
      };
    });
}

export const fmtDays = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

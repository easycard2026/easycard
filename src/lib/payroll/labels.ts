export type PayrollStatus = "draft" | "reviewed" | "approved" | "closed";

export const PAYROLL_STATUS: Record<PayrollStatus, { label: string; tone: "gray" | "amber" | "blue" | "green" }> = {
  draft: { label: "ร่าง", tone: "gray" },
  reviewed: { label: "บัญชีตรวจแล้ว รอ CEO", tone: "amber" },
  approved: { label: "CEO อนุมัติแล้ว", tone: "blue" },
  closed: { label: "ปิดงวดแล้ว", tone: "green" },
};

export const PAYROLL_STEPS: { key: PayrollStatus; label: string }[] = [
  { key: "draft", label: "คำนวณ" },
  { key: "reviewed", label: "บัญชีตรวจ" },
  { key: "approved", label: "CEO อนุมัติ" },
  { key: "closed", label: "ปิดงวด" },
];

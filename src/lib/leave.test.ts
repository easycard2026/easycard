import { describe, expect, it } from "vitest";
import { leaveBalances, type LeaveType } from "./leave";

const types: LeaveType[] = [
  { code: "sick", name: "ลาป่วย", max_days: null, paid_days: 30, min_service_days: 0, doc_after_days: 3, note: null, active: true, sort: 1 },
  { code: "personal", name: "ลากิจ", max_days: null, paid_days: 3, min_service_days: 0, doc_after_days: null, note: null, active: true, sort: 2 },
  { code: "annual", name: "ลาพักร้อน", max_days: 6, paid_days: 6, min_service_days: 365, doc_after_days: null, note: null, active: true, sort: 3 },
  { code: "old", name: "เลิกใช้", max_days: 1, paid_days: 1, min_service_days: 0, doc_after_days: null, note: null, active: false, sort: 9 },
];

describe("leaveBalances", () => {
  it("counts used, pending and remaining in the year", () => {
    const b = leaveBalances({
      types,
      entitlements: [],
      year: 2026,
      employeeStart: "2020-01-01",
      today: "2026-10-24",
      requests: [
        { leave_type: "annual", start_date: "2026-03-02", days: 2, unpaid_days: 0, status: "approved" },
        { leave_type: "annual", start_date: "2026-11-02", days: 1.5, unpaid_days: 0, status: "pending" },
        { leave_type: "annual", start_date: "2026-04-02", days: 1, unpaid_days: 0, status: "rejected" },
        { leave_type: "annual", start_date: "2025-04-02", days: 5, unpaid_days: 0, status: "approved" },
      ],
    });
    expect(b.map((x) => x.code)).toEqual(["sick", "personal", "annual"]);
    const a = b.find((x) => x.code === "annual")!;
    expect(a).toMatchObject({ used: 2, pending: 1.5, remaining: 2.5, paidRemaining: 2.5, eligibleFrom: null });
  });

  it("tracks unpaid days beyond the paid quota", () => {
    const p = leaveBalances({
      types, entitlements: [], year: 2026, employeeStart: "2020-01-01", today: "2026-10-24",
      requests: [{ leave_type: "personal", start_date: "2026-05-01", days: 5, unpaid_days: 2, status: "approved" }],
    }).find((x) => x.code === "personal")!;
    expect(p).toMatchObject({ used: 5, unpaidUsed: 2, remaining: null, paidRemaining: 0 });
  });

  it("uses per-employee entitlements", () => {
    const a = leaveBalances({
      types, entitlements: [{ leave_type: "annual", max_days: 10, paid_days: 8 }], year: 2026, employeeStart: "2020-01-01", today: "2026-10-24", requests: [],
    }).find((x) => x.code === "annual")!;
    expect(a).toMatchObject({ max: 10, paid: 8, remaining: 10, custom: true });
  });

  it("shows when annual leave becomes available", () => {
    const a = leaveBalances({ types, entitlements: [], year: 2026, employeeStart: "2026-06-01", today: "2026-10-24", requests: [] }).find((x) => x.code === "annual")!;
    expect(a.eligibleFrom).toBe("2027-06-01");
  });
});

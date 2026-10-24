import { describe, expect, it } from "vitest";
import { calculatePayslip, paidOtHours, progressiveTax, ssoContribution, type CalcInput, type PayrollSettings } from "./calc";

const settings: PayrollSettings = {
  days_per_month: 30, hours_per_day: 8,
  ot_rate_workday: 1.5, ot_rate_holiday_work: 1, ot_rate_holiday_ot: 3, ot_round_minutes: 30,
  sso_rate: 0.05, sso_min_base: 1650, sso_max_base: 17500,
  expense_rate: 0.5, expense_cap: 100000,
  personal_allowance: 60000, spouse_allowance: 60000, child_allowance: 30000, parent_allowance: 30000,
  tax_brackets: [
    { upto: 150000, rate: 0 }, { upto: 300000, rate: 0.05 }, { upto: 500000, rate: 0.1 }, { upto: 750000, rate: 0.15 },
    { upto: 1000000, rate: 0.2 }, { upto: 2000000, rate: 0.25 }, { upto: 5000000, rate: 0.3 }, { upto: null, rate: 0.35 },
  ],
};

const base = (over: Partial<CalcInput> = {}): CalcInput => ({
  settings,
  period: { year: 2026, month: 1, start_date: "2026-01-01", end_date: "2026-01-31" },
  employee: { start_date: "2020-01-01" },
  monthlySalary: 30000,
  ot: [], allowances: [], manual: [], taxProfile: null,
  ytdBefore: { income: 0, tax: 0, sso: 0 },
  ...over,
});

describe("progressiveTax", () => {
  it("is zero up to 150,000", () => expect(progressiveTax(150000, settings.tax_brackets)).toBe(0));
  it("steps through brackets", () => {
    expect(progressiveTax(300000, settings.tax_brackets)).toBe(7500);
    expect(progressiveTax(600000, settings.tax_brackets)).toBe(7500 + 20000 + 15000);
  });
});

describe("ssoContribution", () => {
  it("caps at 875", () => expect(ssoContribution(50000, settings)).toBe(875));
  it("uses minimum base", () => expect(ssoContribution(1000, settings)).toBe(83));
  it("is 5% in between", () => expect(ssoContribution(12000, settings)).toBe(600));
  it("is zero with no wage", () => expect(ssoContribution(0, settings)).toBe(0));
});

describe("paidOtHours", () => {
  it("rounds down to 30 minutes", () => expect(paidOtHours(2.9, null, 30)).toBe(2.5));
  it("takes the smaller of approved and actual", () => expect(paidOtHours(3, 2.2, 30)).toBe(2));
  it("never pays more than approved", () => expect(paidOtHours(2, 5, 30)).toBe(2));
});

describe("calculatePayslip", () => {
  it("30,000 salary in January, no OT", () => {
    const r = calculatePayslip(base());
    expect(r.sso_employee).toBe(875);
    // ทั้งปี 360,000 − ค่าใช้จ่าย 100,000 − ลดหย่อน (60,000 + 10,500) = 189,500 → ภาษี 1,975 ÷ 12
    expect(r.calc_note.net_taxable_income).toBe(189500);
    expect(r.calc_note.annual_tax_estimate).toBe(1975);
    expect(r.tax).toBe(164.58);
    expect(r.net).toBe(30000 - 875 - 164.58);
  });

  it("pays workday OT at 1.5x hourly (salary ÷ 30 ÷ 8)", () => {
    const r = calculatePayslip(base({ monthlySalary: 20000, ot: [{ ot_type: "workday", hours: 3, actual_hours: null }] }));
    expect(r.ot_hours).toBe(3);
    expect(r.ot_amount).toBe(375);
    expect(r.gross).toBe(20375);
  });

  it("pays holiday work 1x and holiday OT 3x", () => {
    const r = calculatePayslip(base({
      monthlySalary: 24000,
      ot: [{ ot_type: "holiday_work", hours: 8, actual_hours: null }, { ot_type: "holiday_ot", hours: 2, actual_hours: null }],
    }));
    // ชั่วโมงละ 100
    expect(r.ot_amount).toBe(800 + 600);
  });

  it("prorates salary when starting mid-month", () => {
    const r = calculatePayslip(base({ employee: { start_date: "2026-01-17" } }));
    expect(r.salary_paid).toBe(15000); // 15 วัน × 1,000
  });

  it("no tax for 15,000 salary", () => {
    const r = calculatePayslip(base({ monthlySalary: 15000 }));
    expect(r.tax).toBe(0);
    expect(r.sso_employee).toBe(750);
    expect(r.net).toBe(14250);
  });

  it("spreads remaining tax over remaining months", () => {
    // ตุลาคม: เหลือ 3 เดือน, ที่ผ่านมามีเงินได้ 9 เดือน × 30,000 และหักภาษีไปแล้ว 9 × 164.58
    const r = calculatePayslip(base({
      period: { year: 2026, month: 10, start_date: "2026-10-01", end_date: "2026-10-31" },
      ytdBefore: { income: 270000, tax: 1481.22, sso: 7875, months: 9 },
    }));
    expect(r.calc_note.months_remaining).toBe(3);
    expect(r.tax).toBe(164.59);
    expect(r.ytd_income).toBe(300000);
  });

  it("counts allowances and manual items; non-taxable allowance skips tax and SSO", () => {
    const r = calculatePayslip(base({
      monthlySalary: 10000,
      allowances: [{ name: "ค่ากะ", amount: 1000, taxable: true }, { name: "ค่าเดินทาง", amount: 500, taxable: false }],
      manual: [{ kind: "deduction", label: "หักขาดงาน 1 วัน", amount: 333.33, taxable: true }],
    }));
    expect(r.gross).toBe(11500);
    expect(r.taxable_income).toBe(10666.67);
    expect(r.sso_employee).toBe(533);
    expect(r.net).toBe(11500 - 333.33 - 533);
  });

  it("applies tax profile deductions", () => {
    const a = calculatePayslip(base({ monthlySalary: 50000 }));
    const b = calculatePayslip(base({ monthlySalary: 50000, taxProfile: { spouse_no_income: true, children: 2, parents: 0, other_deductions: 0 } }));
    expect(b.tax).toBeLessThan(a.tax);
  });
});

describe("first month in the system mid-year", () => {
  it("assumes earlier months had the same pay, so October tax equals a steady month", () => {
    const jan = calculatePayslip(base({ monthlySalary: 80000 }));
    const oct = calculatePayslip(base({ monthlySalary: 80000, period: { year: 2026, month: 10, start_date: "2026-10-01", end_date: "2026-10-31" } }));
    expect(oct.calc_note.months_estimated).toBe(9);
    expect(oct.tax).toBe(jan.tax);
    expect(oct.tax).toBeGreaterThan(0);
  });
  it("does not estimate months before the employee started", () => {
    const r = calculatePayslip(base({
      employee: { start_date: "2026-10-17" },
      period: { year: 2026, month: 10, start_date: "2026-10-01", end_date: "2026-10-31" },
    }));
    expect(r.calc_note.months_estimated).toBe(0);
  });
  it("counts recorded months", () => {
    const r = calculatePayslip(base({
      period: { year: 2026, month: 10, start_date: "2026-10-01", end_date: "2026-10-31" },
      ytdBefore: { income: 270000, tax: 1481.22, sso: 7875, months: 9 },
    }));
    expect(r.calc_note.months_estimated).toBe(0);
  });
});

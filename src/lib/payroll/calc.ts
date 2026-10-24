// สูตรคำนวณเงินเดือน OT ประกันสังคม และภาษีหัก ณ ที่จ่าย
// ไม่แตะฐานข้อมูล ทดสอบได้ใน calc.test.ts ตัวเลขทุกตัวมาจาก payroll_settings

export type TaxBracket = { upto: number | null; rate: number };

export type PayrollSettings = {
  days_per_month: number;
  hours_per_day: number;
  ot_rate_workday: number;
  ot_rate_holiday_work: number;
  ot_rate_holiday_ot: number;
  ot_round_minutes: number;
  sso_rate: number;
  sso_min_base: number;
  sso_max_base: number;
  expense_rate: number;
  expense_cap: number;
  personal_allowance: number;
  spouse_allowance: number;
  child_allowance: number;
  parent_allowance: number;
  tax_brackets: TaxBracket[];
};

export type OtType = "workday" | "holiday_work" | "holiday_ot";

export const OT_TYPE_LABEL: Record<OtType, string> = {
  workday: "OT หลังเลิกงาน",
  holiday_work: "ทำงานวันหยุด",
  holiday_ot: "OT วันหยุด",
};

export type CalcInput = {
  settings: PayrollSettings;
  period: { year: number; month: number; start_date: string; end_date: string };
  employee: { start_date: string };
  monthlySalary: number;
  ot: { ot_type: OtType; hours: number; actual_hours: number | null }[];
  allowances: { name: string; amount: number; taxable: boolean }[];
  manual: { kind: "earning" | "deduction"; label: string; amount: number; taxable: boolean }[];
  taxProfile: { spouse_no_income: boolean; children: number; parents: number; other_deductions: number } | null;
  // ยอดสะสมจากสลิปในระบบของปีนี้ก่อนงวดนี้ และจำนวนเดือนที่มีสลิป
  ytdBefore: { income: number; tax: number; sso: number; months?: number };
};

export type CalcItem = {
  kind: "earning" | "deduction";
  code: string;
  label: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
  taxable: boolean;
};

export type CalcResult = {
  base_salary: number;
  salary_paid: number;
  ot_hours: number;
  ot_amount: number;
  allowances: number;
  other_earnings: number;
  deductions: number;
  gross: number;
  taxable_income: number;
  sso_employee: number;
  sso_employer: number;
  tax: number;
  net: number;
  ytd_income: number;
  ytd_tax: number;
  ytd_sso: number;
  items: CalcItem[];
  calc_note: Record<string, number>;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;
}

// ชั่วโมง OT ที่จ่าย = ค่าน้อยกว่าระหว่างที่อนุมัติกับที่สแกนจริง ปัดลงทีละ ot_round_minutes
export function paidOtHours(approved: number, actual: number | null, roundMinutes: number) {
  const h = actual == null ? approved : Math.min(approved, actual);
  if (roundMinutes <= 0) return round2(Math.max(0, h));
  const step = roundMinutes / 60;
  return round2(Math.floor(Math.max(0, h) / step + 1e-9) * step);
}

// ภาษีขั้นบันไดจากเงินได้สุทธิทั้งปี
export function progressiveTax(netIncome: number, brackets: TaxBracket[]) {
  let tax = 0;
  let lower = 0;
  for (const b of brackets) {
    const upper = b.upto ?? Infinity;
    if (netIncome <= lower) break;
    tax += (Math.min(netIncome, upper) - lower) * b.rate;
    lower = upper;
  }
  return round2(tax);
}

export function ssoContribution(wage: number, s: PayrollSettings) {
  if (wage <= 0) return 0;
  const base = Math.min(Math.max(wage, s.sso_min_base), s.sso_max_base);
  return Math.round(base * s.sso_rate);
}

export function calculatePayslip(input: CalcInput): CalcResult {
  const { settings: s, period, monthlySalary } = input;
  const items: CalcItem[] = [];

  // เงินเดือน: ถ้าเริ่มงานกลางงวด คิดตามจำนวนวัน (เงินเดือน ÷ วันต่อเดือน × วันที่ทำ)
  let salaryPaid = monthlySalary;
  let salaryDays: number | null = null;
  if (input.employee.start_date > period.start_date) {
    salaryDays = Math.max(0, daysBetween(input.employee.start_date, period.end_date));
    salaryPaid = round2(Math.min(monthlySalary, (monthlySalary / s.days_per_month) * salaryDays));
  }
  items.push({
    kind: "earning",
    code: "salary",
    label: salaryDays == null ? "เงินเดือน" : `เงินเดือน (${salaryDays} วัน)`,
    quantity: salaryDays,
    rate: salaryDays == null ? null : round2(monthlySalary / s.days_per_month),
    amount: salaryPaid,
    taxable: true,
  });

  // OT แยกตามอัตรา
  const hourly = monthlySalary / s.days_per_month / s.hours_per_day;
  const rates: Record<OtType, number> = {
    workday: s.ot_rate_workday,
    holiday_work: s.ot_rate_holiday_work,
    holiday_ot: s.ot_rate_holiday_ot,
  };
  let otHours = 0;
  let otAmount = 0;
  for (const type of ["workday", "holiday_work", "holiday_ot"] as OtType[]) {
    const hours = round2(
      input.ot.filter((o) => o.ot_type === type).reduce((sum, o) => sum + paidOtHours(o.hours, o.actual_hours, s.ot_round_minutes), 0),
    );
    if (hours <= 0) continue;
    const rate = round2(hourly * rates[type]);
    const amount = round2(hourly * rates[type] * hours);
    otHours += hours;
    otAmount += amount;
    items.push({ kind: "earning", code: `ot_${type}`, label: `${OT_TYPE_LABEL[type]} × ${rates[type]}`, quantity: hours, rate, amount, taxable: true });
  }
  otAmount = round2(otAmount);

  let allowances = 0;
  let taxableAllowances = 0;
  for (const a of input.allowances) {
    if (a.amount <= 0) continue;
    allowances += a.amount;
    if (a.taxable) taxableAllowances += a.amount;
    items.push({ kind: "earning", code: "allowance", label: a.name, quantity: null, rate: null, amount: round2(a.amount), taxable: a.taxable });
  }

  let otherEarnings = 0;
  let taxableOther = 0;
  let deductions = 0;
  let taxableDeductions = 0;
  for (const m of input.manual) {
    if (m.kind === "earning") {
      otherEarnings += m.amount;
      if (m.taxable) taxableOther += m.amount;
    } else {
      deductions += m.amount;
      if (m.taxable) taxableDeductions += m.amount;
    }
  }

  const gross = round2(salaryPaid + otAmount + allowances + otherEarnings);
  const taxableIncome = round2(Math.max(0, salaryPaid + otAmount + taxableAllowances + taxableOther - taxableDeductions));

  // ประกันสังคม: 5% ของค่าจ้าง ฐานต่ำสุด-สูงสุดตามค่าตั้งค่า บริษัทสมทบเท่ากัน
  const sso = ssoContribution(taxableIncome, s);
  if (sso > 0) items.push({ kind: "deduction", code: "sso", label: "ประกันสังคม", quantity: null, rate: s.sso_rate, amount: sso, taxable: false });

  // ภาษี: ประมาณเงินได้ทั้งปี แล้วเฉลี่ยภาษีที่ยังขาดเท่า ๆ กันในเดือนที่เหลือ
  // เดือนก่อนหน้าที่ทำงานอยู่แต่ไม่มีสลิปในระบบ (เช่น เริ่มใช้ระบบกลางปี) ถือว่าได้เท่าเดือนนี้และหักภาษีไปแล้ว
  const remaining = 12 - period.month + 1;
  const startYear = Number(input.employee.start_date.slice(0, 4));
  const firstMonth = startYear < period.year ? 1 : startYear === period.year ? Number(input.employee.start_date.slice(5, 7)) : period.month;
  const employedBefore = Math.max(0, period.month - firstMonth);
  const missing = Math.max(0, employedBefore - (input.ytdBefore.months ?? 0));
  const annualIncome = input.ytdBefore.income + taxableIncome * (missing + remaining);
  const expense = Math.min(annualIncome * s.expense_rate, s.expense_cap);
  const annualSso = input.ytdBefore.sso + sso * (missing + remaining);
  const tp = input.taxProfile;
  const allowanceTotal =
    s.personal_allowance +
    (tp?.spouse_no_income ? s.spouse_allowance : 0) +
    (tp?.children ?? 0) * s.child_allowance +
    (tp?.parents ?? 0) * s.parent_allowance +
    (tp?.other_deductions ?? 0) +
    annualSso;
  const netTaxable = Math.max(0, annualIncome - expense - allowanceTotal);
  const annualTax = progressiveTax(netTaxable, s.tax_brackets);
  const tax = round2(Math.max(0, (annualTax - input.ytdBefore.tax) / (remaining + missing)));
  if (tax > 0) items.push({ kind: "deduction", code: "tax", label: "ภาษีหัก ณ ที่จ่าย", quantity: null, rate: null, amount: tax, taxable: false });

  const net = round2(gross - deductions - sso - tax);

  return {
    base_salary: round2(monthlySalary),
    salary_paid: salaryPaid,
    ot_hours: round2(otHours),
    ot_amount: otAmount,
    allowances: round2(allowances),
    other_earnings: round2(otherEarnings),
    deductions: round2(deductions),
    gross,
    taxable_income: taxableIncome,
    sso_employee: sso,
    sso_employer: sso,
    tax,
    net,
    ytd_income: round2(input.ytdBefore.income + taxableIncome),
    ytd_tax: round2(input.ytdBefore.tax + tax),
    ytd_sso: round2(input.ytdBefore.sso + sso),
    items,
    calc_note: {
      hourly_rate: round2(hourly),
      months_remaining: remaining,
      months_estimated: missing,
      annual_income_estimate: round2(annualIncome),
      expense_deduction: round2(expense),
      allowances_total: round2(allowanceTotal),
      net_taxable_income: round2(netTaxable),
      annual_tax_estimate: annualTax,
      tax_paid_before: round2(input.ytdBefore.tax),
    },
  };
}

// งวดเดือนปกติ: วันที่ 1 ถึงสิ้นเดือน
export function defaultPeriodDates(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { start_date: `${year}-${mm}-01`, end_date: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const periodLabel = (year: number, month: number) => `${THAI_MONTHS[month - 1]} ${year + 543}`;

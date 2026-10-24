import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { calculatePayslip, type OtType, type PayrollSettings } from "./calc";

type Num = number | string | null;
const n = (v: Num) => (v == null ? 0 : Number(v));

export async function loadSettings(supabase: SupabaseClient): Promise<PayrollSettings> {
  const { data, error } = await supabase.from("payroll_settings").select("*").single();
  if (error || !data) throw new Error("โหลดค่าตั้งค่าเงินเดือนไม่สำเร็จ");
  const s = data as Record<string, unknown>;
  const num = (k: string) => Number(s[k]);
  return {
    days_per_month: num("days_per_month"),
    hours_per_day: num("hours_per_day"),
    ot_rate_workday: num("ot_rate_workday"),
    ot_rate_holiday_work: num("ot_rate_holiday_work"),
    ot_rate_holiday_ot: num("ot_rate_holiday_ot"),
    ot_round_minutes: num("ot_round_minutes"),
    sso_rate: num("sso_rate"),
    sso_min_base: num("sso_min_base"),
    sso_max_base: num("sso_max_base"),
    expense_rate: num("expense_rate"),
    expense_cap: num("expense_cap"),
    personal_allowance: num("personal_allowance"),
    spouse_allowance: num("spouse_allowance"),
    child_allowance: num("child_allowance"),
    parent_allowance: num("parent_allowance"),
    tax_brackets: s.tax_brackets as PayrollSettings["tax_brackets"],
  };
}

// เงินเดือนล่าสุดที่มีผล ณ วันที่ระบุ ของพนักงานแต่ละคน
export function latestSalaries(rows: { employee_id: string; monthly_salary: Num; effective_date: string }[], asOf: string) {
  const map = new Map<string, { salary: number; effective_date: string }>();
  for (const r of rows) {
    if (r.effective_date > asOf) continue;
    const cur = map.get(r.employee_id);
    if (!cur || r.effective_date > cur.effective_date) map.set(r.employee_id, { salary: n(r.monthly_salary), effective_date: r.effective_date });
  }
  return map;
}

// คำนวณสลิปทุกคนในงวด (ใช้สิทธิ์ของผู้ใช้ที่ล็อกอิน: RLS อนุญาตเฉพาะ CEO/บัญชี และงวดที่ยังเป็นร่าง)
export async function calculatePeriod(supabase: SupabaseClient, periodId: string) {
  const { data: period, error: pErr } = await supabase
    .from("payroll_periods")
    .select("id, year, month, start_date, end_date, status")
    .eq("id", periodId)
    .single();
  if (pErr || !period) throw new Error("ไม่พบงวดเงินเดือน");
  if (period.status !== "draft") throw new Error("งวดนี้ส่งตรวจแล้ว ต้องย้อนกลับเป็นร่างก่อนคำนวณใหม่");

  const settings = await loadSettings(supabase);

  const [emps, salaries, ots, allowances, taxProfiles, existing, prior] = await Promise.all([
    supabase.from("employees").select("id, code, first_name, last_name, start_date").eq("active", true).lte("start_date", period.end_date),
    supabase.from("salary_history").select("employee_id, monthly_salary, effective_date").lte("effective_date", period.end_date),
    fetchAll((a, b) =>
      supabase
        .from("ot_requests")
        .select("employee_id, ot_type, hours, actual_hours")
        .eq("status", "approved")
        .gte("work_date", period.start_date)
        .lte("work_date", period.end_date)
        .order("id")
        .range(a, b),
    ),
    supabase.from("recurring_allowances").select("employee_id, name, amount, taxable").eq("active", true),
    supabase.from("tax_profiles").select("*"),
    supabase.from("payslips").select("id, employee_id, payslip_items(kind, label, amount, taxable, manual)").eq("period_id", periodId),
    fetchAll((a, b) =>
      supabase
        .from("payslips")
        .select("employee_id, taxable_income, tax, sso_employee, payroll_periods!inner(year, month)")
        .eq("payroll_periods.year", period.year)
        .lt("payroll_periods.month", period.month)
        .order("id")
        .range(a, b),
    ),
  ]);
  for (const r of [emps, salaries, ots, allowances, taxProfiles, existing, prior]) {
    if (r.error) throw new Error(`โหลดข้อมูลไม่สำเร็จ: ${r.error.message}`);
  }

  const salaryOf = latestSalaries(salaries.data ?? [], period.end_date);
  const existingByEmp = new Map((existing.data ?? []).map((p) => [p.employee_id as string, p]));

  const ytd = new Map<string, { income: number; tax: number; sso: number; months: number }>();
  for (const p of prior.data ?? []) {
    const cur = ytd.get(p.employee_id) ?? { income: 0, tax: 0, sso: 0, months: 0 };
    cur.months += 1;
    cur.income += n(p.taxable_income);
    cur.tax += n(p.tax);
    cur.sso += n(p.sso_employee);
    ytd.set(p.employee_id, cur);
  }

  const missingSalary: string[] = [];
  const slips: Record<string, unknown>[] = [];
  const itemsByEmp = new Map<string, ReturnType<typeof calculatePayslip>["items"]>();

  for (const e of emps.data ?? []) {
    const sal = salaryOf.get(e.id);
    if (!sal) {
      missingSalary.push(`${e.code} ${e.first_name}`);
      continue;
    }
    const manual = ((existingByEmp.get(e.id)?.payslip_items ?? []) as { kind: "earning" | "deduction"; label: string; amount: Num; taxable: boolean; manual: boolean }[])
      .filter((i) => i.manual)
      .map((i) => ({ kind: i.kind, label: i.label, amount: n(i.amount), taxable: i.taxable }));
    const tp = (taxProfiles.data ?? []).find((t) => t.employee_id === e.id);

    const r = calculatePayslip({
      settings,
      period,
      employee: { start_date: e.start_date },
      monthlySalary: sal.salary,
      ot: (ots.data ?? [])
        .filter((o) => o.employee_id === e.id)
        .map((o) => ({ ot_type: o.ot_type as OtType, hours: n(o.hours), actual_hours: o.actual_hours == null ? null : n(o.actual_hours) })),
      allowances: (allowances.data ?? []).filter((a) => a.employee_id === e.id).map((a) => ({ name: a.name, amount: n(a.amount), taxable: a.taxable })),
      manual,
      taxProfile: tp
        ? { spouse_no_income: tp.spouse_no_income, children: tp.children, parents: tp.parents, other_deductions: n(tp.other_deductions) }
        : null,
      ytdBefore: ytd.get(e.id) ?? { income: 0, tax: 0, sso: 0, months: 0 },
    });

    const { items, ...totals } = r;
    slips.push({ period_id: periodId, employee_id: e.id, ...totals });
    itemsByEmp.set(e.id, items);
  }

  // ลบสลิปของคนที่ไม่เข้าเงื่อนไขแล้ว (ลาออก หรือยังไม่ตั้งเงินเดือน)
  const keep = new Set(slips.map((s) => s.employee_id as string));
  const stale = (existing.data ?? []).filter((p) => !keep.has(p.employee_id)).map((p) => p.id);
  if (stale.length) {
    const { error } = await supabase.from("payslips").delete().in("id", stale);
    if (error) throw new Error(`ลบสลิปเก่าไม่สำเร็จ: ${error.message}`);
  }

  if (slips.length) {
    const { data: saved, error } = await supabase
      .from("payslips")
      .upsert(slips, { onConflict: "period_id,employee_id" })
      .select("id, employee_id");
    if (error || !saved) throw new Error(`บันทึกสลิปไม่สำเร็จ: ${error?.message}`);

    const ids = saved.map((s) => s.id);
    const del = await supabase.from("payslip_items").delete().in("payslip_id", ids).eq("manual", false);
    if (del.error) throw new Error(`ล้างรายการเก่าไม่สำเร็จ: ${del.error.message}`);

    const rows = saved.flatMap((s) =>
      (itemsByEmp.get(s.employee_id) ?? []).map((it, i) => ({ payslip_id: s.id, ...it, manual: false, sort: i })),
    );
    if (rows.length) {
      const ins = await supabase.from("payslip_items").insert(rows);
      if (ins.error) throw new Error(`บันทึกรายการในสลิปไม่สำเร็จ: ${ins.error.message}`);
    }
  }

  await supabase.rpc("mark_payroll_calculated", { period: periodId });
  return { count: slips.length, missingSalary };
}

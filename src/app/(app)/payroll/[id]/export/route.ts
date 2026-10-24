import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { periodLabel } from "@/lib/payroll/calc";
import { PAYERS, bankFileRows, type Payer } from "@/lib/payroll/bank";
import { loadTransferPlan } from "@/lib/payroll/transfers";

// ส่งออกไฟล์ CSV (เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยน) ให้บัญชีนำไปยื่น/โอนเงิน
const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
const f2 = (v: unknown) => Number(v ?? 0).toFixed(2);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type") ?? "summary";
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["ceo", "accounting"].includes(profile.role)) return new NextResponse("Forbidden", { status: 403 });

  const { data: period } = await supabase.from("payroll_periods").select("year, month, pay_date, end_date, status").eq("id", id).single();
  if (!period) return new NextResponse("Not found", { status: 404 });

  if (type === "bank") {
    // ไฟล์โอนเงิน: เฉพาะงวดที่ CEO อนุมัติแล้ว และข้อมูลบัญชีครบทุกคน เพื่อไม่ให้มีใครตกหล่น
    const payer = req.nextUrl.searchParams.get("bank") as Payer;
    if (!(payer in PAYERS)) return new NextResponse("Unknown bank", { status: 400 });
    const text = (msg: string, status: number) => new NextResponse(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (period.status !== "approved" && period.status !== "closed") return text("ดาวน์โหลดไฟล์โอนเงินได้หลัง CEO อนุมัติเงินเดือนงวดนี้", 409);
    const plan = await loadTransferPlan(supabase, id);
    if (plan.problems.length) return text(`ยังมีพนักงาน ${plan.problems.length} คนที่ข้อมูลบัญชีไม่ครบ: ${plan.problems.map((p) => `${p.code} ${p.problem}`).join(", ")}`, 409);
    const rows = plan.byPayer[payer];
    if (!rows.length) return text(`ไม่มีรายการที่โอนจาก ${PAYERS[payer].label} ในงวดนี้`, 404);
    const csvText = csv(
      bankFileRows(payer, rows, {
        companyName: plan.settings.company_name,
        companyAccount: payer === "scb" ? plan.settings.scb_account : plan.settings.kbank_account,
        companyId: payer === "scb" ? plan.settings.scb_company_id : plan.settings.kbank_company_id,
        payDate: period.pay_date ?? period.end_date,
      }),
    );
    const file = `payroll-${period.year}-${String(period.month).padStart(2, "0")}-${payer}.csv`;
    return new NextResponse(csvText, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}"` },
    });
  }
  const { data: settings } = await supabase.from("payroll_settings").select("sso_min_base, sso_max_base").single();

  const { data: slips } = await supabase
    .from("payslips")
    .select("salary_paid, ot_hours, ot_amount, allowances, other_earnings, deductions, gross, taxable_income, sso_employee, sso_employer, tax, net, employees(code, first_name, last_name, national_id, bank_name, bank_account)")
    .eq("period_id", id);
  type E = { code: string; first_name: string; last_name: string; national_id: string | null; bank_name: string | null; bank_account: string | null };
  const list = (slips ?? [])
    .map((s) => ({ ...s, e: s.employees as unknown as E }))
    .sort((a, b) => a.e.code.localeCompare(b.e.code));

  let rows: unknown[][];
  let name: string;
  if (type === "sso") {
    // ข้อมูลสำหรับกรอก สปส.1-10 (ค่าจ้างที่ใช้คำนวณ = ตามฐานต่ำสุด-สูงสุด)
    const lo = Number(settings?.sso_min_base ?? 1650);
    const hi = Number(settings?.sso_max_base ?? 17500);
    rows = [["ลำดับ", "เลขประจำตัวประชาชน", "ชื่อ", "นามสกุล", "ค่าจ้างจริง", "ค่าจ้างที่ใช้คำนวณ", "เงินสมทบผู้ประกันตน", "เงินสมทบนายจ้าง"]];
    list.forEach((s, i) => {
      const wage = Number(s.taxable_income);
      rows.push([i + 1, s.e.national_id ?? "", s.e.first_name, s.e.last_name, f2(wage), f2(wage > 0 ? Math.min(Math.max(wage, lo), hi) : 0), f2(s.sso_employee), f2(s.sso_employer)]);
    });
    rows.push(["", "", "", "รวม", f2(list.reduce((a, s) => a + Number(s.taxable_income), 0)), "", f2(list.reduce((a, s) => a + Number(s.sso_employee), 0)), f2(list.reduce((a, s) => a + Number(s.sso_employer), 0))]);
    name = "sso";
  } else if (type === "pnd1") {
    rows = [["ลำดับ", "เลขประจำตัวผู้เสียภาษี", "ชื่อ", "นามสกุล", "วันที่จ่าย", "เงินได้ที่จ่าย", "ภาษีที่หักและนำส่ง", "เงื่อนไข"]];
    list.forEach((s, i) => rows.push([i + 1, s.e.national_id ?? "", s.e.first_name, s.e.last_name, period.pay_date ?? "", f2(s.taxable_income), f2(s.tax), "1"]));
    rows.push(["", "", "", "รวม", "", f2(list.reduce((a, s) => a + Number(s.taxable_income), 0)), f2(list.reduce((a, s) => a + Number(s.tax), 0)), ""]);
    name = "pnd1";
  } else {
    rows = [["รหัส", "ชื่อ", "นามสกุล", "เลขบัตรประชาชน", "ธนาคาร", "เลขบัญชี", "เงินเดือน", "ชั่วโมง OT", "ค่า OT", "เบี้ยเลี้ยง", "รายได้อื่น", "รายการหัก", "รายได้รวม", "ประกันสังคม", "ภาษี", "รับสุทธิ", "บริษัทสมทบประกันสังคม"]];
    for (const s of list) {
      rows.push([s.e.code, s.e.first_name, s.e.last_name, s.e.national_id ?? "", s.e.bank_name ?? "", s.e.bank_account ?? "", f2(s.salary_paid), s.ot_hours, f2(s.ot_amount), f2(s.allowances), f2(s.other_earnings), f2(s.deductions), f2(s.gross), f2(s.sso_employee), f2(s.tax), f2(s.net), f2(s.sso_employer)]);
    }
    name = "summary";
  }

  const file = `payroll-${period.year}-${String(period.month).padStart(2, "0")}-${name}.csv`;
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(`${periodLabel(period.year, period.month)}-${name}.csv`)}`,
    },
  });
}

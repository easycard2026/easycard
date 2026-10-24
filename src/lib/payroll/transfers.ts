import type { SupabaseClient } from "@supabase/supabase-js";
import { accountProblem, payerFor, type Payer, type TransferRow } from "./bank";

type Emp = {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  national_id: string | null;
  bank_code: string | null;
  bank_account: string | null;
  bank_account_name: string | null;
};

export type TransferPlan = {
  settings: {
    company_name: string | null;
    scb_account: string | null;
    scb_company_id: string | null;
    kbank_account: string | null;
    kbank_company_id: string | null;
    other_bank_payer: Payer;
  };
  byPayer: Record<Payer, TransferRow[]>;
  problems: { employeeId: string; code: string; name: string; problem: string }[];
};

// แบ่งสลิปในงวดตามธนาคารที่ใช้โอน และรวบรวมคนที่ข้อมูลบัญชียังไม่พร้อม
export async function loadTransferPlan(supabase: SupabaseClient, periodId: string): Promise<TransferPlan> {
  const [{ data: bank }, { data: slips, error }] = await Promise.all([
    supabase.from("payroll_bank_settings").select("company_name, scb_account, scb_company_id, kbank_account, kbank_company_id, other_bank_payer").maybeSingle(),
    supabase
      .from("payslips")
      .select("net, employees(id, code, first_name, last_name, national_id, bank_code, bank_account, bank_account_name)")
      .eq("period_id", periodId),
  ]);
  if (error) throw new Error(`โหลดสลิปไม่สำเร็จ: ${error.message}`);

  const settings: TransferPlan["settings"] = {
    company_name: bank?.company_name ?? null,
    scb_account: bank?.scb_account ?? null,
    scb_company_id: bank?.scb_company_id ?? null,
    kbank_account: bank?.kbank_account ?? null,
    kbank_company_id: bank?.kbank_company_id ?? null,
    other_bank_payer: (bank?.other_bank_payer as Payer) ?? "kbank",
  };
  const byPayer: Record<Payer, TransferRow[]> = { scb: [], kbank: [] };
  const problems: TransferPlan["problems"] = [];

  const list = (slips ?? [])
    .map((s) => ({ net: Number(s.net), e: s.employees as unknown as Emp }))
    .filter((s) => s.e && s.net > 0)
    .sort((a, b) => a.e.code.localeCompare(b.e.code));

  for (const { net, e } of list) {
    const name = `${e.first_name} ${e.last_name}`;
    const problem = accountProblem(e.bank_code, e.bank_account);
    if (problem) {
      problems.push({ employeeId: e.id, code: e.code, name, problem });
      continue;
    }
    byPayer[payerFor(e.bank_code, settings.other_bank_payer)].push({
      code: e.code,
      name: e.bank_account_name || name,
      bankCode: e.bank_code!,
      account: e.bank_account!,
      amount: Math.round(net * 100) / 100,
      nationalId: e.national_id,
    });
  }
  return { settings, byPayer, problems };
}

// ไฟล์โอนเงินเดือนเข้าบัญชีพนักงาน
// รูปแบบไฟล์อยู่ที่ไฟล์นี้ที่เดียว เมื่อได้ไฟล์ตัวอย่างหรือสเปกจากธนาคาร ปรับเฉพาะ bankFileRows

// รหัสธนาคาร 3 หลักตามธนาคารแห่งประเทศไทย และความยาวเลขบัญชี
export const BANKS = [
  { code: "014", short: "SCB", name: "ไทยพาณิชย์", digits: [10] },
  { code: "004", short: "KBANK", name: "กสิกรไทย", digits: [10] },
  { code: "002", short: "BBL", name: "กรุงเทพ", digits: [10] },
  { code: "006", short: "KTB", name: "กรุงไทย", digits: [10] },
  { code: "025", short: "BAY", name: "กรุงศรีอยุธยา", digits: [10] },
  { code: "011", short: "TTB", name: "ทหารไทยธนชาต", digits: [10] },
  { code: "030", short: "GSB", name: "ออมสิน", digits: [12] },
  { code: "034", short: "BAAC", name: "ธ.ก.ส.", digits: [12] },
  { code: "033", short: "GHB", name: "อาคารสงเคราะห์", digits: [12] },
  { code: "024", short: "UOB", name: "ยูโอบี", digits: [10] },
  { code: "022", short: "CIMB", name: "ซีไอเอ็มบี ไทย", digits: [10] },
  { code: "069", short: "KKP", name: "เกียรตินาคินภัทร", digits: [10] },
  { code: "067", short: "TISCO", name: "ทิสโก้", digits: [10] },
  { code: "073", short: "LHB", name: "แลนด์ แอนด์ เฮ้าส์", digits: [10] },
  { code: "071", short: "TCRB", name: "ไทยเครดิต", digits: [10] },
  { code: "066", short: "ISBT", name: "อิสลามแห่งประเทศไทย", digits: [10] },
  { code: "070", short: "ICBC", name: "ไอซีบีซี (ไทย)", digits: [10] },
] as const;

export type Payer = "scb" | "kbank";
export const PAYERS: Record<Payer, { label: string; bankCode: string }> = {
  scb: { label: "SCB ไทยพาณิชย์", bankCode: "014" },
  kbank: { label: "กสิกรไทย", bankCode: "004" },
};

export const bankByCode = (code: string | null | undefined) => BANKS.find((b) => b.code === code) ?? null;
export const bankLabel = (code: string | null | undefined) => {
  const b = bankByCode(code);
  return b ? `${b.short} ${b.name}` : null;
};

export const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// ตรวจบัญชีรับเงิน คืนข้อความปัญหา หรือ null ถ้าใช้ได้
export function accountProblem(code: string | null | undefined, account: string | null | undefined) {
  const bank = bankByCode(code);
  if (!bank) return "ยังไม่ได้เลือกธนาคาร";
  const acct = digitsOnly(account);
  if (!acct) return "ยังไม่มีเลขบัญชี";
  if (!(bank.digits as readonly number[]).includes(acct.length)) return `เลขบัญชี ${bank.short} ต้องมี ${bank.digits.join(" หรือ ")} หลัก`;
  return null;
}

// พนักงานธนาคารเดียวกันโอนจากบัญชีนั้น ธนาคารอื่นโอนจากธนาคารที่ตั้งไว้
export function payerFor(bankCode: string | null | undefined, otherBankPayer: Payer): Payer {
  if (bankCode === PAYERS.scb.bankCode) return "scb";
  if (bankCode === PAYERS.kbank.bankCode) return "kbank";
  return otherBankPayer;
}

export type TransferRow = {
  code: string;
  name: string;
  bankCode: string;
  account: string;
  amount: number;
  nationalId: string | null;
};

export type BankMeta = {
  companyName: string | null;
  companyAccount: string | null;
  companyId: string | null;
  payDate: string; // YYYY-MM-DD
};

// แถวของไฟล์ (หัวตาราง + รายการ + ยอดรวม) เป็นรูปแบบกลางที่เปิดใน Excel ได้
// คอลัมน์เป็นข้อมูลที่ระบบจ่ายเงินเดือนของทั้งสองธนาคารต้องใช้ รอปรับให้ตรงเทมเพลตจริงของบริษัท
export function bankFileRows(payer: Payer, rows: TransferRow[], meta: BankMeta): (string | number)[][] {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const d = meta.payDate.replace(/-/g, "");
  const ddmmyyyy = `${d.slice(6, 8)}/${d.slice(4, 6)}/${d.slice(0, 4)}`;
  return [
    ["Company Name", meta.companyName ?? "", "Company ID", meta.companyId ?? "", "Debit Account", digitsOnly(meta.companyAccount), "Effective Date", ddmmyyyy, "Bank", PAYERS[payer].label],
    ["No.", "Receiving Bank Code", "Receiving Bank", "Account No.", "Account Name", "Amount", "Employee Code", "National ID", "Transfer Type"],
    ...rows.map((r, i) => [
      i + 1,
      r.bankCode,
      bankByCode(r.bankCode)?.short ?? "",
      digitsOnly(r.account),
      r.name,
      r.amount.toFixed(2),
      r.code,
      r.nationalId ?? "",
      r.bankCode === PAYERS[payer].bankCode ? "SAME BANK" : "OTHER BANK",
    ]),
    ["", "", "", "", "Total", total.toFixed(2), `${rows.length} items`, "", ""],
  ];
}

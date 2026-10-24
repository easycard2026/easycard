import { describe, expect, it } from "vitest";
import { accountProblem, bankFileRows, payerFor } from "./bank";

describe("bank transfer", () => {
  it("checks account numbers per bank", () => {
    expect(accountProblem("014", "123-4-56789-0")).toBeNull();
    expect(accountProblem("014", "12345")).toMatch(/10 หลัก/);
    expect(accountProblem("030", "1234567890")).toMatch(/12 หลัก/);
    expect(accountProblem("030", "123456789012")).toBeNull();
    expect(accountProblem(null, "1234567890")).toMatch(/ธนาคาร/);
    expect(accountProblem("004", "")).toMatch(/เลขบัญชี/);
  });

  it("pays same-bank staff from that bank and others from the chosen bank", () => {
    expect(payerFor("014", "kbank")).toBe("scb");
    expect(payerFor("004", "scb")).toBe("kbank");
    expect(payerFor("002", "scb")).toBe("scb");
    expect(payerFor("006", "kbank")).toBe("kbank");
  });

  it("builds rows with totals", () => {
    const rows = bankFileRows(
      "scb",
      [
        { code: "E001", name: "สมชาย ใจดี", bankCode: "014", account: "111-2-33333-4", amount: 25000.5, nationalId: null },
        { code: "E002", name: "สมหญิง", bankCode: "002", account: "5555555555", amount: 1000, nationalId: "1100000000001" },
      ],
      { companyName: "Easy", companyAccount: "999-9-99999-9", companyId: "C1", payDate: "2026-10-31" },
    );
    expect(rows[0]).toContain("31/10/2026");
    expect(rows[0]).toContain("9999999999");
    expect(rows[2]).toEqual([1, "014", "SCB", "1112333334", "สมชาย ใจดี", "25000.50", "E001", "", "SAME BANK"]);
    expect(rows[3][8]).toBe("OTHER BANK");
    expect(rows[4][5]).toBe("26000.50");
  });
});

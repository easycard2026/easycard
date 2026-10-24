import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayBangkok, thaiDate } from "@/lib/format";
import { periodLabel } from "@/lib/payroll/calc";
import { PAYROLL_STATUS, type PayrollStatus } from "@/lib/payroll/labels";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { Notice, baht } from "@/components/notice";
import { IconArrowRight } from "@/components/icons";
import { createPeriod } from "./actions";

export default async function PayrollPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/payslips");

  const { data: periods } = await supabase
    .from("payroll_periods")
    .select("id, year, month, pay_date, status, payslips(net, gross)")
    .order("year", { ascending: false })
    .order("month", { ascending: false });

  const today = todayBangkok();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="ส่วนที่ 4" title="เงินเดือน" description="สร้างงวด ระบบคำนวณให้ บัญชีตรวจ แล้ว CEO อนุมัติ">
        <div className="flex gap-2">
          <Link href="/payroll/salaries" className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            ตั้งเงินเดือนพนักงาน
          </Link>
          <Link href="/payroll/settings" className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            ค่าตั้งค่า
          </Link>
        </div>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="rise p-4">
          <h2 className="font-semibold">สร้างงวดใหม่</h2>
          <p className="text-[13px] text-zinc-400">งวดละ 1 เดือน (วันที่ 1 ถึงสิ้นเดือน)</p>
          <form action={createPeriod} className="mt-4 space-y-3">
            <Field label="เดือน">
              <input type="month" name="month" required defaultValue={today.slice(0, 7)} className={inputClass} />
            </Field>
            <Field label="วันจ่ายเงิน" hint="เว้นว่าง = วันสิ้นเดือน">
              <input type="date" name="pay_date" className={inputClass} />
            </Field>
            <SubmitButton className="w-full">สร้างและคำนวณ</SubmitButton>
          </form>
        </Card>

        <Card className="rise overflow-hidden lg:col-span-2">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold">งวดเงินเดือน</h2>
          </div>
          {!periods?.length ? (
            <EmptyState title="ยังไม่มีงวดเงินเดือน" hint="เริ่มจากตั้งเงินเดือนพนักงาน แล้วสร้างงวดแรก" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {periods.map((p) => {
                const slips = (p.payslips ?? []) as { net: number; gross: number }[];
                const net = slips.reduce((s, x) => s + Number(x.net), 0);
                const st = PAYROLL_STATUS[p.status as PayrollStatus];
                return (
                  <li key={p.id}>
                    <Link href={`/payroll/${p.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-50/70">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{periodLabel(p.year, p.month)}</p>
                        <p className="text-[13px] text-zinc-400">
                          {slips.length} คน · จ่าย {thaiDate(p.pay_date)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular font-medium">฿{baht(net)}</p>
                        <p className="text-xs text-zinc-400">รับสุทธิรวม</p>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      <IconArrowRight className="hidden size-4 text-zinc-300 sm:block" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

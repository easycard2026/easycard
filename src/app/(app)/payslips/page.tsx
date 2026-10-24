import Link from "next/link";
import { getSession } from "@/lib/session";
import { thaiDate } from "@/lib/format";
import { periodLabel } from "@/lib/payroll/calc";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { baht } from "@/components/notice";
import { IconArrowRight } from "@/components/icons";

export default async function PayslipsPage() {
  const { supabase, role, employeeId } = await getSession();

  // สลิปของตัวเองที่ CEO อนุมัติแล้ว (CEO/บัญชีดูของทุกคนได้ที่หน้าเงินเดือน)
  const { data } = employeeId
    ? await supabase
        .from("payslips")
        .select("id, gross, net, ot_amount, payroll_periods!inner(year, month, pay_date, status)")
        .eq("employee_id", employeeId)
        .in("payroll_periods.status", ["approved", "closed"])
    : { data: [] };
  type P = { year: number; month: number; pay_date: string | null };
  const slips = (data ?? [])
    .map((s) => ({ ...s, p: s.payroll_periods as unknown as P }))
    .sort((a, b) => b.p.year - a.p.year || b.p.month - a.p.month);

  return (
    <div className="space-y-5">
      <PageHeader
        title="สลิปเงินเดือน"
        description={role === "ceo" || role === "accounting" ? "สลิปของคุณเอง ส่วนสลิปของทุกคนดูได้ที่เมนูเงินเดือน" : "สลิปจะแสดงเมื่อ CEO อนุมัติเงินเดือนของงวดนั้นแล้ว"}
      />
      <Card className="rise overflow-hidden">
        {!employeeId ? (
          <EmptyState title="บัญชีนี้ยังไม่ได้ผูกกับข้อมูลพนักงาน" hint="ติดต่อฝ่ายบุคคลเพื่อเชื่อมบัญชีของคุณ" />
        ) : slips.length === 0 ? (
          <EmptyState title="ยังไม่มีสลิป" hint="สลิปเดือนแรกจะแสดงที่นี่หลังอนุมัติเงินเดือน" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {slips.map((s) => (
              <li key={s.id}>
                <Link href={`/payslips/${s.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-zinc-50/70">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{periodLabel(s.p.year, s.p.month)}</p>
                    <p className="text-[13px] text-zinc-400">จ่ายวันที่ {thaiDate(s.p.pay_date)}{Number(s.ot_amount) > 0 ? ` · OT ${baht(s.ot_amount)}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular font-semibold">฿{baht(s.net)}</p>
                    <p className="text-xs text-zinc-400">รับสุทธิ</p>
                  </div>
                  <IconArrowRight className="size-4 text-zinc-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { latestSalaries } from "@/lib/payroll/run";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackLink, baht } from "@/components/notice";
import { IconArrowRight } from "@/components/icons";

export default async function SalariesPage() {
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/");

  const [{ data: emps }, { data: salaries }, { data: allowances }] = await Promise.all([
    supabase.from("employees").select("id, code, first_name, last_name, active, departments(name)").order("code"),
    supabase.from("salary_history").select("employee_id, monthly_salary, effective_date"),
    supabase.from("recurring_allowances").select("employee_id, amount").eq("active", true),
  ]);
  const current = latestSalaries(salaries ?? [], todayBangkok());
  const allowanceSum = new Map<string, number>();
  for (const a of allowances ?? []) allowanceSum.set(a.employee_id, (allowanceSum.get(a.employee_id) ?? 0) + Number(a.amount));
  const missing = (emps ?? []).filter((e) => e.active && !current.has(e.id)).length;

  return (
    <div className="space-y-5">
      <BackLink href="/payroll">เงินเดือน</BackLink>
      <PageHeader title="ตั้งเงินเดือนพนักงาน" description="เงินเดือน เบี้ยเลี้ยงประจำ และค่าลดหย่อนภาษีของแต่ละคน" />
      {missing > 0 && (
        <p className="rise rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          ยังไม่ได้ตั้งเงินเดือน {missing} คน คนที่ไม่มีเงินเดือนจะไม่ถูกคำนวณในงวด
        </p>
      )}
      <Card className="rise overflow-hidden">
        {!emps?.length ? (
          <EmptyState title="ยังไม่มีพนักงาน" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {emps.map((e) => {
              const s = current.get(e.id);
              const al = allowanceSum.get(e.id) ?? 0;
              return (
                <li key={e.id}>
                  <Link href={`/payroll/salaries/${e.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50/70">
                    <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {e.first_name} {e.last_name}
                        {!e.active && <span className="ml-2 text-xs font-normal text-zinc-400">(ไม่ใช้งาน)</span>}
                      </p>
                      <p className="truncate text-xs text-zinc-400">
                        {e.code} · {(e.departments as unknown as { name: string } | null)?.name ?? "ไม่ระบุแผนก"}
                      </p>
                    </div>
                    <div className="text-right">
                      {s ? (
                        <>
                          <p className="tabular font-medium">฿{baht(s.salary)}</p>
                          <p className="text-xs text-zinc-400">
                            {al > 0 ? `+ เบี้ยเลี้ยง ${baht(al)} · ` : ""}ตั้งแต่ {thaiDate(s.effective_date)}
                          </p>
                        </>
                      ) : (
                        <Badge tone="amber">ยังไม่ตั้งเงินเดือน</Badge>
                      )}
                    </div>
                    <IconArrowRight className="hidden size-4 text-zinc-300 sm:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

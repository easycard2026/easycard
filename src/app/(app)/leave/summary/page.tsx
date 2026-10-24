import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayBangkok } from "@/lib/format";
import { fmtDays, leaveBalances } from "@/lib/leave";
import { loadLeaveYear } from "@/lib/leave-load";
import { loadAttendance } from "@/lib/attendance/load";
import { summarize } from "@/lib/attendance/calc";
import { attendanceTotals } from "@/lib/payroll/calc";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/notice";

type Emp = { id: string; code: string; first_name: string; last_name: string };

const btn = "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50";
const dash = <span className="text-zinc-300">-</span>;

function shiftMonth(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function EmpCell({ e, year, extra }: { e: Emp; year: number; extra?: React.ReactNode }) {
  return (
    <td className="px-4 py-2">
      <Link href={`/leave/employee/${e.id}?year=${year}`} className="flex items-center gap-2.5">
        <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
        <span className="min-w-0">
          <span className="block truncate font-medium text-zinc-900 hover:underline">
            {e.first_name} {e.last_name}
          </span>
          <span className="tabular block text-[11px] text-zinc-400">
            {e.code}
            {extra}
          </span>
        </span>
      </Link>
    </td>
  );
}

export default async function LeaveSummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role === "employee") redirect("/leave");
  const today = todayBangkok();
  const view = sp.view === "year" ? "year" : "month";
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : Number((view === "month" ? ym : today).slice(0, 4));

  const tabs = (
    <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px]">
      {(["month", "year"] as const).map((v) => (
        <Link
          key={v}
          href={v === "month" ? `/leave/summary?month=${ym}` : `/leave/summary?view=year&year=${year}`}
          className={`rounded-md px-3 py-1 ${view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:text-zinc-900"}`}
        >
          {v === "month" ? "รายเดือน" : "สิทธิ์ทั้งปี"}
        </Link>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      <BackLink href="/leave">การลา</BackLink>
      {view === "month" ? <MonthView ym={ym} today={today} tabs={tabs} /> : <YearView year={year} today={today} tabs={tabs} />}
    </div>
  );

  // ---------- รายเดือน: มาสาย ขาดงาน และวันลาแต่ละประเภท ----------
  async function MonthView({ ym, today, tabs }: { ym: string; today: string; tabs: React.ReactNode }) {
    const [y, m] = ym.split("-").map(Number);
    const from = `${ym}-01`;
    const to = `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    const [att, { data: types }, { data: leaveDays }] = await Promise.all([
      loadAttendance(supabase, from, to, today),
      supabase.from("leave_types").select("code, name, active, sort").order("sort"),
      supabase.from("approved_leave_days").select("employee_id, leave_type, portion, unpaid_portion").gte("leave_date", from).lte("leave_date", to),
    ]);
    const leaveBy = new Map<string, number>();
    const unpaidBy = new Map<string, number>();
    for (const l of leaveDays ?? []) {
      const k = `${l.employee_id}|${l.leave_type}`;
      leaveBy.set(k, (leaveBy.get(k) ?? 0) + Number(l.portion));
      unpaidBy.set(l.employee_id, (unpaidBy.get(l.employee_id) ?? 0) + Number(l.unpaid_portion));
    }
    const used = new Set((leaveDays ?? []).map((l) => l.leave_type as string));
    const cols = (types ?? []).filter((t) => t.active || used.has(t.code));
    const monthLabel = new Date(`${from}T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });

    return (
      <>
        <PageHeader title={`สรุปขาด ลา มาสาย · ${monthLabel}`} description="มาสายและขาดงานคิดจากเวลาสแกนเทียบกับกะ วันลาที่อนุมัติแล้วไม่นับเป็นขาดงาน">
          <div className="flex flex-wrap gap-2">
            {tabs}
            <div className="flex gap-1">
              <Link href={`/leave/summary?month=${shiftMonth(ym, -1)}`} className={btn}>‹ เดือนก่อน</Link>
              <Link href={`/leave/summary?month=${shiftMonth(ym, 1)}`} className={btn}>เดือนถัดไป ›</Link>
            </div>
          </div>
        </PageHeader>
        {!att.hasAnyData && (
          <p className="rounded-xl bg-zinc-100/70 px-4 py-2.5 text-[13px] text-zinc-600">
            ยังไม่มีเวลาสแกนของเดือนนี้ ช่องมาสายและขาดงานจะขึ้นเมื่อนำเข้าไฟล์เครื่องสแกนแล้ว
          </p>
        )}
        <Card className="rise overflow-hidden">
          {att.employees.length === 0 ? (
            <EmptyState title="ยังไม่มีพนักงาน" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">พนักงาน</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">มาสาย (ครั้ง)</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">สายรวม (นาที)</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">ออกก่อน (นาที)</th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">ขาดงาน (วัน)</th>
                    {cols.map((t) => (
                      <th key={t.code} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{t.name}</th>
                    ))}
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">หักเงินลา (วัน)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {att.employees.map((e) => {
                    const days = att.grid.get(e.id) ?? [];
                    const s = summarize(days);
                    const t = attendanceTotals(days);
                    const unpaid = unpaidBy.get(e.id) ?? 0;
                    return (
                      <tr key={e.id} className="hover:bg-zinc-50/60">
                        <EmpCell e={e} year={y} />
                        <td className="tabular px-3 py-2 text-right">{s.lateDays ? <span className="text-amber-700">{s.lateDays}</span> : dash}</td>
                        <td className="tabular px-3 py-2 text-right">{t.lateMin ? t.lateMin.toLocaleString("th-TH") : dash}</td>
                        <td className="tabular px-3 py-2 text-right">{t.earlyMin ? t.earlyMin.toLocaleString("th-TH") : dash}</td>
                        <td className="tabular px-3 py-2 text-right">{t.absentDays ? <span className="font-medium text-rose-600">{t.absentDays}</span> : dash}</td>
                        {cols.map((t) => {
                          const d = leaveBy.get(`${e.id}|${t.code}`) ?? 0;
                          return <td key={t.code} className="tabular px-3 py-2 text-right">{d ? fmtDays(d) : dash}</td>;
                        })}
                        <td className="tabular px-4 py-2 text-right">{unpaid ? <span className="text-rose-600">{fmtDays(unpaid)}</span> : dash}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <p className="text-[11px] text-zinc-400">
          ระบบหักเงินเดือนอัตโนมัติ: ลาไม่รับค่าจ้าง ขาดงาน (ต่อวัน) มาสายและออกก่อน (ต่อนาที) เปิด/ปิดและตั้ง &quot;สายกี่นาทีนับเป็นขาดงาน&quot; ได้ที่ เงินเดือน → ค่าตั้งค่า
        </p>
      </>
    );
  }

  // ---------- ทั้งปี: วันลาที่ใช้เทียบกับสิทธิ์ ----------
  async function YearView({ year, today, tabs }: { year: number; today: string; tabs: React.ReactNode }) {
    const [{ data: emps }, data] = await Promise.all([
      supabase.from("employees").select("id, code, first_name, last_name, start_date").eq("active", true).order("code"),
      loadLeaveYear(supabase, year),
    ]);
    const types = data.types.filter((t) => t.active);
    const rows = (emps ?? []).map((e) => {
      const b = leaveBalances({
        types: data.types,
        entitlements: data.entitlements.filter((x) => x.employee_id === e.id),
        requests: data.requests.filter((x) => x.employee_id === e.id),
        year,
        employeeStart: e.start_date,
        today,
      });
      return {
        e,
        b,
        total: b.reduce((s, x) => s + x.used, 0),
        unpaid: b.reduce((s, x) => s + x.unpaidUsed, 0),
        pending: b.reduce((s, x) => s + x.pending, 0),
      };
    });

    return (
      <>
        <PageHeader title={`สิทธิ์การลาทั้งปี ${year + 543}`} description="วันลาที่อนุมัติแล้ว / สิทธิ์ทั้งปี กดชื่อพนักงานเพื่อดูวันคงเหลือหรือตั้งสิทธิ์เฉพาะคน">
          <div className="flex flex-wrap gap-2">
            {tabs}
            <div className="flex gap-1">
              <Link href={`/leave/summary?view=year&year=${year - 1}`} className={btn}>‹ {year + 542}</Link>
              <Link href={`/leave/summary?view=year&year=${year + 1}`} className={btn}>{year + 544} ›</Link>
            </div>
          </div>
        </PageHeader>
        <Card className="rise overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState title="ยังไม่มีพนักงาน" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs text-zinc-400">
                    <th className="px-4 py-2.5 font-medium">พนักงาน</th>
                    {types.map((t) => (
                      <th key={t.code} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{t.name}</th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">รวม</th>
                    <th className="whitespace-nowrap px-4 py-2.5 text-right font-medium">หักเงิน (วัน)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map(({ e, b, total, unpaid, pending }) => (
                    <tr key={e.id} className="hover:bg-zinc-50/60">
                      <EmpCell e={e} year={year} extra={pending > 0 && <span className="text-amber-600"> · รออนุมัติ {fmtDays(pending)} วัน</span>} />
                      {types.map((t) => {
                        const x = b.find((y) => y.code === t.code);
                        return (
                          <td key={t.code} className="tabular px-3 py-2 text-right">
                            {x?.eligibleFrom ? (
                              <span className="text-[11px] text-zinc-300">ยังไม่มีสิทธิ์</span>
                            ) : x && (x.used > 0 || x.max != null) ? (
                              <>
                                {x.used > 0 ? fmtDays(x.used) : <span className="text-zinc-300">0</span>}
                                {x.max != null && <span className="text-zinc-400">/{fmtDays(x.max)}</span>}
                              </>
                            ) : (
                              dash
                            )}
                          </td>
                        );
                      })}
                      <td className="tabular px-3 py-2 text-right font-medium">{total > 0 ? fmtDays(total) : dash}</td>
                      <td className="tabular px-4 py-2 text-right">{unpaid > 0 ? <span className="text-rose-600">{fmtDays(unpaid)}</span> : dash}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>
    );
  }
}

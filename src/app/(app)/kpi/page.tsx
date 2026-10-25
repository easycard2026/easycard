import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayBangkok } from "@/lib/format";
import { grade } from "@/lib/kpi";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Notice } from "@/components/notice";
import { EMP_SELECT, evaluate, loadItems, loadScores, type KpiEmp } from "./data";
import { MonthNav, ScoreBar } from "./month-nav";

export default async function KpiPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayBangkok().slice(0, 7);

  // พนักงานเห็นแค่ของตัวเอง
  if (role === "employee") {
    if (!employeeId) return <EmptyState title="บัญชีนี้ยังไม่ผูกกับข้อมูลพนักงาน" hint="ติดต่อ CEO ให้ผูกบัญชีก่อน" />;
    redirect(`/kpi/${employeeId}?month=${ym}`);
  }

  // RLS กรองให้แล้ว: CEO/บัญชี = ทุกคน, ผู้จัดการ = ตัวเอง + ลูกทีม
  const { data } = await supabase.from("employees").select(EMP_SELECT).eq("active", true).order("code");
  const emps = (data ?? []) as unknown as KpiEmp[];
  const [items, scores] = await Promise.all([loadItems(supabase), loadScores(supabase, `${ym}-01`)]);

  const rows = emps.map((e) => ({ emp: e, ...evaluate(e, items, scores) }));
  const scoredRows = rows.filter((r) => r.total !== null);
  const avg = scoredRows.length ? Math.round((scoredRows.reduce((s, r) => s + r.total!, 0) / scoredRows.length) * 10) / 10 : null;
  const pending = rows.filter((r) => r.rows.length > 0 && r.scored < r.rows.length).length;

  return (
    <div className="space-y-5">
      <PageHeader title="KPI พนักงาน" description={role === "manager" ? "ผล KPI ของคุณและลูกทีม กดที่ชื่อเพื่อกรอกผลงาน" : "ผล KPI ทุกคน กดที่ชื่อเพื่อกรอกผลงาน"}>
        <div className="flex flex-wrap items-center gap-2">
          <MonthNav base="/kpi" ym={ym} />
          <Link href="/kpi/items" className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800">
            ตั้งหัวข้อ KPI
          </Link>
        </div>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <div className="rise grid grid-cols-3 gap-2.5">
        {[
          { label: "คะแนนเฉลี่ย", value: avg === null ? "-" : `${avg}%` },
          { label: "ประเมินแล้ว", value: `${scoredRows.length}/${rows.length} คน` },
          { label: "ยังกรอกไม่ครบ", value: `${pending} คน` },
        ].map((s) => (
          <Card key={s.label} className="p-3">
            <p className="text-[11px] text-zinc-400">{s.label}</p>
            <p className="tabular mt-0.5 text-lg font-semibold">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="rise overflow-hidden">
        {items.length === 0 ? (
          <EmptyState title="ยังไม่มีหัวข้อ KPI" hint="กด “ตั้งหัวข้อ KPI” เพื่อเริ่ม เช่น ยอดขาย งานที่ปิดได้ ความพึงพอใจลูกค้า" />
        ) : rows.length === 0 ? (
          <EmptyState title="ไม่มีพนักงาน" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {rows.map(({ emp, total, scored, rows: r }) => {
              const g = grade(total);
              return (
                <li key={emp.id}>
                  <Link href={`/kpi/${emp.id}?month=${ym}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-50">
                    <Avatar first={emp.first_name} last={emp.last_name} seed={emp.id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-900">
                        {emp.first_name} {emp.last_name}
                        {emp.id === employeeId && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">(ฉัน)</span>}
                      </p>
                      <p className="truncate text-[11px] text-zinc-400">
                        {emp.code} · {emp.positions?.name ?? "ไม่ระบุตำแหน่ง"} · กรอกแล้ว {scored}/{r.length} หัวข้อ
                      </p>
                    </div>
                    <div className="hidden w-32 sm:block">
                      <ScoreBar score={total} />
                    </div>
                    <span className="tabular w-14 text-right text-[13px] font-semibold">{total === null ? "-" : `${total}%`}</span>
                    <span className="hidden w-24 justify-end sm:flex">
                      <Badge tone={g.tone}>{g.label}</Badge>
                    </span>
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

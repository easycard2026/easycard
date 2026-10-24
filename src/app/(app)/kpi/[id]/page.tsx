import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayBangkok } from "@/lib/format";
import { DIRECTION_LABEL, fmtNum, grade, monthRange } from "@/lib/kpi";
import { loadAttendance } from "@/lib/attendance/load";
import { fmtHours, summarize } from "@/lib/attendance/calc";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { saveKpiScores } from "../actions";
import { EMP_SELECT, canManage, evaluate, loadItems, loadScores, type KpiEmp } from "../data";
import { MonthNav, ScoreBar } from "../month-nav";

export default async function KpiEmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  const today = todayBangkok();
  const ym = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const { from, to } = monthRange(ym);

  const { data } = await supabase.from("employees").select(EMP_SELECT).eq("id", id).maybeSingle();
  if (!data) notFound();
  const emp = data as unknown as KpiEmp;

  const [items, scores, att] = await Promise.all([
    loadItems(supabase),
    loadScores(supabase, `${ym}-01`, [id]),
    // ตัวเลขการมาทำงานจากหน้าเวลาเข้าออก (ไม่นับวันที่ยังมาไม่ถึง)
    loadAttendance(supabase, from, to < today ? to : today < from ? from : today, today),
  ]);
  const { rows, total, scored } = evaluate(emp, items, scores);
  const g = grade(total);
  const editable = canManage(role, employeeId, emp);
  const isSelf = id === employeeId;
  const days = att.grid.get(id) ?? [];
  const sum = summarize(today < from ? [] : days);

  const attendance = [
    { label: "มาทำงาน", value: `${sum.workDays} วัน` },
    { label: "มาสาย", value: sum.lateDays ? `${sum.lateDays} ครั้ง · ${sum.lateMin} นาที` : "0 ครั้ง", warn: sum.lateDays > 0 },
    { label: "ขาดงาน", value: `${sum.absentDays} วัน`, warn: sum.absentDays > 0 },
    { label: "ลา", value: `${sum.leaveDays} วัน` },
    { label: "ออกก่อนเวลา", value: `${sum.earlyDays} ครั้ง`, warn: sum.earlyDays > 0 },
    { label: "OT ที่อนุมัติ", value: `${fmtNum(Math.round(sum.otHours * 100) / 100)} ชม.` },
    { label: "ชั่วโมงทำงาน", value: `${fmtHours(sum.workedMin)} ชม.` },
  ];

  return (
    <div className="space-y-5">
      {role !== "employee" && <BackLink href={`/kpi?month=${ym}`}>KPI พนักงาน</BackLink>}
      <PageHeader title={isSelf ? "KPI ของฉัน" : `KPI · ${emp.first_name} ${emp.last_name}`} description={`${emp.code} · ${emp.positions?.name ?? "ไม่ระบุตำแหน่ง"}`}>
        <MonthNav base={`/kpi/${id}`} ym={ym} />
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <Card className="rise flex items-center gap-4 p-4">
        <Avatar first={emp.first_name} last={emp.last_name} seed={emp.id} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-2xl font-semibold tracking-tight">{total === null ? "-" : `${total}%`}</span>
            <Badge tone={g.tone}>{g.label}</Badge>
          </div>
          <div className="mt-1.5 max-w-sm">
            <ScoreBar score={total} />
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">
            คะแนนรวมถ่วงน้ำหนัก · กรอกแล้ว {scored}/{rows.length} หัวข้อ
          </p>
        </div>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="rise overflow-hidden lg:col-span-2">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <div>
              <h2 className="font-semibold">หัวข้อ KPI</h2>
              <p className="text-[13px] text-zinc-400">{editable ? "กรอกผลงานจริงของเดือนนี้ ระบบคิดคะแนนให้เอง (เว้นว่าง = ยังไม่ประเมิน)" : "ผลงานเทียบกับเป้าหมาย"}</p>
            </div>
            {editable && (
              <Link href={`/kpi/items?employee=${id}`} className="shrink-0 text-xs font-medium text-brand-600 hover:underline">
                + หัวข้อเฉพาะคนนี้
              </Link>
            )}
          </div>
          {rows.length === 0 ? (
            <EmptyState title="ยังไม่มีหัวข้อ KPI สำหรับคนนี้" hint={editable ? "ไปที่ “ตั้งหัวข้อ KPI” เพื่อเพิ่ม" : "รอหัวหน้าตั้งหัวข้อ KPI"} />
          ) : (
            <form action={saveKpiScores}>
              <input type="hidden" name="employee_id" value={id} />
              <input type="hidden" name="month" value={ym} />
              <ul className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <li key={r.item.id} className="px-4 py-3">
                    <input type="hidden" name="item_id" value={r.item.id} />
                    {r.actual !== null && <input type="hidden" name={`target_${r.item.id}`} value={r.target} />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-zinc-900">
                          {r.item.name}
                          {r.item.employee_id && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">เฉพาะคนนี้</span>}
                        </p>
                        <p className="tabular text-[11px] text-zinc-400">
                          เป้า {fmtNum(r.target)} {r.item.unit ?? ""} · {DIRECTION_LABEL[r.item.direction]} · น้ำหนัก {fmtNum(r.item.weight)}
                        </p>
                        {r.item.description && <p className="mt-0.5 text-[11px] text-zinc-500">{r.item.description}</p>}
                      </div>
                      <span className="tabular shrink-0 text-[13px] font-semibold">{r.score === null ? "-" : `${r.score}%`}</span>
                    </div>
                    {editable ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-[9rem_1fr]">
                        <input
                          name={`actual_${r.item.id}`}
                          inputMode="decimal"
                          defaultValue={r.actual ?? ""}
                          placeholder={`ผลงาน${r.item.unit ? ` (${r.item.unit})` : ""}`}
                          aria-label={`ผลงาน ${r.item.name}`}
                          className={`${inputClass} tabular h-8 text-[13px]`}
                        />
                        <input
                          name={`note_${r.item.id}`}
                          defaultValue={r.note ?? ""}
                          maxLength={300}
                          placeholder="หมายเหตุ (ถ้ามี)"
                          aria-label={`หมายเหตุ ${r.item.name}`}
                          className={`${inputClass} h-8 text-[13px]`}
                        />
                      </div>
                    ) : (
                      <p className="tabular mt-1 text-[13px] text-zinc-700">
                        ผลงาน: {r.actual === null ? "ยังไม่ประเมิน" : `${fmtNum(r.actual)} ${r.item.unit ?? ""}`}
                        {r.note && <span className="text-zinc-400"> · {r.note}</span>}
                      </p>
                    )}
                    <div className="mt-2">
                      <ScoreBar score={r.score} />
                    </div>
                  </li>
                ))}
              </ul>
              {editable && (
                <div className="border-t border-zinc-100 px-4 py-3 text-right">
                  <SubmitButton size="sm">บันทึกผล KPI</SubmitButton>
                </div>
              )}
            </form>
          )}
        </Card>

        <Card className="rise p-4">
          <h2 className="font-semibold">การมาทำงาน</h2>
          <p className="text-[13px] text-zinc-400">ดึงจากเวลาเข้าออก ใบลา และ OT อัตโนมัติ</p>
          <dl className="mt-3 divide-y divide-zinc-100">
            {attendance.map((a) => (
              <div key={a.label} className="flex items-center justify-between py-2 text-[13px]">
                <dt className="text-zinc-500">{a.label}</dt>
                <dd className={`tabular font-medium ${a.warn ? "text-rose-600" : "text-zinc-900"}`}>{a.value}</dd>
              </div>
            ))}
          </dl>
          {!att.hasAnyData && <p className="mt-2 text-[11px] text-zinc-400">ยังไม่มีเวลาสแกนเข้าออกในเดือนนี้ ตัวเลขมาสาย/ขาดงานจะขึ้นหลังนำเข้าไฟล์เครื่องสแกน</p>}
          <Link href={`/attendance?view=month&date=${from}&emp=${id}`} className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
            ดูรายวัน ›
          </Link>
        </Card>
      </div>
    </div>
  );
}

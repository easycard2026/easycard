import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROBATION_LABEL } from "@/lib/roles";
import { serviceLength, todayBangkok } from "@/lib/format";

// ส่งออกรายชื่อพนักงานเป็น CSV (เปิดใน Excel ได้ ภาษาไทยไม่เพี้ยน)
// เห็นแค่คนที่ตัวเองมีสิทธิ์เห็น (RLS) ข้อมูลส่วนตัว (เลขบัตร บัญชี เงินเดือน) เฉพาะ CEO/บัญชี
const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
// ให้ Excel เก็บตัวเลขยาว ๆ เป็นข้อความ (ไม่กลายเป็น 1.23E+12 หรือเลข 0 นำหน้าหาย)
const asText = (v: string | null | undefined) => (v ? `="${v}"` : "");

function months(startIso: string, today: string) {
  if (startIso > today) return 0;
  const [sy, sm, sd] = startIso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return (ty - sy) * 12 + (tm - sm) - (td < sd ? 1 : 0);
}

type Name = { first_name: string; last_name: string } | null;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role === "employee") return new NextResponse("Forbidden", { status: 403 });

  const isAdmin = profile.role === "ceo" || profile.role === "accounting";
  const sp = req.nextUrl.searchParams;
  const includeInactive = sp.has("inactive");
  const includePrivate = isAdmin && sp.has("private");
  const today = todayBangkok();

  let q = supabase
    .from("employees")
    .select(
      "id, code, device_code, first_name, last_name, national_id, start_date, probation_end_date, probation_status, bank_name, bank_account, active, departments(name), positions(name), manager:manager_id(first_name, last_name)",
    )
    .order("code");
  if (!includeInactive) q = q.eq("active", true);
  const [{ data: emps, error }, { data: docs }, { data: salaries }] = await Promise.all([
    q,
    supabase.from("employee_documents").select("employee_id"),
    includePrivate
      ? supabase.from("salary_history").select("employee_id, monthly_salary, effective_date").lte("effective_date", today).order("effective_date", { ascending: false })
      : Promise.resolve({ data: [] as { employee_id: string; monthly_salary: number; effective_date: string }[] }),
  ]);
  if (error) return new NextResponse("โหลดข้อมูลไม่สำเร็จ", { status: 500 });

  const docCount = new Map<string, number>();
  for (const d of docs ?? []) docCount.set(d.employee_id, (docCount.get(d.employee_id) ?? 0) + 1);
  const salary = new Map<string, number>();
  for (const s of salaries ?? []) if (!salary.has(s.employee_id)) salary.set(s.employee_id, Number(s.monthly_salary));

  const header = [
    "รหัสพนักงาน", "รหัสเครื่องสแกน", "ชื่อ", "นามสกุล", "ตำแหน่ง", "แผนก", "หัวหน้า",
    "วันเริ่มงาน", "อายุงาน", "อายุงาน (เดือน)", "สถานะทดลองงาน", "วันครบทดลองงาน", "สถานะการจ้าง", "จำนวนเอกสาร",
  ];
  if (includePrivate) header.push("เลขบัตรประชาชน", "ธนาคาร", "เลขบัญชี", "เงินเดือนปัจจุบัน");

  const rows: unknown[][] = [header];
  for (const e of emps ?? []) {
    const mgr = e.manager as unknown as Name;
    const onProbation = e.probation_status === "on_probation" || e.probation_status === "extended";
    const row: unknown[] = [
      e.code,
      e.device_code ?? "",
      e.first_name,
      e.last_name,
      (e.positions as unknown as { name: string } | null)?.name ?? "",
      (e.departments as unknown as { name: string } | null)?.name ?? "",
      mgr ? `${mgr.first_name} ${mgr.last_name}` : "",
      e.start_date,
      serviceLength(e.start_date, today),
      months(e.start_date, today),
      PROBATION_LABEL[e.probation_status] ?? e.probation_status,
      onProbation ? e.probation_end_date : "",
      e.active ? "ทำงานอยู่" : "พ้นสภาพ",
      docCount.get(e.id) ?? 0,
    ];
    if (includePrivate) {
      row.push(asText(e.national_id), e.bank_name ?? "", asText(e.bank_account), salary.has(e.id) ? salary.get(e.id)!.toFixed(2) : "");
    }
    rows.push(row);
  }

  const file = `employees-${today}.csv`;
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(`รายชื่อพนักงาน-${today}.csv`)}`,
      "Cache-Control": "no-store",
    },
  });
}

import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { PROBATION_LABEL, PROBATION_TONE } from "@/lib/roles";
import { DOC_LABEL, fileSize } from "@/lib/documents";
import { serviceLength, thaiDate } from "@/lib/format";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { BANKS, accountProblem, bankLabel } from "@/lib/payroll/bank";
import { deleteDocument, updateBank, updatePosition, updateStartDate } from "./actions";
import { UploadForm } from "./upload-form";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
      <dt className="text-zinc-400">{label}</dt>
      <dd className="text-right text-zinc-800">{children}</dd>
    </div>
  );
}

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role, user, employeeId: me } = await getSession();

  const [{ data: e }, { data: docs }, { data: positions }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, code, first_name, last_name, start_date, probation_end_date, probation_status, active, position_id, bank_code, bank_account, bank_account_name, departments(name), positions(name)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("employee_documents")
      .select("id, category, title, file_name, size_bytes, uploaded_by, created_at")
      .eq("employee_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("positions").select("id, name").order("name"),
  ]);
  if (!e) notFound();

  const isAdmin = role === "ceo" || role === "accounting";
  const isSelf = id === me;
  const canUpload = isAdmin || isSelf;
  const department = (e.departments as unknown as { name: string } | null)?.name;
  const position = (e.positions as unknown as { name: string } | null)?.name;
  const onProbation = e.probation_status === "on_probation" || e.probation_status === "extended";

  return (
    <div className="space-y-5">
      {role !== "employee" && <BackLink href="/employees">พนักงาน</BackLink>}
      <PageHeader title={`${e.first_name} ${e.last_name}`} description={[e.code, position, department].filter(Boolean).join(" · ")}>
        <Avatar first={e.first_name} last={e.last_name} seed={e.code} />
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      <div className="grid items-start gap-4 lg:grid-cols-[20rem_1fr]">
        <Card className="rise p-4">
          <h2 className="font-semibold">ข้อมูลการทำงาน</h2>
          <dl className="mt-2 divide-y divide-zinc-100">
            <Row label="ตำแหน่ง">{position ?? <span className="text-zinc-300">ไม่ระบุ</span>}</Row>
            <Row label="แผนก">{department ?? <span className="text-zinc-300">ไม่ระบุ</span>}</Row>
            <Row label="วันเริ่มงาน">{thaiDate(e.start_date, "long")}</Row>
            <Row label="อายุงาน">{serviceLength(e.start_date)}</Row>
            <Row label="สถานะ">
              <Badge tone={PROBATION_TONE[e.probation_status]}>{PROBATION_LABEL[e.probation_status]}</Badge>
            </Row>
            {onProbation && <Row label="ครบทดลองงาน">{thaiDate(e.probation_end_date, "long")}</Row>}
            {!e.active && <Row label="การจ้างงาน">พ้นสภาพ</Row>}
          </dl>
          {isAdmin && (
            <form action={updatePosition} className="mt-3 flex items-center gap-2 border-t border-zinc-100 pt-3">
              <input type="hidden" name="employee_id" value={id} />
              <select name="position_id" defaultValue={e.position_id ?? ""} aria-label="ตำแหน่ง" className={`${inputClass} h-8 text-[13px]`}>
                <option value="">ไม่ระบุตำแหน่ง</option>
                {(positions ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <SubmitButton size="sm" variant="secondary">ตั้งตำแหน่ง</SubmitButton>
            </form>
          )}
          {isAdmin && (
            <form action={updateStartDate} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="employee_id" value={id} />
              <input name="start_date" type="date" required defaultValue={e.start_date} aria-label="แก้วันเริ่มงาน" className={`${inputClass} h-8 text-[13px]`} />
              <SubmitButton size="sm" variant="secondary">แก้วันเริ่มงาน</SubmitButton>
            </form>
          )}
        </Card>

        {(isAdmin || isSelf) && (
          <Card className="rise p-4 lg:col-start-1">
            <h2 className="font-semibold">บัญชีรับเงินเดือน</h2>
            {e.bank_code || e.bank_account ? (
              <dl className="mt-2 divide-y divide-zinc-100">
                <Row label="ธนาคาร">{bankLabel(e.bank_code) ?? <span className="text-zinc-300">ไม่ระบุ</span>}</Row>
                <Row label="เลขบัญชี"><span className="tabular">{e.bank_account}</span></Row>
                <Row label="ชื่อบัญชี">{e.bank_account_name || `${e.first_name} ${e.last_name}`}</Row>
              </dl>
            ) : (
              <p className="mt-1 text-[13px] text-zinc-400">ยังไม่มีข้อมูลบัญชี</p>
            )}
            {isAdmin && accountProblem(e.bank_code, e.bank_account) && (
              <p className="mt-2 text-[13px] text-amber-700">{accountProblem(e.bank_code, e.bank_account)} จึงยังไม่อยู่ในไฟล์โอนเงินเดือน</p>
            )}
            {isAdmin && (
              <form action={updateBank} className="mt-3 grid gap-2 border-t border-zinc-100 pt-3">
                <input type="hidden" name="employee_id" value={id} />
                <select name="bank_code" defaultValue={e.bank_code ?? ""} aria-label="ธนาคาร" className={`${inputClass} h-9 text-[13px]`}>
                  <option value="">เลือกธนาคาร</option>
                  {BANKS.map((b) => (
                    <option key={b.code} value={b.code}>{b.short} {b.name}</option>
                  ))}
                </select>
                <input name="bank_account" inputMode="numeric" defaultValue={e.bank_account ?? ""} placeholder="เลขบัญชี" aria-label="เลขบัญชี" className={`${inputClass} h-9 text-[13px]`} />
                <input name="bank_account_name" defaultValue={e.bank_account_name ?? ""} placeholder={`ชื่อบัญชี (ว่างไว้ = ${e.first_name} ${e.last_name})`} aria-label="ชื่อบัญชี" className={`${inputClass} h-9 text-[13px]`} />
                <div className="flex justify-end">
                  <SubmitButton size="sm" variant="secondary">บันทึกบัญชี</SubmitButton>
                </div>
              </form>
            )}
          </Card>
        )}

        <Card className="rise p-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">เอกสาร</h2>
            <span className="tabular text-xs text-zinc-400">{docs?.length ?? 0} ไฟล์</span>
          </div>
          <p className="text-[13px] text-zinc-400">เก็บแบบส่วนตัว เห็นเฉพาะเจ้าตัว หัวหน้าทีม CEO และฝ่ายบัญชี</p>

          {canUpload && (
            <div className="mt-3 rounded-lg bg-zinc-50/70 p-3 ring-1 ring-inset ring-zinc-100">
              <UploadForm employeeId={id} />
            </div>
          )}

          <ul className="mt-2 divide-y divide-zinc-100">
            {(docs ?? []).map((d) => {
              const canDelete = isAdmin || (isSelf && d.uploaded_by === user.id);
              const href = `/employees/${id}/documents/${d.id}`;
              return (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <a href={href} target="_blank" rel="noopener" className="block truncate text-[13px] font-medium text-zinc-900 hover:underline">
                      {d.title}
                    </a>
                    <p className="truncate text-[11px] text-zinc-400">
                      {DOC_LABEL[d.category] ?? d.category} · {fileSize(d.size_bytes)} · {thaiDate(d.created_at)}
                    </p>
                  </div>
                  <a href={`${href}?download`} className="text-xs font-medium text-zinc-500 hover:text-zinc-900">ดาวน์โหลด</a>
                  {canDelete && (
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={d.id} />
                      <input type="hidden" name="employee_id" value={id} />
                      <ConfirmDelete />
                    </form>
                  )}
                </li>
              );
            })}
            {!docs?.length && <li className="py-6 text-center text-[13px] text-zinc-400">ยังไม่มีเอกสาร</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function ConfirmDelete() {
  return (
    <SubmitButton size="sm" variant="danger" confirm="ลบเอกสารนี้? ลบแล้วกู้คืนไม่ได้" className="!h-7 !px-2">
      ลบ
    </SubmitButton>
  );
}

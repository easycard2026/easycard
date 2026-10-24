import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import type { LeaveType } from "@/lib/leave";
import { Card, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { addLeaveType, saveLeaveType } from "../actions";

export default async function LeaveSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/leave");
  const { data } = await supabase.from("leave_types").select("*").order("sort");
  const types = (data ?? []) as LeaveType[];

  return (
    <div className="space-y-5">
      <BackLink href="/leave">การลา</BackLink>
      <PageHeader title="ตั้งค่าการลา" description="สิทธิ์การลาของทุกคนต่อปี แก้สิทธิ์เฉพาะคนได้ที่หน้าสรุป → เลือกพนักงาน" />
      <Notice ok={sp.ok} error={sp.error} />
      <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] text-amber-800 ring-1 ring-inset ring-amber-200">
        ค่าตั้งต้นเขียนตาม พ.ร.บ.คุ้มครองแรงงาน (รวมลาคลอด 120 วัน และลาช่วยภริยาคลอด 15 วัน ตามฉบับแก้ไขล่าสุด) ฝ่ายบัญชีควรตรวจก่อนใช้จริง
        ช่อง &quot;ลาได้สูงสุด&quot; เว้นว่าง = ไม่จำกัด ส่วนที่ลาเกิน &quot;ได้ค่าจ้าง&quot; จะถูกหักเงินเดือน (เงินเดือน ÷ 30 × วัน)
      </p>

      <div className="space-y-3">
        {types.map((t) => (
          <Card key={t.code} className="rise p-4">
            <form action={saveLeaveType} className="grid gap-3 sm:grid-cols-6 sm:items-end">
              <input type="hidden" name="code" value={t.code} />
              <Field label="ชื่อ" className="sm:col-span-2">
                <input name="name" required defaultValue={t.name} className={inputClass} />
              </Field>
              <Field label="ลาได้สูงสุด (วัน/ปี)">
                <input name="max_days" type="number" min="0" step="0.5" defaultValue={t.max_days ?? ""} placeholder="ไม่จำกัด" className={inputClass} />
              </Field>
              <Field label="ได้ค่าจ้าง (วัน/ปี)">
                <input name="paid_days" type="number" min="0" step="0.5" required defaultValue={t.paid_days} className={inputClass} />
              </Field>
              <Field label="ต้องทำงานครบ (วัน)">
                <input name="min_service_days" type="number" min="0" step="1" defaultValue={t.min_service_days} className={inputClass} />
              </Field>
              <Field label="ขอเอกสารเมื่อลาเกิน (วัน)">
                <input name="doc_after_days" type="number" min="0" step="0.5" defaultValue={t.doc_after_days ?? ""} placeholder="-" className={inputClass} />
              </Field>
              <Field label="หมายเหตุ" className="sm:col-span-4">
                <input name="note" defaultValue={t.note ?? ""} className={inputClass} />
              </Field>
              <label className="flex h-10 items-center gap-2 text-[13px] text-zinc-700">
                <input type="checkbox" name="active" defaultChecked={t.active} className="size-4 accent-zinc-900" /> เปิดใช้
              </label>
              <SubmitButton variant="secondary">บันทึก</SubmitButton>
            </form>
          </Card>
        ))}
      </div>

      <Card className="rise p-4">
        <h2 className="font-semibold">เพิ่มประเภทการลา</h2>
        <p className="text-[13px] text-zinc-400">เช่น ลาบวช ลาทำหมัน ลาฝึกอบรม ตามระเบียบบริษัท</p>
        <form action={addLeaveType} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="ชื่อ" className="sm:col-span-2">
            <input name="name" required className={inputClass} placeholder="เช่น ลาบวช" />
          </Field>
          <Field label="ลาได้สูงสุด (วัน/ปี)">
            <input name="max_days" type="number" min="0" step="0.5" placeholder="ไม่จำกัด" className={inputClass} />
          </Field>
          <Field label="ได้ค่าจ้าง (วัน/ปี)">
            <input name="paid_days" type="number" min="0" step="0.5" defaultValue="0" className={inputClass} />
          </Field>
          <SubmitButton className="sm:col-start-4">เพิ่ม</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

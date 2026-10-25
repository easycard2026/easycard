import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { todayBangkok } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { Field, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { createEmployee } from "./actions";

export default async function NewEmployeePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/employees");

  const [{ data: departments }, { data: positions }, { data: emps }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("positions").select("id, name").order("name"),
    supabase.from("employees").select("id, code, first_name, last_name").eq("active", true).order("code"),
  ]);

  return (
    <div className="space-y-5">
      <BackLink href="/employees">พนักงาน</BackLink>
      <PageHeader title="เพิ่มพนักงาน" description="กรอกข้อมูลหลัก ข้อมูลอื่น (บัญชีธนาคาร เงินเดือน เอกสาร) เพิ่มทีหลังในหน้าพนักงาน" />
      <Notice ok={sp.ok} error={sp.error} />

      <Card className="rise max-w-lg p-4">
        <form action={createEmployee} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <Field label="รหัสพนักงาน">
              <input name="code" required maxLength={20} placeholder="E005" className={inputClass} />
            </Field>
            <Field label="วันเริ่มงาน">
              <input name="start_date" type="date" required defaultValue={todayBangkok()} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อ">
              <input name="first_name" required maxLength={60} className={inputClass} />
            </Field>
            <Field label="นามสกุล">
              <input name="last_name" required maxLength={60} className={inputClass} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="แผนก">
              <select name="department_id" defaultValue="" className={inputClass}>
                <option value="">ไม่ระบุ</option>
                {(departments ?? []).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </Field>
            <Field label="ตำแหน่ง">
              <select name="position_id" defaultValue="" className={inputClass}>
                <option value="">ไม่ระบุ</option>
                {(positions ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="หัวหน้า" hint="คนที่อนุมัติ OT ลา และจัดกะให้">
            <select name="manager_id" defaultValue="" className={inputClass}>
              <option value="">ไม่มี</option>
              {(emps ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.code} {e.first_name} {e.last_name}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <button name="next" value="account" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800">
              บันทึก แล้วสร้างบัญชีเข้าระบบ
            </button>
            <button name="next" value="done" className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
              บันทึกอย่างเดียว
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

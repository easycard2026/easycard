import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { addPosition, deletePosition, updatePosition } from "./actions";

export default async function PositionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/employees");

  const [{ data: positions }, { data: departments }, { data: emps }] = await Promise.all([
    supabase.from("positions").select("id, name, department_id").order("name"),
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employees").select("position_id").eq("active", true).not("position_id", "is", null),
  ]);
  const count = new Map<string, number>();
  for (const e of emps ?? []) count.set(e.position_id!, (count.get(e.position_id!) ?? 0) + 1);

  const DeptSelect = ({ value }: { value?: string | null }) => (
    <select name="department_id" defaultValue={value ?? ""} aria-label="แผนก" className={`${inputClass} h-8 text-[13px]`}>
      <option value="">ทุกแผนก</option>
      {(departments ?? []).map((d) => (
        <option key={d.id} value={d.id}>{d.name}</option>
      ))}
    </select>
  );

  return (
    <div className="space-y-5">
      <BackLink href="/employees">พนักงาน</BackLink>
      <PageHeader eyebrow="ตั้งค่า" title="ตำแหน่งงาน" description="สร้างตำแหน่ง แล้วไปกำหนดให้พนักงานในหน้าข้อมูลของแต่ละคน" />
      <Notice ok={sp.ok} error={sp.error} />

      <Card className="rise p-4">
        <form action={addPosition} className="grid gap-2.5 sm:grid-cols-[1fr_12rem_auto]">
          <input name="name" required maxLength={100} placeholder="ชื่อตำแหน่ง เช่น พนักงานขาย" className={`${inputClass} h-8 text-[13px]`} />
          <DeptSelect />
          <SubmitButton size="sm">เพิ่มตำแหน่ง</SubmitButton>
        </form>

        <ul className="mt-3 divide-y divide-zinc-100">
          {(positions ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 sm:flex-nowrap">
              <form action={updatePosition} className="grid flex-1 gap-2 sm:grid-cols-[1fr_12rem_auto_auto] sm:items-center">
                <input type="hidden" name="id" value={p.id} />
                <input name="name" required maxLength={100} defaultValue={p.name} aria-label="ชื่อตำแหน่ง" className={`${inputClass} h-8 text-[13px]`} />
                <DeptSelect value={p.department_id} />
                <span className="tabular text-[11px] text-zinc-400 sm:w-14 sm:text-right">{count.get(p.id) ?? 0} คน</span>
                <SubmitButton size="sm" variant="secondary">บันทึก</SubmitButton>
              </form>
              <form action={deletePosition}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton size="sm" variant="danger" confirm={`ลบตำแหน่ง "${p.name}"?`}>ลบ</SubmitButton>
              </form>
            </li>
          ))}
          {!positions?.length && <li className="py-6 text-center text-[13px] text-zinc-400">ยังไม่มีตำแหน่ง</li>}
        </ul>
      </Card>
    </div>
  );
}

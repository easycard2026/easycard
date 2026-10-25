import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { DIRECTION_LABEL, fmtNum, type KpiItem } from "@/lib/kpi";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { addKpiItem, deleteKpiItem, updateKpiItem } from "../actions";
import { EMP_SELECT, canManage, loadItems, type KpiEmp } from "../data";

const small = `${inputClass} h-8 text-[13px]`;

export default async function KpiItemsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  if (role === "employee") redirect("/kpi");
  const isAdmin = role === "ceo" || role === "accounting";

  const [items, { data: posData }, { data: empData }] = await Promise.all([
    loadItems(supabase),
    supabase.from("positions").select("id, name").order("name"),
    supabase.from("employees").select(EMP_SELECT).eq("active", true).order("code"),
  ]);
  const positions = posData ?? [];
  const emps = (empData ?? []) as unknown as KpiEmp[];
  const manageable = emps.filter((e) => canManage(role, employeeId, e));
  const empById = new Map(emps.map((e) => [e.id, e]));

  const focus = sp.employee && empById.has(sp.employee) ? sp.employee : null;
  const backTo = focus ? `/kpi/items?employee=${focus}` : "/kpi/items";
  const defaultScope = focus ? `emp:${focus}` : isAdmin ? "all" : manageable[0] ? `emp:${manageable[0].id}` : "";

  // จัดกลุ่ม: ทุกคน → ตามตำแหน่ง → รายคน
  const groups: { key: string; title: string; hint: string; items: KpiItem[] }[] = [];
  const global = items.filter((i) => !i.position_id && !i.employee_id);
  if (global.length) groups.push({ key: "all", title: "ทุกคน", hint: "ใช้กับพนักงานทุกคน", items: global });
  for (const p of positions) {
    const list = items.filter((i) => i.position_id === p.id);
    if (list.length) groups.push({ key: p.id, title: `ตำแหน่ง ${p.name}`, hint: "ใช้กับทุกคนในตำแหน่งนี้", items: list });
  }
  for (const e of emps) {
    const list = items.filter((i) => i.employee_id === e.id);
    if (list.length) groups.push({ key: e.id, title: `${e.first_name} ${e.last_name}`, hint: "เฉพาะคนนี้", items: list });
  }
  const shown = focus
    ? groups.filter((g) => g.key === "all" || g.key === focus || g.key === empById.get(focus)?.position_id)
    : groups;

  const canEdit = (i: KpiItem) => (i.employee_id ? !!empById.get(i.employee_id) && canManage(role, employeeId, empById.get(i.employee_id)!) : isAdmin);

  return (
    <div className="space-y-5">
      <BackLink href={focus ? `/kpi/${focus}` : "/kpi"}>{focus ? "กลับไปหน้าให้คะแนน" : "KPI พนักงาน"}</BackLink>
      <PageHeader
        eyebrow="ตั้งค่า"
        title="หัวข้อ KPI"
        description={
          isAdmin
            ? "ตั้งหัวข้อพร้อมเป้าหมายรายเดือนและน้ำหนัก ใช้ได้กับทุกคน ตามตำแหน่ง หรือเฉพาะคน"
            : "ผู้จัดการตั้งหัวข้อเฉพาะคนให้ลูกทีมได้ หัวข้อกลางและตามตำแหน่ง CEO/บัญชีเป็นคนตั้ง"
        }
      />
      <Notice ok={sp.ok} error={sp.error} />

      {(isAdmin || manageable.length > 0) && (
        <Card className="rise p-4">
          <h2 className="font-semibold">เพิ่มหัวข้อ</h2>
          <form action={addKpiItem} className="mt-3 grid gap-2.5 sm:grid-cols-6">
            <input type="hidden" name="back" value={backTo} />
            <input name="name" required maxLength={120} placeholder="ชื่อหัวข้อ เช่น ยอดขายต่อเดือน" aria-label="ชื่อหัวข้อ" className={`${small} sm:col-span-3`} />
            <select name="scope" defaultValue={defaultScope} aria-label="ใช้กับ" className={`${small} sm:col-span-3`}>
              {isAdmin && <option value="all">ใช้กับทุกคน</option>}
              {isAdmin && positions.length > 0 && (
                <optgroup label="ตามตำแหน่ง">
                  {positions.map((p) => (
                    <option key={p.id} value={`pos:${p.id}`}>ตำแหน่ง {p.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="เฉพาะคน">
                {manageable.map((e) => (
                  <option key={e.id} value={`emp:${e.id}`}>{e.code} {e.first_name} {e.last_name}</option>
                ))}
              </optgroup>
            </select>
            <input name="target" required inputMode="decimal" placeholder="เป้าหมาย/เดือน" aria-label="เป้าหมาย" className={`${small} tabular`} />
            <input name="unit" maxLength={20} placeholder="หน่วย เช่น บาท" aria-label="หน่วย" className={small} />
            <input name="weight" inputMode="decimal" defaultValue="1" aria-label="น้ำหนัก" title="น้ำหนัก (หัวข้อสำคัญให้ค่ามากกว่า)" className={`${small} tabular`} />
            <select name="direction" defaultValue="higher" aria-label="วิธีคิด" className={small}>
              <option value="higher">{DIRECTION_LABEL.higher}</option>
              <option value="lower">{DIRECTION_LABEL.lower}</option>
            </select>
            <input name="description" maxLength={300} placeholder="คำอธิบาย (ถ้ามี)" aria-label="คำอธิบาย" className={`${small} sm:col-span-1`} />
            <SubmitButton size="sm">เพิ่มหัวข้อ</SubmitButton>
          </form>
          <p className="mt-2 text-[11px] text-zinc-400">
            น้ำหนัก = ความสำคัญของหัวข้อ เช่น ยอดขาย 3 มาตรงเวลา 1 · “ยิ่งน้อยยิ่งดี” ใช้กับเรื่องอย่างของเสียหรือข้อร้องเรียน · คะแนนต่อหัวข้อสูงสุด 120%
          </p>
        </Card>
      )}

      {shown.length === 0 ? (
        <Card className="rise">
          <EmptyState title="ยังไม่มีหัวข้อ KPI" hint="เพิ่มหัวข้อแรกจากฟอร์มด้านบน" />
        </Card>
      ) : (
        shown.map((g) => (
          <Card key={g.key} className="rise overflow-hidden">
            <div className="border-b border-zinc-100 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold">{g.title}</h2>
              <p className="text-[11px] text-zinc-400">{g.hint}</p>
            </div>
            <ul className="divide-y divide-zinc-100">
              {g.items.map((i) =>
                canEdit(i) ? (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 lg:flex-nowrap">
                    <form action={updateKpiItem} className="grid flex-1 gap-2 sm:grid-cols-[1fr_6rem_5rem_4rem_8rem_auto_auto] sm:items-center">
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="back" value={backTo} />
                      <input type="hidden" name="description" value={i.description ?? ""} />
                      <input name="name" required maxLength={120} defaultValue={i.name} aria-label="ชื่อหัวข้อ" className={small} />
                      <input name="target" required inputMode="decimal" defaultValue={i.target} aria-label="เป้าหมาย" title="เป้าหมาย" className={`${small} tabular`} />
                      <input name="unit" maxLength={20} defaultValue={i.unit ?? ""} placeholder="หน่วย" aria-label="หน่วย" className={small} />
                      <input name="weight" inputMode="decimal" defaultValue={i.weight} aria-label="น้ำหนัก" title="น้ำหนัก" className={`${small} tabular`} />
                      <select name="direction" defaultValue={i.direction} aria-label="วิธีคิด" className={small}>
                        <option value="higher">{DIRECTION_LABEL.higher}</option>
                        <option value="lower">{DIRECTION_LABEL.lower}</option>
                      </select>
                      <label className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                        <input type="checkbox" name="active" defaultChecked={i.active} className="size-3.5 accent-zinc-900" />
                        ใช้อยู่
                      </label>
                      <SubmitButton size="sm" variant="secondary">บันทึก</SubmitButton>
                    </form>
                    <form action={deleteKpiItem}>
                      <input type="hidden" name="id" value={i.id} />
                      <input type="hidden" name="back" value={backTo} />
                      <SubmitButton size="sm" variant="danger" confirm={`ลบหัวข้อ "${i.name}"? คะแนนเก่าของหัวข้อนี้จะถูกลบด้วย ถ้าแค่เลิกใช้ให้เอาติ๊ก “ใช้อยู่” ออก`}>
                        ลบ
                      </SubmitButton>
                    </form>
                  </li>
                ) : (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{i.name}</p>
                      <p className="tabular text-[11px] text-zinc-400">
                        เป้า {fmtNum(i.target)} {i.unit ?? ""} · {DIRECTION_LABEL[i.direction]} · น้ำหนัก {fmtNum(i.weight)}
                      </p>
                    </div>
                    {!i.active && <Badge tone="gray">เลิกใช้</Badge>}
                  </li>
                ),
              )}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

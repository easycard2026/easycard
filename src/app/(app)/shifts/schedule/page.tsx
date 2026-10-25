import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Avatar, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { saveSchedule, saveScheduleBulk } from "./actions";

const WD = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  if (role === "employee") redirect("/attendance");

  let q = supabase.from("employees").select("id, code, first_name, last_name, default_shift_id, days_off").eq("active", true).order("code");
  if (role === "manager" && employeeId) q = q.eq("manager_id", employeeId);
  const [{ data: emps }, { data: shifts }, { data: depts }] = await Promise.all([
    q,
    supabase.from("shifts").select("id, name, start_time, end_time").order("start_time"),
    supabase.from("departments").select("id, name").order("name"),
  ]);
  const shiftOptions = (shifts ?? []).map((s) => (
    <option key={s.id} value={s.id}>
      {s.name} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
    </option>
  ));
  const dayPicker = (checked: number[]) => (
    <fieldset className="flex items-center gap-1">
      <legend className="sr-only">วันหยุดประจำสัปดาห์</legend>
      {WD.map((w, i) => (
        <label key={i} className="cursor-pointer">
          <input type="checkbox" name="days_off" value={i} defaultChecked={checked.includes(i)} className="peer sr-only" />
          <span className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-[12px] text-zinc-500 peer-checked:border-zinc-900 peer-checked:bg-zinc-900 peer-checked:text-white">
            {w}
          </span>
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="space-y-5">
      <BackLink href="/shifts">กะการทำงาน</BackLink>
      <PageHeader title="ตั้งกะประจำ" description="กะปกติและวันหยุดประจำสัปดาห์ของแต่ละคน ใช้คิดมาสาย ขาดงาน และวันหยุดในหน้าเวลาเข้าออก" />
      <Notice ok={sp.ok} error={sp.error} />
      {!!emps?.length && (
        <Card className="p-4">
          <form action={saveScheduleBulk} className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <p className="text-[13px] font-medium lg:flex-1">ตั้งพร้อมกันหลายคน</p>
            {role === "manager" ? (
              <span className="text-[13px] text-zinc-500">ทั้งทีม ({emps.length} คน)</span>
            ) : (
              <select name="department_id" defaultValue="" className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] lg:w-44">
                <option value="">ทุกคน ({emps.length} คน)</option>
                {(depts ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    แผนก{d.name}
                  </option>
                ))}
                <option value="none">ไม่มีแผนก</option>
              </select>
            )}
            <select name="shift_id" defaultValue={shifts?.[0]?.id ?? ""} className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] lg:w-56">
              <option value="">ไม่มีกะประจำ</option>
              {shiftOptions}
            </select>
            {dayPicker([0])}
            <SubmitButton size="sm" confirm="ตั้งกะนี้ให้ทุกคนในกลุ่มที่เลือก? (ทับค่าเดิม)">ตั้งทั้งกลุ่ม</SubmitButton>
          </form>
        </Card>
      )}
      <Card className="overflow-hidden">
        {!emps?.length ? (
          <EmptyState title={role === "manager" ? "ยังไม่มีลูกทีม" : "ยังไม่มีพนักงาน"} />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {emps.map((e) => (
              <li key={e.id}>
                <form action={saveSchedule} className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center">
                  <input type="hidden" name="employee_id" value={e.id} />
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{e.first_name} {e.last_name}</p>
                      <p className="text-[11px] text-zinc-400">{e.code}</p>
                    </div>
                  </div>
                  <select name="shift_id" defaultValue={e.default_shift_id ?? ""} className="h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] lg:w-56">
                    <option value="">ไม่มีกะประจำ</option>
                    {shiftOptions}
                  </select>
                  {dayPicker(e.days_off ?? [])}
                  <SubmitButton size="sm" variant="secondary">บันทึก</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-zinc-400">ช่องสีดำ = วันหยุดประจำสัปดาห์ · วันที่จัดกะเฉพาะวันไว้จะใช้กะนั้นแทน · วันหยุดบริษัทตั้งที่ตาราง holidays</p>
    </div>
  );
}

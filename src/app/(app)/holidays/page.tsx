import Link from "next/link";
import { getSession } from "@/lib/session";
import { thaiDate, todayBangkok } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { Notice } from "@/components/notice";
import {
  addHoliday,
  addOverride,
  copyHolidays,
  createCalendar,
  deleteCalendar,
  deleteHoliday,
  deleteOverride,
  renameCalendar,
  setEmployeeCalendar,
  setPositionCalendar,
} from "./actions";

type Cal = { id: string; name: string; is_default: boolean };
const btn = "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-50";
const weekday = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short" });

function HolidayList({ items, remove, back }: { items: { id?: string; holiday_date: string; name: string }[]; remove?: boolean; back?: string }) {
  if (items.length === 0) return <EmptyState title="ยังไม่มีวันหยุดในปีนี้" />;
  const today = todayBangkok();
  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((h) => (
        <li key={`${h.id ?? ""}${h.holiday_date}`} className={`flex items-center gap-3 px-4 py-2 ${h.holiday_date < today ? "opacity-50" : ""}`}>
          <span className="tabular w-10 text-xs text-zinc-400">{weekday(h.holiday_date)}</span>
          <span className="tabular w-28 text-[13px] font-medium">{thaiDate(h.holiday_date)}</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-600">{h.name}</span>
          {remove && h.id && (
            <form action={deleteHoliday}>
              <input type="hidden" name="id" value={h.id} />
              <input type="hidden" name="back" value={back} />
              <button className="text-xs text-zinc-400 hover:text-rose-600">ลบ</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function HolidaysPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, employeeId } = await getSession();
  const isAdmin = role === "ceo" || role === "accounting";
  const thisYear = Number(todayBangkok().slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const { data: mine } = employeeId
    ? await supabase.from("employee_holidays").select("holiday_date, name").eq("employee_id", employeeId).gte("holiday_date", from).lte("holiday_date", to).order("holiday_date")
    : { data: [] };

  const yearNav = (extra = "") => (
    <div className="flex gap-1">
      <Link href={`/holidays?year=${year - 1}${extra}`} className={btn}>‹ {year + 542}</Link>
      <Link href={`/holidays?year=${year + 1}${extra}`} className={btn}>{year + 544} ›</Link>
    </div>
  );

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        <PageHeader title={`วันหยุดประจำปี ${year + 543}`} description="วันหยุดตามตำแหน่งงานของคุณ (ไม่รวมวันหยุดประจำสัปดาห์)">
          {yearNav()}
        </PageHeader>
        <Card className="rise overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold">วันหยุดของฉัน</h2>
            <p className="text-[13px] text-zinc-400">{(mine ?? []).length} วัน</p>
          </div>
          <HolidayList items={mine ?? []} />
        </Card>
      </div>
    );
  }

  const [{ data: calsData }, { data: positions }, { data: emps }, { data: overrides }] = await Promise.all([
    supabase.from("holiday_calendars").select("id, name, is_default").order("is_default", { ascending: false }).order("name"),
    supabase.from("positions").select("id, name, holiday_calendar_id").order("name"),
    supabase.from("employees").select("id, code, first_name, last_name, holiday_calendar_id, position_id, positions(name)").eq("active", true).order("code"),
    supabase
      .from("employee_holiday_overrides")
      .select("id, employee_id, holiday_date, is_holiday, name, employees(code, first_name, last_name)")
      .gte("holiday_date", from)
      .lte("holiday_date", to)
      .order("holiday_date"),
  ]);
  const cals = (calsData ?? []) as Cal[];
  const cal = cals.find((c) => c.id === sp.cal) ?? cals[0];
  const here = `/holidays?year=${year}${cal ? `&cal=${cal.id}` : ""}`;
  const { data: hols } = cal
    ? await supabase.from("holidays").select("id, holiday_date, name").eq("calendar_id", cal.id).gte("holiday_date", from).lte("holiday_date", to).order("holiday_date")
    : { data: [] };
  const calName = (id: string | null) => cals.find((c) => c.id === id)?.name;
  const defaultName = cals.find((c) => c.is_default)?.name ?? "ค่าเริ่มต้น";
  const withOwnCal = (emps ?? []).filter((e) => e.holiday_calendar_id);

  return (
    <div className="space-y-5">
      <PageHeader title={`วันหยุดประจำปี ${year + 543}`} description="สร้างชุดวันหยุด แล้วเลือกให้แต่ละตำแหน่ง ตั้งเฉพาะคนได้ ระบบใช้คิดวันลาและขาดงาน">
        {yearNav(cal ? `&cal=${cal.id}` : "")}
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      {/* ชุดวันหยุด */}
      <div className="flex flex-wrap items-center gap-1.5">
        {cals.map((c) => (
          <Link
            key={c.id}
            href={`/holidays?year=${year}&cal=${c.id}`}
            className={`rounded-full px-3 py-1 text-[13px] ring-1 ring-inset ${c.id === cal?.id ? "bg-zinc-900 text-white ring-zinc-900" : "bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50"}`}
          >
            {c.name}
          </Link>
        ))}
        <form action={createCalendar} className="flex items-center gap-1.5">
          <input name="name" required placeholder="ชื่อชุดใหม่ เช่น ฝ่ายผลิต" className={`${inputClass} h-8 w-44 text-[13px]`} />
          <SubmitButton size="sm" variant="secondary">+ สร้างชุด</SubmitButton>
        </form>
      </div>

      {cal && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <Card className="rise overflow-hidden lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
              <div>
                <h2 className="font-semibold">
                  {cal.name} {cal.is_default && <Badge tone="blue" dot={false}>ใช้กับทุกคนที่ไม่ได้ตั้งชุด</Badge>}
                </h2>
                <p className="text-[13px] text-zinc-400">{(hols ?? []).length} วัน ในปี {year + 543}</p>
              </div>
              <div className="flex items-center gap-2">
                <form action={renameCalendar} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={cal.id} />
                  <input type="hidden" name="back" value={here} />
                  <input name="name" defaultValue={cal.name} className={`${inputClass} h-8 w-40 text-[13px]`} />
                  <SubmitButton size="sm" variant="secondary">เปลี่ยนชื่อ</SubmitButton>
                </form>
                {!cal.is_default && (
                  <form action={deleteCalendar}>
                    <input type="hidden" name="id" value={cal.id} />
                    <input type="hidden" name="back" value={here} />
                    <SubmitButton size="sm" variant="danger" confirm={`ลบชุด "${cal.name}" และวันหยุดทั้งหมดในชุดนี้?`}>ลบชุด</SubmitButton>
                  </form>
                )}
              </div>
            </div>
            <HolidayList items={hols ?? []} remove back={here} />
          </Card>

          <div className="space-y-4">
            <Card className="rise p-4">
              <h2 className="font-semibold">เพิ่มวันหยุด</h2>
              <form action={addHoliday} className="mt-3 space-y-3">
                <input type="hidden" name="calendar_id" value={cal.id} />
                <input type="hidden" name="back" value={here} />
                <Field label="วันที่">
                  <input type="date" name="holiday_date" required defaultValue={`${year}-01-01`} className={inputClass} />
                </Field>
                <Field label="ชื่อวันหยุด">
                  <input name="name" required placeholder="เช่น วันสงกรานต์" className={inputClass} />
                </Field>
                <SubmitButton className="w-full">เพิ่ม</SubmitButton>
              </form>
            </Card>
            {cals.length > 1 && (
              <Card className="rise p-4">
                <h2 className="font-semibold">คัดลอกจากชุดอื่น</h2>
                <p className="text-[13px] text-zinc-400">ทุกวันในปี {year + 543} (ข้ามวันที่มีแล้ว)</p>
                <form action={copyHolidays} className="mt-3 flex gap-2">
                  <input type="hidden" name="calendar_id" value={cal.id} />
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="back" value={here} />
                  <select name="source_id" className={inputClass}>
                    {cals.filter((c) => c.id !== cal.id).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <SubmitButton variant="secondary">คัดลอก</SubmitButton>
                </form>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ตำแหน่ง */}
      <Card className="rise overflow-hidden">
        <div className="border-b border-zinc-100 px-4 py-3">
          <h2 className="font-semibold">ชุดวันหยุดของแต่ละตำแหน่ง</h2>
          <p className="text-[13px] text-zinc-400">ไม่ได้เลือก = ใช้ &quot;{defaultName}&quot; · เพิ่มตำแหน่งได้ที่เมนูพนักงาน</p>
        </div>
        {(positions ?? []).length === 0 ? (
          <EmptyState title="ยังไม่มีตำแหน่ง" hint="สร้างตำแหน่งที่เมนูพนักงานก่อน" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {(positions ?? []).map((p) => (
              <li key={p.id} className="px-4 py-2">
                <form action={setPositionCalendar} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="position_id" value={p.id} />
                  <input type="hidden" name="back" value={here} />
                  <span className="min-w-32 flex-1 text-[13px] font-medium">{p.name}</span>
                  <select name="calendar_id" defaultValue={p.holiday_calendar_id ?? ""} className={`${inputClass} h-8 w-52 text-[13px]`}>
                    <option value="">{defaultName} (ค่าเริ่มต้น)</option>
                    {cals.filter((c) => !c.is_default).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <SubmitButton size="sm" variant="secondary">บันทึก</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* รายคน */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="rise overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold">ชุดวันหยุดเฉพาะคน</h2>
            <p className="text-[13px] text-zinc-400">ใช้แทนชุดของตำแหน่ง</p>
          </div>
          <form action={setEmployeeCalendar} className="flex flex-wrap gap-2 border-b border-zinc-100 px-4 py-3">
            <input type="hidden" name="back" value={here} />
            <select name="employee_id" required className={`${inputClass} h-9 min-w-0 flex-1 text-[13px]`}>
              {(emps ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.code} {e.first_name} {e.last_name}</option>
              ))}
            </select>
            <select name="calendar_id" className={`${inputClass} h-9 w-44 text-[13px]`}>
              <option value="">ตามตำแหน่ง</option>
              {cals.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <SubmitButton size="sm">บันทึก</SubmitButton>
          </form>
          {withOwnCal.length === 0 ? (
            <EmptyState title="ทุกคนใช้ชุดตามตำแหน่ง" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {withOwnCal.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{e.first_name} {e.last_name}</span>
                    <span className="ml-1.5 text-zinc-400">{(e.positions as unknown as { name: string } | null)?.name ?? ""}</span>
                  </span>
                  <Badge tone="blue" dot={false}>{calName(e.holiday_calendar_id)}</Badge>
                  <form action={setEmployeeCalendar}>
                    <input type="hidden" name="employee_id" value={e.id} />
                    <input type="hidden" name="calendar_id" value="" />
                    <input type="hidden" name="back" value={here} />
                    <button className="text-xs text-zinc-400 hover:text-rose-600">ยกเลิก</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rise overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold">วันหยุดรายคน (รายวัน)</h2>
            <p className="text-[13px] text-zinc-400">หยุดเพิ่มเฉพาะคน หรือให้มาทำงานในวันหยุด</p>
          </div>
          <form action={addOverride} className="grid gap-2 border-b border-zinc-100 px-4 py-3 sm:grid-cols-2">
            <input type="hidden" name="back" value={here} />
            <select name="employee_id" required className={`${inputClass} h-9 text-[13px] sm:col-span-2`}>
              {(emps ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.code} {e.first_name} {e.last_name}</option>
              ))}
            </select>
            <input type="date" name="holiday_date" required defaultValue={todayBangkok()} className={`${inputClass} h-9 text-[13px]`} />
            <select name="kind" className={`${inputClass} h-9 text-[13px]`}>
              <option value="off">หยุดเพิ่ม</option>
              <option value="work">มาทำงาน (ไม่หยุด)</option>
            </select>
            <input name="name" placeholder="หมายเหตุ เช่น หยุดชดเชย" className={`${inputClass} h-9 text-[13px]`} />
            <SubmitButton size="sm">เพิ่ม</SubmitButton>
          </form>
          {(overrides ?? []).length === 0 ? (
            <EmptyState title="ยังไม่มีวันหยุดรายคนในปีนี้" />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {(overrides ?? []).map((o) => {
                const e = o.employees as unknown as { first_name: string; last_name: string } | null;
                return (
                  <li key={o.id} className="flex items-center gap-2 px-4 py-2 text-[13px]">
                    <span className="tabular w-24 font-medium">{thaiDate(o.holiday_date)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {e?.first_name} {e?.last_name}
                      {o.name && <span className="ml-1.5 text-zinc-400">{o.name}</span>}
                    </span>
                    <Badge tone={o.is_holiday ? "green" : "amber"}>{o.is_holiday ? "หยุด" : "มาทำงาน"}</Badge>
                    <form action={deleteOverride}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="back" value={here} />
                      <button className="text-xs text-zinc-400 hover:text-rose-600">ลบ</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {employeeId && (
        <Card className="rise overflow-hidden">
          <div className="border-b border-zinc-100 px-4 py-3">
            <h2 className="font-semibold">วันหยุดของฉัน</h2>
            <p className="text-[13px] text-zinc-400">{(mine ?? []).length} วัน</p>
          </div>
          <HolidayList items={mine ?? []} />
        </Card>
      )}
    </div>
  );
}

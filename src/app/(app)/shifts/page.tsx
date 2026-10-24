import Link from "next/link";
import { getSession } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { IconCoffee, IconMoon, IconSun } from "@/components/icons";

function minutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function duration(start: string, end: string, breakMin: number) {
  let d = minutes(end) - minutes(start);
  if (d <= 0) d += 24 * 60;
  const work = d - breakMin;
  const h = Math.floor(work / 60);
  const m = work % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
}

// แถบเวลา 24 ชั่วโมง แสดงช่วงที่กะนี้ทำงาน
function Timeline({ start, end }: { start: string; end: string }) {
  const s = (minutes(start) / 1440) * 100;
  const e = (minutes(end) / 1440) * 100;
  const parts = e > s ? [[s, e - s]] : [[s, 100 - s], [0, e]];
  return (
    <div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-100">
        {parts.map(([left, width], i) => (
          <span key={i} className="absolute inset-y-0 rounded-full bg-zinc-900" style={{ left: `${left}%`, width: `${width}%` }} />
        ))}
      </div>
      <div className="tabular mt-1 flex justify-between text-[9px] text-zinc-400">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </div>
  );
}

export default async function ShiftsPage() {
  const { supabase, role, employeeId } = await getSession();
  const [{ data: shifts }, { data: open }] = await Promise.all([
    supabase.from("shifts").select("id, name, start_time, end_time, break_minutes, crosses_midnight").order("start_time"),
    supabase.from("shift_swaps").select("status, requester_id, target_id, manager_at, accounting_at").in("status", ["pending_peer", "pending_approval"]),
  ]);
  // คำขอแลกกะที่รอฉันอยู่: เพื่อนขอแลกกับฉัน หรือรออนุมัติ (สำหรับหัวหน้า/บัญชี/CEO)
  const waiting = (open ?? []).filter((r) =>
    r.status === "pending_peer"
      ? r.target_id === employeeId
      : r.requester_id !== employeeId &&
        r.target_id !== employeeId &&
        ((role === "accounting" && !r.accounting_at) ||
          (role === "manager" && !r.manager_at) ||
          (role === "ceo" && (!r.manager_at || !r.accounting_at))),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="ตารางเวลา" title="กะการทำงาน" description={`${shifts?.length ?? 0} กะที่ใช้ในบริษัท`}>
        <Link href="/shifts/swaps" className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg bg-zinc-900 px-3 text-[13px] font-medium text-white hover:bg-zinc-800 sm:self-auto">
          ⇄ แลกกะ{waiting ? <span className="rounded-full bg-white/20 px-1.5 text-[11px]">{waiting}</span> : null}
        </Link>
      </PageHeader>

      {!shifts || shifts.length === 0 ? (
        <Card>
          <EmptyState title="ยังไม่มีกะการทำงาน" hint="CEO หรือฝ่ายบัญชีเพิ่มกะได้" />
        </Card>
      ) : (
        <div className="rise grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" style={{ animationDelay: "60ms" }}>
          {shifts.map((s) => {
            const night = s.crosses_midnight || minutes(s.start_time) >= 18 * 60;
            return (
              <Card key={s.id} className="flex flex-col gap-3.5 p-4 transition-all hover:border-zinc-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`grid size-8 place-items-center rounded-lg ${
                        night ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                      }`}
                    >
                      {night ? <IconMoon className="size-4" /> : <IconSun className="size-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="text-[11px] text-zinc-400">ทำงาน {duration(s.start_time, s.end_time, s.break_minutes)}</p>
                    </div>
                  </div>
                  {s.crosses_midnight && <Badge tone="blue">ข้ามเที่ยงคืน</Badge>}
                </div>

                <p className="tabular text-xl font-semibold leading-none tracking-tight">
                  {s.start_time.slice(0, 5)}
                  <span className="mx-2 font-light text-zinc-300">–</span>
                  {s.end_time.slice(0, 5)}
                </p>

                <Timeline start={s.start_time} end={s.end_time} />

                <p className="flex items-center gap-1.5 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                  <IconCoffee className="size-3.5 text-zinc-400" /> พักระหว่างกะ {s.break_minutes} นาที
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { getSession } from "@/lib/session";
import { MENU, PROBATION_LABEL, PROBATION_TONE, ROLE_LABEL } from "@/lib/roles";
import { daysUntil, thaiDate, todayBangkok } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { IconArrowRight, IconBadge, IconClock, IconTimer, IconUsers } from "@/components/icons";

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Bangkok" }));
  if (h < 12) return "อรุณสวัสดิ์";
  if (h < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

function Stat({ label, value, unit, icon, href }: { label: string; value: number; unit: string; icon: React.ReactNode; href?: string }) {
  const body = (
    <Card className={`h-full p-4 transition-all ${href ? "hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium leading-snug text-zinc-500">{label}</p>
        <span className="hidden size-7 shrink-0 place-items-center rounded-md bg-zinc-50 sm:grid text-zinc-400 ring-1 ring-zinc-200/70">{icon}</span>
      </div>
      <p className="tabular mt-2 text-2xl font-semibold leading-none tracking-tight text-zinc-900">
        {value}
        <span className="ml-1 text-xs font-normal text-zinc-400">{unit}</span>
      </p>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function ProbationProgress({ start, end }: { start: string; end: string }) {
  const total = Math.max(1, daysUntil(end) - daysUntil(start));
  const left = Math.max(0, daysUntil(end));
  const pct = Math.min(100, Math.round(((total - left) / total) * 100));
  return (
    <div className="border-t border-zinc-100 pt-4 sm:col-span-2">
      <div className="flex items-baseline justify-between text-[13px]">
        <p className="font-medium">ระยะทดลองงาน</p>
        <p className="text-zinc-500">
          {left > 0 ? `เหลืออีก ${left} วัน` : "ครบกำหนดแล้ว"} · ครบ {thaiDate(end)}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-zinc-900" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DueLabel({ date }: { date: string }) {
  const d = daysUntil(date);
  if (d < 0) return <Badge tone="red">เลยกำหนด {-d} วัน</Badge>;
  if (d === 0) return <Badge tone="red">ครบวันนี้</Badge>;
  if (d <= 7) return <Badge tone="amber">อีก {d} วัน</Badge>;
  return <Badge tone="gray">อีก {d} วัน</Badge>;
}

function Upcoming({ items }: { items: typeof MENU }) {
  return (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">กำลังจะมาเร็วๆ นี้</h2>
              <p className="text-xs text-zinc-400">ฟีเจอร์ที่กำลังพัฒนาต่อ</p>
              <ul className="mt-3 space-y-1">
                {items.map((m) => (
                  <li key={m.href} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-[13px] text-zinc-600">
                    {m.label}
                    <span className="text-[10px] text-zinc-400">เร็วๆ นี้</span>
                  </li>
                ))}
              </ul>
            </Card>
  );
}

export default async function Dashboard() {
  const { supabase, role, name } = await getSession();
  const today = todayBangkok();
  const soon = new Date(Date.parse(`${today}T00:00:00Z`) + 15 * 864e5).toISOString().slice(0, 10);

  // RLS กรองให้แล้ว: แต่ละ Role นับได้เฉพาะคนที่ตัวเองมีสิทธิ์เห็น
  const [{ count: employeeCount }, { count: probationCount }, { count: shiftCount }, { data: dueProbation }] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("active", true),
    supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("active", true)
      .in("probation_status", ["on_probation", "extended"]),
    supabase.from("shifts").select("id", { count: "exact", head: true }),
    supabase
      .from("employees")
      .select("id, code, first_name, last_name, probation_end_date, probation_status, departments(name)")
      .eq("active", true)
      .in("probation_status", ["on_probation", "extended"])
      .lte("probation_end_date", soon)
      .order("probation_end_date"),
  ]);

  const scope = role === "manager" ? "พนักงานในทีม" : "พนักงานทั้งหมด";
  const upcoming = MENU.filter((m) => m.soon && m.roles.includes(role));
  const firstName = name.split(" ")[0];

  // พนักงานทั่วไป: แสดงข้อมูลของตัวเอง
  let me: {
    code: string;
    first_name: string;
    last_name: string;
    start_date: string;
    probation_end_date: string;
    probation_status: string;
    departments: unknown;
  } | null = null;
  if (role === "employee") {
    const { data } = await supabase
      .from("employees")
      .select("code, first_name, last_name, start_date, probation_end_date, probation_status, departments(name)")
      .limit(1)
      .maybeSingle();
    me = data;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={new Date().toLocaleDateString("th-TH", { dateStyle: "full", timeZone: "Asia/Bangkok" })}
        title={`${greeting()}, ${firstName}`}
        description={`คุณเข้าใช้งานในฐานะ${ROLE_LABEL[role]}`}
      />

      {role === "employee" ? (
        <Card className="rise overflow-hidden">
          {me ? (
            <div className="grid gap-4 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
              <div className="flex items-center gap-4">
                <span>
                  <Avatar first={me.first_name} last={me.last_name} seed={me.code} />
                </span>
                <div className="sm:hidden">
                  <p className="font-semibold">{me.first_name} {me.last_name}</p>
                  <p className="text-sm text-zinc-500">{me.code}</p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-4">
                <div className="hidden sm:block">
                  <dt className="text-zinc-400">ชื่อ</dt>
                  <dd className="mt-1 font-medium">{me.first_name} {me.last_name}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">แผนก</dt>
                  <dd className="mt-1 font-medium">{(me.departments as { name: string } | null)?.name ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">วันเริ่มงาน</dt>
                  <dd className="mt-1 font-medium">{thaiDate(me.start_date)}</dd>
                </div>
                <div>
                  <dt className="text-zinc-400">สถานะ</dt>
                  <dd className="mt-1">
                    <Badge tone={PROBATION_TONE[me.probation_status]}>{PROBATION_LABEL[me.probation_status]}</Badge>
                  </dd>
                </div>
              </dl>
              {(me.probation_status === "on_probation" || me.probation_status === "extended") && (
                <ProbationProgress start={me.start_date} end={me.probation_end_date} />
              )}
            </div>
          ) : (
            <EmptyState title="ยังไม่ได้ผูกบัญชีกับข้อมูลพนักงาน" hint="ติดต่อฝ่ายบุคคลเพื่อเชื่อมบัญชีของคุณ" />
          )}
        </Card>
      ) : null}
      {role === "employee" && upcoming.length > 0 && (
        <div className="rise grid gap-4 lg:grid-cols-3" style={{ animationDelay: "60ms" }}>
          <Upcoming items={upcoming} />
        </div>
      )}
      {role !== "employee" && (
        <>
          <section className="rise grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: "60ms" }}>
            <Stat label={scope} value={employeeCount ?? 0} unit="คน" icon={<IconUsers className="size-4" />} href="/employees" />
            <Stat label="อยู่ระหว่างทดลองงาน" value={probationCount ?? 0} unit="คน" icon={<IconBadge className="size-4" />} href="/employees" />
            <Stat label="ครบกำหนดใน 15 วัน" value={dueProbation?.length ?? 0} unit="คน" icon={<IconTimer className="size-4" />} />
            <Stat label="กะการทำงาน" value={shiftCount ?? 0} unit="กะ" icon={<IconClock className="size-4" />} href="/shifts" />
          </section>

          <div className="rise grid items-start gap-3 lg:grid-cols-3" style={{ animationDelay: "120ms" }}>
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">ใกล้ครบกำหนดทดลองงาน</h2>
                  <p className="text-xs text-zinc-400">ภายใน 15 วันข้างหน้า ควรประเมินก่อนครบกำหนด</p>
                </div>
                <Link href="/employees" className="hidden items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900 sm:flex">
                  ดูทั้งหมด <IconArrowRight className="size-3.5" />
                </Link>
              </div>
              {dueProbation && dueProbation.length > 0 ? (
                <ul className="divide-y divide-zinc-100">
                  {dueProbation.map((e) => (
                    <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                      <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{e.first_name} {e.last_name}</p>
                        <p className="truncate text-xs text-zinc-400">
                          {e.code} · {(e.departments as unknown as { name: string } | null)?.name ?? "ไม่ระบุแผนก"} · ครบ {thaiDate(e.probation_end_date)}
                        </p>
                      </div>
                      <DueLabel date={e.probation_end_date} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="ไม่มีใครใกล้ครบกำหนด" hint="ช่วง 15 วันนี้ยังไม่ต้องประเมินทดลองงาน" />
              )}
            </Card>

            <Upcoming items={upcoming} />
          </div>
        </>
      )}
    </div>
  );
}

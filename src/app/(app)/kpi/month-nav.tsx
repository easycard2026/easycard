import Link from "next/link";
import { monthRange, shiftMonth } from "@/lib/kpi";

export function monthLabel(ym: string) {
  return new Date(`${monthRange(ym).from}T00:00:00`).toLocaleDateString("th-TH", { month: "long", year: "numeric" });
}

const btn = "grid h-8 min-w-8 place-items-center rounded-lg border border-zinc-200 bg-white px-2 text-[13px] text-zinc-600 hover:bg-zinc-50";

export function MonthNav({ base, ym }: { base: string; ym: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center gap-1">
      <Link href={`${base}${sep}month=${shiftMonth(ym, -1)}`} className={btn} aria-label="เดือนก่อน">‹</Link>
      <span className="min-w-28 text-center text-[13px] font-medium text-zinc-800">{monthLabel(ym)}</span>
      <Link href={`${base}${sep}month=${shiftMonth(ym, 1)}`} className={btn} aria-label="เดือนถัดไป">›</Link>
    </div>
  );
}

export function ScoreBar({ score }: { score: number | null }) {
  const pct = score === null ? 0 : Math.min(100, score);
  const tone = score === null ? "bg-zinc-200" : score >= 100 ? "bg-emerald-500" : score >= 80 ? "bg-brand-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
      <span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

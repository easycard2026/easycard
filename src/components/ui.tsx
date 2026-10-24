import { initials } from "@/lib/format";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className="grid size-8 place-items-center rounded-[10px] bg-zinc-900 text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
          <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 10.5h17" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16.5" cy="14.5" r="1.2" fill="#a5b4fc" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">
        Easycard <span className="font-normal text-zinc-400">HR</span>
      </span>
    </div>
  );
}

const AVATAR_TONES = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
];

export function Avatar({ first, last, seed, size = "md" }: { first?: string | null; last?: string | null; seed?: string; size?: "sm" | "md" }) {
  const key = seed ?? `${first}${last}`;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tone = AVATAR_TONES[h % AVATAR_TONES.length];
  const dim = size === "sm" ? "size-8 text-xs" : "size-9 text-[13px]";
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-semibold ${dim} ${tone}`}>
      {initials(first, last)}
    </span>
  );
}

const BADGE_TONES = {
  gray: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-100",
} as const;
const DOT_TONES = {
  gray: "bg-zinc-400",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-rose-500",
  blue: "bg-brand-500",
} as const;

export function Badge({ tone = "gray", dot = true, children }: { tone?: keyof typeof BADGE_TONES; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}>
      {dot && <span className={`size-1.5 rounded-full ${DOT_TONES[tone]}`} />}
      {children}
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="text-[13px] font-medium text-zinc-400">{eyebrow}</p>}
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-zinc-500">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-2xl border border-zinc-200/80 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.03)] ${className}`}>{children}</div>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-medium text-zinc-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-zinc-400">{hint}</p>}
    </div>
  );
}

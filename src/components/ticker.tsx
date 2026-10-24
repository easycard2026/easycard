import Link from "next/link";
import { IconMegaphone } from "./icons";

// แถบข้อความประกาศเลื่อนด้านบนของทุกหน้า (ชี้เมาส์ค้างเพื่อหยุด)
export function Ticker({ items }: { items: { id: string; title: string; body: string }[] }) {
  if (!items.length) return null;
  const text = (b: string) => {
    const s = b.replace(/\s+/g, " ").trim();
    return s.length > 90 ? `${s.slice(0, 90)}…` : s;
  };
  // ข้อความสั้นให้ซ้ำหลายรอบ แถบจะได้เต็มจอกว้าง
  const once = items.reduce((n, a) => n + a.title.length + Math.min(90, a.body.length) + 8, 0);
  const loop = Array.from({ length: Math.max(1, Math.ceil(160 / once)) }, () => items).flat();
  const chars = once * (loop.length / items.length);
  const duration = Math.max(20, Math.round(chars / 6)); // ความเร็วคงที่ไม่ว่าข้อความยาวแค่ไหน

  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {loop.map((a, i) => (
        <li key={i} className="flex items-center">
          <Link href={`/announcements#${a.id}`} tabIndex={hidden || i >= items.length ? -1 : undefined} className="whitespace-nowrap px-6 hover:underline">
            <span className="font-medium text-zinc-900">{a.title}</span>
            {a.body && <span className="text-zinc-500"> · {text(a.body)}</span>}
          </Link>
          <span className="size-1 rounded-full bg-zinc-300" />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ticker flex items-center border-b border-zinc-200/80 bg-white text-[13px]">
      <Link href="/announcements" className="z-10 flex shrink-0 items-center gap-1.5 bg-white py-2 pl-4 pr-3 text-xs font-semibold text-brand-600 sm:pl-6 md:pl-8">
        <IconMegaphone className="size-4" />
        ประกาศ
      </Link>
      <div className="relative min-w-0 flex-1 overflow-hidden py-2 [mask-image:linear-gradient(90deg,transparent,#000_24px,#000_calc(100%-24px),transparent)]">
        <div className="ticker-track flex w-max" style={{ animationDuration: `${duration}s` }}>
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}

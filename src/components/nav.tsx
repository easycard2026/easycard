"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MenuIcon, MenuItem } from "@/lib/roles";
import {
  IconClock,
  IconFingerprint,
  IconHome,
  IconReceipt,
  IconShield,
  IconTimer,
  IconUpload,
  IconUsers,
  IconWallet,
} from "./icons";

const ICONS: Record<MenuIcon, (p: { className?: string }) => React.ReactElement> = {
  home: IconHome,
  users: IconUsers,
  clock: IconClock,
  upload: IconUpload,
  fingerprint: IconFingerprint,
  timer: IconTimer,
  wallet: IconWallet,
  receipt: IconReceipt,
  shield: IconShield,
};

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

// เมนูด้านข้าง (จอคอม)
export function SideNav({ items }: { items: MenuItem[] }) {
  const path = usePathname();
  const ready = items.filter((m) => !m.soon);
  const soon = items.filter((m) => m.soon);

  return (
    <nav className="flex flex-col gap-6">
      <ul className="space-y-0.5">
        {ready.map((m) => {
          const Icon = ICONS[m.icon];
          const active = isActive(path, m.href);
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition-colors ${
                  active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <Icon className={`size-[18px] ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-700"}`} />
                {m.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {soon.length > 0 && (
        <div>
          <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">กำลังพัฒนา</p>
          <ul className="space-y-0.5">
            {soon.map((m) => {
              const Icon = ICONS[m.icon];
              return (
                <li key={m.href} className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-zinc-400">
                  <Icon className="size-[18px] text-zinc-300" />
                  <span className="truncate">{m.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

// แถบเมนูด้านล่าง (มือถือ)
export function BottomNav({ items }: { items: MenuItem[] }) {
  const path = usePathname();
  const ready = items.filter((m) => !m.soon);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="mx-auto flex max-w-md">
        {ready.map((m) => {
          const Icon = ICONS[m.icon];
          const active = isActive(path, m.href);
          return (
            <li key={m.href} className="flex-1">
              <Link
                href={m.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${active ? "text-zinc-900" : "text-zinc-400"}`}
              >
                <Icon className="size-[22px]" />
                {m.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

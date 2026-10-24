"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { MenuIcon, MenuItem } from "@/lib/roles";
import {
  IconClock,
  IconFingerprint,
  IconHome,
  IconMegaphone,
  IconMore,
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
  megaphone: IconMegaphone,
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
    <nav className="flex flex-col gap-5">
      <ul className="space-y-0.5">
        {ready.map((m) => {
          const Icon = ICONS[m.icon];
          const active = isActive(path, m.href);
          return (
            <li key={m.href}>
              <Link
                href={m.href}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                  active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                <Icon className={`size-4 ${active ? "text-white" : "text-zinc-400 group-hover:text-zinc-700"}`} />
                {m.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {soon.length > 0 && (
        <div>
          <p className="px-2.5 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">กำลังพัฒนา</p>
          <ul className="space-y-0.5">
            {soon.map((m) => {
              const Icon = ICONS[m.icon];
              return (
                <li key={m.href} className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-zinc-400">
                  <Icon className="size-4 text-zinc-300" />
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

// แถบเมนูด้านล่าง (มือถือ): แสดงได้ 5 ช่อง ถ้าเมนูเกินให้ช่องสุดท้ายเป็น "เพิ่มเติม"
const MAX_TABS = 5;

export function BottomNav({ items }: { items: MenuItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const ready = items.filter((m) => !m.soon);
  const overflow = ready.length > MAX_TABS;
  const tabs = overflow ? ready.slice(0, MAX_TABS - 1) : ready;
  const more = overflow ? ready.slice(MAX_TABS - 1) : [];
  const moreActive = more.some((m) => isActive(path, m.href));

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-zinc-900/20" />
          <ul
            className="absolute inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom))] rounded-xl border border-zinc-200 bg-white p-1.5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {more.map((m) => {
              const Icon = ICONS[m.icon];
              const active = isActive(path, m.href);
              return (
                <li key={m.href}>
                  <Link
                    href={m.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] ${
                      active ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <Icon className="size-4" />
                    {m.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
        <ul className="mx-auto flex max-w-md">
          {tabs.map((m) => {
            const Icon = ICONS[m.icon];
            const active = isActive(path, m.href);
            return (
              <li key={m.href} className="min-w-0 flex-1">
                <Link
                  href={m.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium ${active ? "text-zinc-900" : "text-zinc-400"}`}
                >
                  <Icon className="size-5" />
                  <span className="max-w-full truncate px-1">{m.label}</span>
                </Link>
              </li>
            );
          })}
          {overflow && (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                className={`flex w-full flex-col items-center gap-1 py-2 text-[10px] font-medium ${
                  open || moreActive ? "text-zinc-900" : "text-zinc-400"
                }`}
              >
                <IconMore className="size-5" />
                เพิ่มเติม
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}

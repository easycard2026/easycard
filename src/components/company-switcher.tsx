"use client";

import { useRef } from "react";
import { switchCompany } from "@/app/(app)/companies/actions";
import type { CompanyOption } from "@/lib/session";

// ปุ่มสลับบริษัท: แสดงเมื่ออยู่มากกว่า 1 บริษัท ไม่งั้นแสดงแค่ชื่อบริษัท
export function CompanySwitcher({ companies, current, className = "" }: { companies: CompanyOption[]; current: string | null; className?: string }) {
  const form = useRef<HTMLFormElement>(null);
  const name = companies.find((c) => c.id === current)?.name ?? "";

  if (companies.length < 2) {
    return name ? <p className={`truncate text-[12px] font-medium text-zinc-500 ${className}`}>{name}</p> : null;
  }

  return (
    <form ref={form} action={switchCompany} className={className}>
      <label className="sr-only" htmlFor="company-switcher">บริษัทที่เปิดอยู่</label>
      <select
        id="company-switcher"
        name="company_id"
        defaultValue={current ?? ""}
        onChange={() => form.current?.requestSubmit()}
        className="h-8 w-full truncate rounded-lg border border-zinc-200 bg-white pl-2.5 pr-7 text-[12px] font-medium text-zinc-700 outline-none transition hover:border-zinc-300 focus:border-zinc-900"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </form>
  );
}

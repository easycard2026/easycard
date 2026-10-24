"use client";

import { useFormStatus } from "react-dom";

// ช่องกรอกและปุ่มที่ใช้ร่วมกันในหน้าฟอร์ม (สไตล์เดียวกับหน้าเข้าสู่ระบบ)
export const inputClass =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5 disabled:bg-zinc-50 disabled:text-zinc-400";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
    </label>
  );
}

const VARIANTS = {
  primary: "bg-zinc-900 text-white shadow-sm hover:bg-zinc-800",
  secondary: "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
  danger: "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
} as const;

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  confirm,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: "sm" | "md";
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition active:scale-[0.99] disabled:opacity-60 ${
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm"
      } ${VARIANTS[variant]} ${className}`}
    >
      {pending && <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
      {children}
    </button>
  );
}

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 print:hidden"
    >
      พิมพ์ / บันทึก PDF
    </button>
  );
}

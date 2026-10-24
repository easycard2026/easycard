import Link from "next/link";

// แถบข้อความหลังบันทึก (อ่านจาก ?ok= หรือ ?error= ใน URL)
export function Notice({ ok, error }: { ok?: string; error?: string }) {
  if (!ok && !error) return null;
  return (
    <p
      data-notice
      role={error ? "alert" : "status"}
      className={`rise rounded-lg px-3.5 py-2.5 text-[13px] ring-1 ring-inset ${
        error ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
      }`}
    >
      {error ?? ok}
    </p>
  );
}

export const baht = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-zinc-400 hover:text-zinc-800 print:hidden">
      ‹ {children}
    </Link>
  );
}

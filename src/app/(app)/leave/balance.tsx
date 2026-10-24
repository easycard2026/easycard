import { thaiDate } from "@/lib/format";
import { fmtDays, type Balance } from "@/lib/leave";
import { Card } from "@/components/ui";

// การ์ดสิทธิ์การลาและวันคงเหลือ แยกตามประเภท
export function BalanceGrid({ items }: { items: Balance[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((b) => {
        const pct = b.max ? Math.min(100, Math.round(((b.used + b.pending) / b.max) * 100)) : 0;
        return (
          <Card key={b.code} className="p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-zinc-500">{b.name}</p>
              {b.custom && <span className="text-[10px] text-brand-600">เฉพาะคน</span>}
            </div>
            {b.eligibleFrom ? (
              <>
                <p className="mt-2 text-sm font-semibold text-zinc-400">ยังไม่มีสิทธิ์</p>
                <p className="mt-1 text-[11px] text-zinc-400">ใช้ได้ตั้งแต่ {thaiDate(b.eligibleFrom)}</p>
              </>
            ) : (
              <>
                <p className="tabular mt-1.5 text-xl font-semibold leading-none tracking-tight">
                  {b.remaining == null ? fmtDays(b.used) : fmtDays(b.remaining)}
                  <span className="ml-1 text-xs font-normal text-zinc-400">
                    {b.remaining == null ? "วันที่ใช้ไป" : `/ ${fmtDays(b.max!)} วัน คงเหลือ`}
                  </span>
                </p>
                {b.max != null && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-zinc-900" style={{ width: `${pct}%` }} />
                  </div>
                )}
                <p className="tabular mt-2 text-[11px] leading-relaxed text-zinc-400">
                  {b.remaining != null && <>ใช้ {fmtDays(b.used)} · </>}
                  {b.pending > 0 && <>รอ {fmtDays(b.pending)} · </>}
                  {b.paid > 0 ? <>ได้ค่าจ้างอีก {fmtDays(b.paidRemaining)} วัน</> : <>ไม่ได้รับค่าจ้าง</>}
                  {b.unpaidUsed > 0 && <span className="text-rose-600"> · หักเงิน {fmtDays(b.unpaidUsed)} วัน</span>}
                </p>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}

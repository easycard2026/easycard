import Link from "next/link";
import { getSession } from "@/lib/session";
import { ANN_COLUMNS, signImageUrls, type Announcement } from "@/lib/announcements";
import { thaiDate, todayBangkok } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { Notice } from "@/components/notice";
import { deleteAnnouncement } from "./actions";

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  const canEdit = role === "ceo" || role === "accounting";

  const { data } = await supabase
    .from("announcements")
    .select(ANN_COLUMNS)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const items = (data ?? []) as Announcement[];
  const urls = await signImageUrls(supabase, items.flatMap((a) => a.image_paths));
  const today = todayBangkok();

  return (
    <div className="space-y-5">
      <PageHeader title="ประกาศ" description="ข่าวและการอัปเดตภายในบริษัท">
        {canEdit && (
          <Link
            href="/announcements/new"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            + เขียนประกาศ
          </Link>
        )}
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />

      {items.length === 0 ? (
        <Card className="rise">
          <EmptyState title="ยังไม่มีประกาศ" hint={canEdit ? "กด \"เขียนประกาศ\" เพื่อแจ้งข่าวให้พนักงานทุกคน" : undefined} />
        </Card>
      ) : (
        <ul className="rise space-y-3">
          {items.map((a) => {
            const expired = a.expires_on !== null && a.expires_on < today;
            return (
              <li key={a.id} id={a.id} className="scroll-mt-20">
                <Card className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.pinned && <Badge tone="blue">ปักหมุด</Badge>}
                        <h2 className="text-[15px] font-semibold text-zinc-900">{a.title}</h2>
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {thaiDate(a.created_at, "long")}
                        {a.author_name && ` · ${a.author_name}`}
                        {a.updated_at.slice(0, 16) !== a.created_at.slice(0, 16) && " · แก้ไขแล้ว"}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        {a.show_in_ticker && !expired && <Badge tone="green">อยู่บนแถบเลื่อน</Badge>}
                        <Link
                          href={`/announcements/${a.id}/edit`}
                          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          แก้ไข
                        </Link>
                        <form action={deleteAnnouncement}>
                          <input type="hidden" name="id" value={a.id} />
                          <SubmitButton size="sm" variant="danger" confirm={`ลบประกาศ "${a.title}"?`}>ลบ</SubmitButton>
                        </form>
                      </div>
                    )}
                  </div>
                  {a.body && <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-700">{a.body}</p>}
                  {a.image_paths.length > 0 && (
                    <div className={`mt-3 grid gap-2 ${a.image_paths.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
                      {a.image_paths.map((p) =>
                        urls.get(p) ? (
                          <a key={p} href={urls.get(p)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={urls.get(p)}
                              alt=""
                              loading="lazy"
                              className={a.image_paths.length === 1 ? "max-h-[28rem] w-full object-contain" : "aspect-[4/3] w-full object-cover"}
                            />
                          </a>
                        ) : null,
                      )}
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

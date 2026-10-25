import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ANN_COLUMNS, signImageUrls, type Announcement } from "@/lib/announcements";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/notice";
import { AnnouncementForm } from "../../announcement-form";

export default async function EditAnnouncementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role, name } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/announcements");
  const { data } = await supabase.from("announcements").select(ANN_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as Announcement;
  const urls = await signImageUrls(supabase, a.image_paths);
  return (
    <div className="space-y-5">
      <BackLink href="/announcements">ประกาศ</BackLink>
      <PageHeader title="แก้ไขประกาศ" />
      <Card className="rise p-4">
        <AnnouncementForm
          initial={a}
          authorName={name}
          existingImages={a.image_paths.map((path) => ({ path, url: urls.get(path) ?? "" }))}
        />
      </Card>
    </div>
  );
}

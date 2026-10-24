import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/notice";
import { AnnouncementForm } from "../announcement-form";

export default async function NewAnnouncementPage() {
  const { role, name } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/announcements");
  return (
    <div className="space-y-5">
      <BackLink href="/announcements">ประกาศ</BackLink>
      <PageHeader title="เขียนประกาศ" description="พนักงานทุกคนจะเห็นประกาศนี้" />
      <Card className="rise p-4">
        <AnnouncementForm authorName={name} />
      </Card>
    </div>
  );
}

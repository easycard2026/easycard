import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { BackLink, Notice } from "@/components/notice";
import { ShiftForm } from "../shift-form";
import { createShift } from "../actions";

export default async function NewShiftPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/shifts");
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <BackLink href="/shifts">กะการทำงาน</BackLink>
      <PageHeader title="เพิ่มกะ" />
      <Notice error={sp.error} />
      <Card className="rise p-4">
        <ShiftForm action={createShift} />
      </Card>
    </div>
  );
}

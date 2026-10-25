import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { ShiftForm, type ShiftRow } from "../shift-form";
import { deleteShift, updateShift } from "../actions";

export default async function EditShiftPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/shifts");

  const [{ data: shift }, { count: users }] = await Promise.all([
    supabase.from("shifts").select("id, name, start_time, end_time, break_minutes, break_start, late_grace_minutes").eq("id", id).maybeSingle(),
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("default_shift_id", id).eq("active", true),
  ]);
  if (!shift) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <BackLink href="/shifts">กะการทำงาน</BackLink>
      <PageHeader title={`แก้ไข${shift.name}`} description={users ? `ใช้เป็นกะประจำของพนักงาน ${users} คน แก้แล้วมีผลกับการคิดสาย/ชั่วโมงทำงานทันที` : undefined} />
      <Notice error={sp.error} />
      <Card className="rise p-4">
        <ShiftForm shift={shift as ShiftRow} action={updateShift} />
      </Card>
      <form action={deleteShift} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3">
        <input type="hidden" name="id" value={shift.id} />
        <p className="text-xs text-zinc-500">ลบได้เฉพาะกะที่ยังไม่มีใครใช้</p>
        <SubmitButton size="sm" variant="danger" confirm={`ลบ${shift.name}?`}>
          ลบกะ
        </SubmitButton>
      </form>
    </div>
  );
}

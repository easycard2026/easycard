import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { Notice } from "@/components/notice";
import { addMember, createCompany, removeMember, switchCompany, updateCompany } from "./actions";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role, user, companyId, companies } = await getSession();
  if (role !== "ceo") redirect("/");

  const [{ data: company }, { data: members }] = await Promise.all([
    supabase.from("companies").select("id, name, tax_id, branch, address").eq("id", companyId ?? "").single(),
    supabase.from("company_members").select("user_id, role, employee_id").eq("company_id", companyId ?? "").order("created_at"),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? ""]));
  const sm = `${inputClass} h-8 text-[13px]`;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ตั้งค่า"
        title="บริษัทในเครือ"
        description="ข้อมูลพนักงาน กะ วันหยุด OT และเงินเดือนแยกตามบริษัท สลับบริษัทได้จากเมนูด้านบน"
      />
      <Notice ok={sp.ok} error={sp.error} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rise p-4">
          <h2 className="text-sm font-semibold text-zinc-900">บริษัทที่เปิดอยู่</h2>
          {company && (
            <form action={updateCompany} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="ชื่อบริษัท" className="sm:col-span-2">
                <input name="name" required maxLength={200} defaultValue={company.name} className={inputClass} />
              </Field>
              <Field label="เลขผู้เสียภาษี" hint="13 หลัก">
                <input name="tax_id" inputMode="numeric" maxLength={17} defaultValue={company.tax_id ?? ""} className={inputClass} />
              </Field>
              <Field label="สาขา" hint="เช่น สำนักงานใหญ่">
                <input name="branch" maxLength={100} defaultValue={company.branch ?? ""} className={inputClass} />
              </Field>
              <Field label="ที่อยู่" className="sm:col-span-2">
                <textarea name="address" rows={2} maxLength={500} defaultValue={company.address ?? ""} className={`${inputClass} h-auto py-2`} />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton size="sm">บันทึก</SubmitButton>
              </div>
            </form>
          )}
        </Card>

        <Card className="rise p-4">
          <h2 className="text-sm font-semibold text-zinc-900">บริษัททั้งหมดของคุณ</h2>
          <ul className="mt-2 divide-y divide-zinc-100">
            {companies.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="truncate text-[13px] text-zinc-800">{c.name}</span>
                {c.id === companyId ? (
                  <Badge tone="green">เปิดอยู่</Badge>
                ) : (
                  <form action={switchCompany}>
                    <input type="hidden" name="company_id" value={c.id} />
                    <SubmitButton size="sm" variant="secondary">สลับไปบริษัทนี้</SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>

          <form action={createCompany} className="mt-4 grid gap-2.5 border-t border-zinc-100 pt-4 sm:grid-cols-[1fr_9rem_auto]">
            <input name="name" required maxLength={200} placeholder="ชื่อบริษัทใหม่" aria-label="ชื่อบริษัทใหม่" className={sm} />
            <input name="tax_id" inputMode="numeric" maxLength={17} placeholder="เลขผู้เสียภาษี" aria-label="เลขผู้เสียภาษี" className={sm} />
            <SubmitButton size="sm" confirm="สร้างบริษัทใหม่และสลับไปบริษัทนั้น?">เพิ่มบริษัท</SubmitButton>
          </form>
          <p className="mt-2 text-xs text-zinc-400">บริษัทใหม่จะได้ค่าตั้งค่าเงินเดือนและวันหยุดที่ยังไม่ถึงจากบริษัทที่เปิดอยู่</p>
        </Card>
      </div>

      <Card className="rise p-4">
        <h2 className="text-sm font-semibold text-zinc-900">ผู้ใช้ในบริษัทนี้</h2>
        <p className="mt-0.5 text-xs text-zinc-400">เพิ่มผู้ใช้ที่มีบัญชีอยู่แล้ว (เช่น บัญชีหรือผู้จัดการที่ดูแลหลายบริษัท) แต่ละบริษัทตั้ง Role แยกกันได้</p>

        <form action={addMember} className="mt-3 grid gap-2.5 sm:grid-cols-[1fr_12rem_auto]">
          <input name="email" type="email" required placeholder="อีเมลผู้ใช้" aria-label="อีเมลผู้ใช้" className={sm} />
          <select name="role" defaultValue="employee" aria-label="Role" className={sm}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <SubmitButton size="sm">เพิ่มเข้าบริษัท</SubmitButton>
        </form>

        <ul className="mt-3 divide-y divide-zinc-100">
          {(members ?? []).map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-zinc-800">{nameOf.get(m.user_id) || "ผู้ใช้"}</p>
                <p className="text-[11px] text-zinc-400">
                  {ROLE_LABEL[m.role as Role]}
                  {!m.employee_id && " · ยังไม่ได้ผูกข้อมูลพนักงาน"}
                </p>
              </div>
              {m.user_id !== user.id && (
                <form action={removeMember}>
                  <input type="hidden" name="user_id" value={m.user_id} />
                  <SubmitButton size="sm" variant="danger" confirm="เอาผู้ใช้นี้ออกจากบริษัทนี้? (บัญชีของเขายังอยู่ในบริษัทอื่น)">
                    เอาออก
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

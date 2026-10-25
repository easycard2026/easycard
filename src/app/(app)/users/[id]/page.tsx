import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { thaiDate } from "@/lib/format";
import { loginName, tempPassword } from "@/lib/users";
import { grantableRoles, listUsers } from "@/lib/users-data";
import { Badge, Card, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { resetPassword, setActive, updateTeam, updateUser } from "../actions";
import { ROLE_HINT, RoleSelect } from "../role-select";

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, role, user: me } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/");

  const [{ users }, { data: emps }, { data: departments }] = await Promise.all([
    listUsers(supabase),
    supabase.from("employees").select("id, code, first_name, last_name, department_id, manager_id, active").order("code"),
    supabase.from("departments").select("id, name").order("name"),
  ]);
  const u = users.find((x) => x.id === id);
  if (!u) notFound();

  const allowed = grantableRoles(role);
  const canEdit = allowed.includes(u.role);
  const isSelf = u.id === me.id;
  const linkedTo = new Map(users.filter((x) => x.employee_id).map((x) => [x.employee_id!, x.id]));
  const linkable = (emps ?? []).filter((e) => e.id === u.employee_id || (e.active && !linkedTo.has(e.id)));
  const emp = (emps ?? []).find((e) => e.id === u.employee_id);
  // ผู้ที่เป็นหัวหน้าได้: พนักงานที่บัญชีเป็น CEO หรือผู้จัดการ
  const roleOfEmp = new Map(users.filter((x) => x.employee_id && x.active).map((x) => [x.employee_id!, x.role]));
  const managers = (emps ?? []).filter(
    (e) => e.active && e.id !== emp?.id && (["ceo", "manager"] as (Role | undefined)[]).includes(roleOfEmp.get(e.id)),
  );

  return (
    <div className="space-y-5">
      <BackLink href="/users">ผู้ใช้และสิทธิ์</BackLink>
      <PageHeader title={u.display_name ?? loginName(u.email)} description={`${loginName(u.email)} · ${ROLE_LABEL[u.role]}`}>
        <div className="flex gap-1.5">
          {u.active ? <Badge tone="green">ใช้งานอยู่</Badge> : <Badge tone="red">ปิดอยู่</Badge>}
          {u.active && u.must_change_password && <Badge tone="amber" dot={false}>รอตั้งรหัสใหม่</Badge>}
        </div>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error} />
      {!canEdit && (
        <p className="rounded-lg bg-zinc-50 px-3.5 py-2.5 text-[13px] text-zinc-500 ring-1 ring-inset ring-zinc-200">
          บัญชีระดับ {ROLE_LABEL[u.role]} แก้ไขได้เฉพาะ CEO
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="rise p-4">
          <h2 className="mb-3 font-semibold">บัญชีและสิทธิ์</h2>
          <form action={updateUser} className="space-y-3.5">
            <input type="hidden" name="id" value={u.id} />
            <Field label="ชื่อที่แสดง">
              <input name="display_name" maxLength={100} defaultValue={u.display_name ?? ""} disabled={!canEdit} className={inputClass} />
            </Field>
            <Field label="สิทธิ์ (Role)" hint={isSelf ? "เปลี่ยน Role ของตัวเองไม่ได้" : ROLE_HINT}>
              {isSelf && <input type="hidden" name="role" value={u.role} />}
              <RoleSelect roles={canEdit ? allowed : [u.role]} value={u.role} disabled={!canEdit || isSelf} />
            </Field>
            <Field label="ผูกกับพนักงาน">
              <select name="employee_id" defaultValue={u.employee_id ?? ""} disabled={!canEdit} className={inputClass}>
                <option value="">ไม่ผูก</option>
                {linkable.map((e) => (
                  <option key={e.id} value={e.id}>{e.code} {e.first_name} {e.last_name}</option>
                ))}
              </select>
            </Field>
            {canEdit && <SubmitButton>บันทึก</SubmitButton>}
          </form>
          <dl className="mt-4 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-400">
            <div>สร้างเมื่อ {thaiDate(u.created_at)}</div>
            <div>{u.last_sign_in_at ? `เข้าระบบล่าสุด ${thaiDate(u.last_sign_in_at)}` : "ยังไม่เคยเข้าระบบ"}</div>
            {emp && (
              <Link href={`/employees/${emp.id}`} className="inline-block font-medium text-zinc-500 hover:text-zinc-900">
                ดูข้อมูลพนักงาน {emp.code} ›
              </Link>
            )}
          </dl>
        </Card>

        <div className="space-y-4">
          {emp && (
            <Card className="rise p-4">
              <h2 className="font-semibold">ทีม</h2>
              <p className="mb-3 text-xs text-zinc-400">หัวหน้าคือคนที่อนุมัติ OT ลา แลกกะ และจัดกะให้คนนี้ (ต้องมี Role ผู้จัดการ)</p>
              <form action={updateTeam} className="space-y-3.5">
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="employee_id" value={emp.id} />
                <Field label="แผนก">
                  <select name="department_id" defaultValue={emp.department_id ?? ""} className={inputClass}>
                    <option value="">ไม่ระบุ</option>
                    {(departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="หัวหน้า">
                  <select name="manager_id" defaultValue={emp.manager_id ?? ""} className={inputClass}>
                    <option value="">ไม่มี</option>
                    {managers.map((m) => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({ROLE_LABEL[roleOfEmp.get(m.id)!]})</option>
                    ))}
                  </select>
                </Field>
                <SubmitButton variant="secondary">บันทึกทีม</SubmitButton>
              </form>
            </Card>
          )}

          {canEdit && !isSelf && (
            <Card className="rise p-4">
              <h2 className="font-semibold">รีเซ็ตรหัสผ่าน</h2>
              <p className="mb-3 text-xs text-zinc-400">ตั้งรหัสชั่วคราวแล้วส่งให้ผู้ใช้ ผู้ใช้จะต้องตั้งรหัสใหม่เองตอนเข้าระบบ</p>
              <form action={resetPassword} className="flex gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input name="password" required minLength={8} maxLength={72} defaultValue={tempPassword()} aria-label="รหัสผ่านชั่วคราว" autoComplete="off" spellCheck={false} className={`${inputClass} font-mono`} />
                <SubmitButton variant="secondary" confirm="ตั้งรหัสผ่านชั่วคราวนี้ให้ผู้ใช้? รหัสเดิมจะใช้ไม่ได้">ตั้งรหัส</SubmitButton>
              </form>
            </Card>
          )}

          {canEdit && !isSelf && (
            <Card className="rise p-4">
              <h2 className="font-semibold">{u.active ? "ปิดบัญชี" : "เปิดบัญชีอีกครั้ง"}</h2>
              <p className="mb-3 text-xs text-zinc-400">
                {u.active ? "ใช้เมื่อพนักงานลาออก ผู้ใช้จะถูกออกจากระบบทันทีและเข้าไม่ได้ ข้อมูลเดิมยังอยู่ครบ" : "ผู้ใช้จะเข้าระบบด้วยรหัสเดิมได้อีกครั้ง"}
              </p>
              <form action={setActive}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                {u.active ? (
                  <SubmitButton variant="danger" confirm={`ปิดบัญชี ${u.display_name ?? ""}?`}>ปิดบัญชี</SubmitButton>
                ) : (
                  <SubmitButton variant="success">เปิดบัญชี</SubmitButton>
                )}
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

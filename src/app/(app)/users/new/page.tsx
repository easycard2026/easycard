import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { tempPassword } from "@/lib/users";
import { grantableRoles, listUsers } from "@/lib/users-data";
import { Card, PageHeader } from "@/components/ui";
import { Field, SubmitButton, inputClass } from "@/components/form";
import { BackLink, Notice } from "@/components/notice";
import { createUser } from "../actions";
import { ROLE_HINT, RoleSelect } from "../role-select";

export default async function NewUserPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/");

  const [{ users }, { data: emps }] = await Promise.all([
    listUsers(supabase),
    supabase.from("employees").select("id, code, first_name, last_name").eq("active", true).order("code"),
  ]);
  const linked = new Set(users.map((u) => u.employee_id).filter(Boolean));
  const free = (emps ?? []).filter((e) => !linked.has(e.id));
  const picked = free.find((e) => e.id === sp.employee);

  return (
    <div className="space-y-5">
      <BackLink href="/users">ผู้ใช้และสิทธิ์</BackLink>
      <PageHeader title="สร้างบัญชีผู้ใช้" description="ให้พนักงานใช้ชื่อผู้ใช้และรหัสผ่านนี้เข้าระบบ แล้วตั้งรหัสใหม่เองตอนเข้าครั้งแรก" />
      <Notice ok={sp.ok} error={sp.error} />

      <Card className="rise max-w-lg p-4">
        <form action={createUser} className="space-y-3.5">
          <Field label="พนักงาน" hint="ยังไม่มีชื่อในรายการ? กด &quot;เพิ่มพนักงาน&quot; ในหน้าผู้ใช้ก่อน">
            <select name="employee_id" defaultValue={picked?.id ?? ""} className={inputClass}>
              <option value="">ไม่ผูกกับพนักงาน</option>
              {free.map((e) => (
                <option key={e.id} value={e.id}>{e.code} {e.first_name} {e.last_name}</option>
              ))}
            </select>
          </Field>
          <Field label="ชื่อผู้ใช้ หรือ อีเมล" hint="เช่น somchai หรือ E005 (ภาษาอังกฤษ/ตัวเลข) ถ้ามีอีเมลใส่อีเมลได้">
            <input
              name="username"
              required
              maxLength={100}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              defaultValue={picked?.code.toLowerCase() ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="ชื่อที่แสดง" hint="เว้นว่างได้ ถ้าผูกพนักงานจะใช้ชื่อพนักงาน">
            <input name="display_name" maxLength={100} className={inputClass} />
          </Field>
          <Field label="สิทธิ์ (Role)" hint={ROLE_HINT}>
            <RoleSelect roles={grantableRoles(role)} />
          </Field>
          <Field label="รหัสผ่านชั่วคราว" hint="จดรหัสนี้ไว้ส่งให้พนักงาน (อย่างน้อย 8 ตัว)">
            <input name="password" required minLength={8} maxLength={72} defaultValue={tempPassword()} autoComplete="off" spellCheck={false} className={`${inputClass} font-mono`} />
          </Field>
          <SubmitButton className="w-full">สร้างบัญชี</SubmitButton>
        </form>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { getSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/roles";
import { loginName } from "@/lib/users";
import { Card, PageHeader } from "@/components/ui";
import { PasswordForm } from "./password-form";

export default async function AccountPage() {
  const { user, role, name, employeeId } = await getSession();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="บัญชีของฉัน" title={name} description={ROLE_LABEL[role]} />
      <div className="grid items-start gap-4 lg:grid-cols-[20rem_22rem]">
        <Card className="rise p-4 text-[13px]">
          <h2 className="font-semibold">ข้อมูลเข้าระบบ</h2>
          <dl className="mt-2 divide-y divide-zinc-100">
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-zinc-400">ชื่อผู้ใช้</dt>
              <dd className="break-all text-right text-zinc-800">{loginName(user.email)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2">
              <dt className="text-zinc-400">สิทธิ์</dt>
              <dd className="text-right text-zinc-800">{ROLE_LABEL[role]}</dd>
            </div>
          </dl>
          {employeeId && (
            <Link href={`/employees/${employeeId}`} className="mt-2 inline-block font-medium text-zinc-500 hover:text-zinc-900">
              ดูข้อมูลพนักงานของฉัน ›
            </Link>
          )}
        </Card>
        <Card className="rise p-4">
          <h2 className="mb-3 font-semibold">เปลี่ยนรหัสผ่าน</h2>
          <PasswordForm />
        </Card>
      </div>
    </div>
  );
}

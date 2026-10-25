import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/roles";
import { thaiDate } from "@/lib/format";
import { loginName } from "@/lib/users";
import { listUsers } from "@/lib/users-data";
import { Avatar, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { Notice } from "@/components/notice";

const ROLE_TONE = { ceo: "blue", accounting: "green", manager: "amber", employee: "gray" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, role } = await getSession();
  if (role !== "ceo" && role !== "accounting") redirect("/");

  const [{ users, error }, { data: emps }] = await Promise.all([
    listUsers(supabase),
    supabase.from("employees").select("id, code, first_name, last_name").eq("active", true).order("code"),
  ]);
  const empById = new Map((emps ?? []).map((e) => [e.id, e]));
  const linked = new Set(users.map((u) => u.employee_id).filter(Boolean));
  const noAccount = (emps ?? []).filter((e) => !linked.has(e.id));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="ตั้งค่า"
        title="ผู้ใช้และสิทธิ์"
        description={`${users.filter((u) => u.active).length} บัญชีที่ใช้งาน${role === "accounting" ? " · ฝ่ายบัญชีจัดการได้เฉพาะผู้จัดการและพนักงาน" : ""}`}
      >
        <div className="flex items-center gap-2">
          <Link href="/employees/new" className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            เพิ่มพนักงาน
          </Link>
          <Link href="/users/new" className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm hover:bg-zinc-800">
            + สร้างบัญชี
          </Link>
        </div>
      </PageHeader>
      <Notice ok={sp.ok} error={sp.error ?? (error ? "โหลดรายชื่อผู้ใช้ไม่สำเร็จ" : undefined)} />

      {noAccount.length > 0 && (
        <Card className="rise p-4">
          <p className="text-[13px] font-medium text-zinc-800">พนักงานที่ยังไม่มีบัญชีเข้าระบบ ({noAccount.length})</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {noAccount.map((e) => (
              <Link
                key={e.id}
                href={`/users/new?employee=${e.id}`}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-600 hover:border-zinc-900 hover:text-zinc-900"
              >
                + {e.code} {e.first_name} {e.last_name}
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="rise overflow-hidden">
        {users.length === 0 ? (
          <EmptyState title="ยังไม่มีผู้ใช้" />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {users.map((u) => {
              const e = u.employee_id ? empById.get(u.employee_id) : undefined;
              return (
                <li key={u.id}>
                  <Link href={`/users/${u.id}`} className={`flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 ${u.active ? "" : "opacity-60"}`}>
                    <Avatar first={u.display_name?.split(" ")[0]} last={u.display_name?.split(" ")[1]} seed={u.display_name ?? u.email} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-zinc-900">{u.display_name ?? loginName(u.email)}</p>
                      <p className="truncate text-xs text-zinc-400">
                        {loginName(u.email)}
                        {e ? ` · ${e.code}` : u.employee_id ? "" : " · ยังไม่ผูกพนักงาน"}
                      </p>
                    </div>
                    <div className="hidden text-right text-[11px] text-zinc-400 sm:block">
                      {u.last_sign_in_at ? `เข้าล่าสุด ${thaiDate(u.last_sign_in_at)}` : "ยังไม่เคยเข้า"}
                    </div>
                    <div className="flex flex-col items-end gap-1 sm:flex-row sm:items-center">
                      {!u.active && <Badge tone="red">ปิดอยู่</Badge>}
                      {u.active && u.must_change_password && <Badge tone="amber" dot={false}>รอตั้งรหัส</Badge>}
                      <Badge tone={ROLE_TONE[u.role]} dot={false}>{ROLE_LABEL[u.role]}</Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { EmployeeList, type EmployeeRow } from "./employee-list";

export default async function EmployeesPage() {
  const { supabase, role, employeeId } = await getSession();
  // พนักงานทั่วไปมีแค่ข้อมูลตัวเอง ไปหน้าของตัวเองเลย (มีเอกสารด้วย)
  if (role === "employee" && employeeId) redirect(`/employees/${employeeId}`);
  const { data, error } = await supabase
    .from("employees")
    .select("id, code, first_name, last_name, start_date, probation_end_date, probation_status, departments(name), positions(name)")
    .order("code");

  const employees: EmployeeRow[] = (data ?? []).map((e) => ({
    id: e.id,
    code: e.code,
    first_name: e.first_name,
    last_name: e.last_name,
    start_date: e.start_date,
    probation_end_date: e.probation_end_date,
    probation_status: e.probation_status,
    department: (e.departments as unknown as { name: string } | null)?.name ?? null,
    position: (e.positions as unknown as { name: string } | null)?.name ?? null,
  }));

  const title = role === "employee" ? "ข้อมูลของฉัน" : role === "manager" ? "พนักงานในทีม" : "พนักงานทั้งหมด";
  const description =
    role === "employee" ? "ข้อมูลการทำงานของคุณ" : `${employees.length} คน${role === "manager" ? " ที่อยู่ในความดูแลของคุณ" : " ในบริษัท"}`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="พนักงาน" title={title} description={description}>
        {(role === "ceo" || role === "accounting") && (
          <Link href="/employees/positions" className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            ตั้งค่าตำแหน่งงาน
          </Link>
        )}
      </PageHeader>
      {error ? (
        <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง</p>
      ) : (
        <EmployeeList employees={employees} showTools={role !== "employee"} />
      )}
    </div>
  );
}

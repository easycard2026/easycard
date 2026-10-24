import { getSession } from "@/lib/session";
import { PROBATION_LABEL } from "@/lib/roles";

export default async function EmployeesPage() {
  const { supabase, role } = await getSession();
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, code, first_name, last_name, start_date, probation_end_date, probation_status, departments(name)")
    .order("code");

  const title = role === "employee" ? "ข้อมูลของฉัน" : role === "manager" ? "พนักงานในทีม" : "พนักงานทั้งหมด";

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {error && <p className="mt-4 text-red-600">โหลดข้อมูลไม่สำเร็จ</p>}
      <div className="mt-6 overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3">รหัส</th>
              <th className="px-4 py-3">ชื่อ</th>
              <th className="px-4 py-3">แผนก</th>
              <th className="px-4 py-3">วันเริ่มงาน</th>
              <th className="px-4 py-3">ทดลองงาน</th>
            </tr>
          </thead>
          <tbody>
            {employees?.map((e) => {
              const dept = e.departments as unknown as { name: string } | null;
              return (
                <tr key={e.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">{e.code}</td>
                  <td className="px-4 py-3">{e.first_name} {e.last_name}</td>
                  <td className="px-4 py-3">{dept?.name ?? "-"}</td>
                  <td className="px-4 py-3">{e.start_date}</td>
                  <td className="px-4 py-3">
                    {PROBATION_LABEL[e.probation_status]}
                    {(e.probation_status === "on_probation" || e.probation_status === "extended") && (
                      <span className="text-gray-500"> · ครบ {e.probation_end_date}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

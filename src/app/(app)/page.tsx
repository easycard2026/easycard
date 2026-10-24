import { getSession } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/roles";

export default async function Dashboard() {
  const { supabase, role, name } = await getSession();

  // RLS กรองให้แล้ว: แต่ละ Role นับได้เฉพาะคนที่ตัวเองมีสิทธิ์เห็น
  const { count: employeeCount } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  const today = new Date();
  const soon = new Date(today.getTime() + 15 * 864e5).toISOString().slice(0, 10);
  const { data: dueProbation } = await supabase
    .from("employees")
    .select("code, first_name, last_name, probation_end_date")
    .in("probation_status", ["on_probation", "extended"])
    .lte("probation_end_date", soon)
    .order("probation_end_date");

  const scope = role === "employee" ? "ข้อมูลของคุณ" : role === "manager" ? "พนักงานในทีม" : "พนักงานทั้งบริษัท";

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">สวัสดี {name}</h1>
      <p className="mt-1 text-gray-500">คุณเข้าใช้งานในฐานะ {ROLE_LABEL[role]}</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
          <p className="text-sm text-gray-500">{scope}</p>
          <p className="mt-1 text-3xl font-semibold">{employeeCount ?? 0} คน</p>
        </div>
        {role !== "employee" && (
          <div className="rounded-xl bg-white p-5 ring-1 ring-gray-200">
            <p className="text-sm text-gray-500">ครบกำหนดทดลองงานใน 15 วัน</p>
            <p className="mt-1 text-3xl font-semibold">{dueProbation?.length ?? 0} คน</p>
            <ul className="mt-2 space-y-1 text-sm">
              {dueProbation?.map((e) => (
                <li key={e.code}>
                  {e.code} {e.first_name} {e.last_name} · ครบ {e.probation_end_date}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

import { getSession } from "@/lib/session";

export default async function ShiftsPage() {
  const { supabase } = await getSession();
  const { data: shifts } = await supabase
    .from("shifts")
    .select("id, name, start_time, end_time, break_minutes, crosses_midnight")
    .order("start_time");

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">กะการทำงาน</h1>
      <div className="mt-6 overflow-x-auto rounded-xl bg-white ring-1 ring-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3">กะ</th>
              <th className="px-4 py-3">เวลา</th>
              <th className="px-4 py-3">พัก (นาที)</th>
            </tr>
          </thead>
          <tbody>
            {shifts?.map((s) => (
              <tr key={s.id} className="border-t border-gray-100">
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3">
                  {s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}
                  {s.crosses_midnight && <span className="text-gray-500"> (ข้ามเที่ยงคืน)</span>}
                </td>
                <td className="px-4 py-3">{s.break_minutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

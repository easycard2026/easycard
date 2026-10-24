"use client";

import { useMemo, useState } from "react";
import { PROBATION_LABEL, PROBATION_TONE } from "@/lib/roles";
import { thaiDate } from "@/lib/format";
import { Avatar, Badge, Card, EmptyState } from "@/components/ui";
import { IconSearch } from "@/components/icons";

export type EmployeeRow = {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  start_date: string;
  probation_end_date: string;
  probation_status: string;
  department: string | null;
};

const FILTERS = [
  { key: "all", label: "ทั้งหมด" },
  { key: "probation", label: "ทดลองงาน" },
  { key: "passed", label: "ผ่านแล้ว" },
  { key: "failed", label: "ไม่ผ่าน" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

function matches(e: EmployeeRow, f: FilterKey) {
  if (f === "all") return true;
  if (f === "probation") return e.probation_status === "on_probation" || e.probation_status === "extended";
  return e.probation_status === f;
}

function Status({ e }: { e: EmployeeRow }) {
  const onProbation = e.probation_status === "on_probation" || e.probation_status === "extended";
  return (
    <div className="flex items-center gap-2">
      <Badge tone={PROBATION_TONE[e.probation_status]}>{PROBATION_LABEL[e.probation_status]}</Badge>
      {onProbation && <span className="text-[11px] text-zinc-400">ครบ {thaiDate(e.probation_end_date)}</span>}
    </div>
  );
}

export function EmployeeList({ employees, showTools }: { employees: EmployeeRow[]; showTools: boolean }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, employees.filter((e) => matches(e, f.key)).length])) as Record<FilterKey, number>,
    [employees],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return employees.filter(
      (e) =>
        matches(e, filter) &&
        (!needle || `${e.code} ${e.first_name} ${e.last_name} ${e.department ?? ""}`.toLowerCase().includes(needle)),
    );
  }, [employees, q, filter]);

  return (
    <div className="rise space-y-3" style={{ animationDelay: "60ms" }}>
      {showTools && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                    filter === f.key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                  }`}
                >
                  {f.label}
                  <span className={`tabular ml-1 text-[11px] ${filter === f.key ? "text-zinc-400" : "text-zinc-400/80"}`}>{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>
          <label className="relative block sm:w-64">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาชื่อ รหัส หรือแผนก"
              className="h-8 w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-[13px] outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100"
            />
          </label>
        </div>
      )}

      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState title="ไม่พบพนักงาน" hint={q ? "ลองค้นหาด้วยคำอื่น" : "ยังไม่มีข้อมูลในหมวดนี้"} />
        ) : (
          <>
            {/* จอคอม: ตาราง */}
            <table className="hidden w-full text-left text-[13px] md:table">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60 text-[11px] font-medium text-zinc-400">
                  <th className="py-2 pl-4 pr-3 font-medium">พนักงาน</th>
                  <th className="px-3 py-2 font-medium">แผนก</th>
                  <th className="px-3 py-2 font-medium">วันเริ่มงาน</th>
                  <th className="py-2 pl-3 pr-4 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-zinc-50/70">
                    <td className="py-2 pl-4 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
                        <div>
                          <p className="font-medium text-zinc-900">{e.first_name} {e.last_name}</p>
                          <p className="tabular text-[11px] text-zinc-400">{e.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">{e.department ?? <span className="text-zinc-300">-</span>}</td>
                    <td className="tabular px-3 py-2 text-zinc-600">{thaiDate(e.start_date)}</td>
                    <td className="py-2 pl-3 pr-4">
                      <Status e={e} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* มือถือ: การ์ด */}
            <ul className="divide-y divide-zinc-100 md:hidden">
              {rows.map((e) => (
                <li key={e.id} className="flex items-start gap-2.5 px-3.5 py-3">
                  <Avatar first={e.first_name} last={e.last_name} seed={e.code} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium">{e.first_name} {e.last_name}</p>
                        <p className="truncate text-[11px] text-zinc-400">
                          {e.code} · {e.department ?? "ไม่ระบุแผนก"}
                        </p>
                      </div>
                      <Badge tone={PROBATION_TONE[e.probation_status]}>{PROBATION_LABEL[e.probation_status]}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      เริ่มงาน {thaiDate(e.start_date)}
                      {(e.probation_status === "on_probation" || e.probation_status === "extended") && ` · ครบทดลองงาน ${thaiDate(e.probation_end_date)}`}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

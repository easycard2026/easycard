import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entitlement, LeaveReq, LeaveType } from "./leave";

// โหลดประเภทการลา สิทธิ์รายคน และใบลาของปี (RLS กรองตามสิทธิ์ผู้ใช้)
export async function loadLeaveYear(supabase: SupabaseClient, year: number, employeeIds?: string[]) {
  let ents = supabase.from("leave_entitlements").select("employee_id, leave_type, max_days, paid_days");
  let reqs = supabase
    .from("leave_requests")
    .select("employee_id, leave_type, start_date, days, unpaid_days, status")
    .in("status", ["pending", "approved"])
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`);
  if (employeeIds) {
    ents = ents.in("employee_id", employeeIds);
    reqs = reqs.in("employee_id", employeeIds);
  }
  const [t, e, r] = await Promise.all([supabase.from("leave_types").select("*").order("sort"), ents, reqs]);
  return {
    types: (t.data ?? []) as LeaveType[],
    entitlements: (e.data ?? []) as (Entitlement & { employee_id: string })[],
    requests: (r.data ?? []) as (LeaveReq & { employee_id: string })[],
  };
}

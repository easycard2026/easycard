import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/roles";

export type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: Role;
  employee_id: string | null;
  active: boolean;
  must_change_password: boolean;
  last_sign_in_at: string | null;
  created_at: string;
};

export async function listUsers(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("list_users");
  return { users: (data ?? []) as UserRow[], error };
}

// Role ที่ผู้ใช้คนนี้ให้ได้ (บัญชีให้ได้เฉพาะผู้จัดการ/พนักงาน)
export function grantableRoles(me: Role): Role[] {
  return me === "ceo" ? ["ceo", "accounting", "manager", "employee"] : me === "accounting" ? ["manager", "employee"] : [];
}

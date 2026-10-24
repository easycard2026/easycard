import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, employee_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/login?error=noprofile");

  return {
    supabase,
    user,
    role: profile.role as Role,
    name: profile.display_name ?? user.email ?? "",
    employeeId: profile.employee_id as string | null,
  };
}

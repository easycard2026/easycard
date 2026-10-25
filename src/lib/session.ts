import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/roles";

export type CompanyOption = { id: string; name: string };

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Role และ employee_id ใน profiles เป็นของบริษัทที่กำลังเปิดอยู่ (active_company_id)
  const [{ data: profile }, { data: companies }] = await Promise.all([
    supabase.from("profiles").select("role, display_name, employee_id, active_company_id").eq("id", user.id).single(),
    supabase.from("companies").select("id, name").order("created_at"),
  ]);
  if (!profile) redirect("/login?error=noprofile");

  const list = (companies ?? []) as CompanyOption[];
  const companyId = profile.active_company_id as string | null;

  return {
    supabase,
    user,
    role: profile.role as Role,
    name: profile.display_name ?? user.email ?? "",
    employeeId: profile.employee_id as string | null,
    companyId,
    companyName: list.find((c) => c.id === companyId)?.name ?? "",
    companies: list,
  };
}

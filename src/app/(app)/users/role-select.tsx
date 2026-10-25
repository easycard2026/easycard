import { ROLE_LABEL, type Role } from "@/lib/roles";
import { inputClass } from "@/components/form";

export function RoleSelect({ roles, value, disabled }: { roles: Role[]; value?: Role; disabled?: boolean }) {
  return (
    <select name="role" defaultValue={value ?? "employee"} disabled={disabled} className={inputClass}>
      {roles.map((r) => (
        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
      ))}
    </select>
  );
}

export const ROLE_HINT = "CEO เห็นทุกอย่าง · บัญชีจัดการเงินเดือน · ผู้จัดการดูแลลูกทีม · พนักงานเห็นของตัวเอง";

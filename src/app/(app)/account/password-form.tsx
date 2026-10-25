"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/form";
import { Notice } from "@/components/notice";
import { changeMyPassword } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changeMyPassword, undefined);
  return (
    <form action={action} className="space-y-3" key={state?.ok}>
      <Notice ok={state?.ok} error={state?.error} />
      <Field label="รหัสผ่านปัจจุบัน">
        <input name="current" type="password" required autoComplete="current-password" className={inputClass} />
      </Field>
      <Field label="รหัสผ่านใหม่" hint="อย่างน้อย 8 ตัว">
        <input name="next" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
      </Field>
      <Field label="ยืนยันรหัสผ่านใหม่">
        <input name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        เปลี่ยนรหัสผ่าน
      </button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { signIn } from "./actions";

const input =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5";

export function LoginForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState(signIn, undefined);
  const [show, setShow] = useState(false);
  const message = state?.error ?? notice;

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-700">ชื่อผู้ใช้หรืออีเมล</span>
        <input name="email" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" required placeholder="ชื่อผู้ใช้ หรือ name@company.com" className={input} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-700">รหัสผ่าน</span>
        <div className="relative">
          <input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            className={`${input} pr-16`}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            {show ? "ซ่อน" : "แสดง"}
          </button>
        </div>
      </label>
      {message && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 ring-1 ring-inset ring-rose-200">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.99] disabled:opacity-60"
      >
        {pending && <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
        {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}

import { getSession } from "@/lib/session";
import { MENU, ROLE_LABEL } from "@/lib/roles";
import { BottomNav, SideNav } from "@/components/nav";
import { Avatar, Logo } from "@/components/ui";
import { IconLogout } from "@/components/icons";
import { Ticker } from "@/components/ticker";
import { tickerAnnouncements } from "@/lib/announcements";
import Link from "next/link";
import { Card } from "@/components/ui";
import { PasswordForm } from "./account/password-form";

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        title="ออกจากระบบ"
        aria-label="ออกจากระบบ"
        className={`grid place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 ${compact ? "size-8" : "size-7"}`}
      >
        <IconLogout />
      </button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, role, name, mustChangePassword } = await getSession();
  const news = await tickerAnnouncements(supabase);
  const items = MENU.filter((m) => m.roles.includes(role));
  const [first, ...rest] = name.split(" ");

  return (
    <div className="min-h-screen">
      {/* จอคอม: เมนูด้านซ้าย */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-zinc-200/80 bg-white md:flex">
        <div className="px-4 pb-5 pt-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5">
          <SideNav items={items} />
        </div>
        <div className="m-2.5 flex items-center gap-2.5 rounded-xl border border-zinc-200/80 p-2.5">
          <Link href="/account" title="บัญชีของฉัน" className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg hover:opacity-80">
            <Avatar first={first} last={rest.join(" ")} seed={name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-zinc-900">{name}</p>
              <p className="truncate text-[11px] text-zinc-500">{ROLE_LABEL[role]}</p>
            </div>
          </Link>
          <SignOutButton />
        </div>
      </aside>

      {/* มือถือ: แถบด้านบน */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200/80 bg-white/85 px-4 py-2.5 backdrop-blur-xl md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <Link href="/account" title="บัญชีของฉัน" aria-label="บัญชีของฉัน">
            <Avatar first={first} last={rest.join(" ")} seed={name} size="sm" />
          </Link>
          <SignOutButton compact />
        </div>
      </header>

      <div className="sticky top-[calc(3.25rem+1px)] z-10 md:top-0 md:ml-56">
        <Ticker items={news} />
      </div>

      <main className="px-4 pb-24 pt-5 sm:px-6 md:ml-56 md:px-8 md:pb-10 md:pt-7">
        <div className="mx-auto max-w-6xl">
          {mustChangePassword ? (
            <Card className="rise mx-auto max-w-sm p-5">
              <h1 className="text-lg font-semibold tracking-tight">ตั้งรหัสผ่านใหม่</h1>
              <p className="mb-4 mt-1 text-[13px] text-zinc-500">
                บัญชีนี้ใช้รหัสผ่านชั่วคราวอยู่ กรุณาตั้งรหัสผ่านของคุณเองก่อนใช้งาน
              </p>
              <PasswordForm />
            </Card>
          ) : (
            children
          )}
        </div>
      </main>

      <BottomNav items={items} />
    </div>
  );
}

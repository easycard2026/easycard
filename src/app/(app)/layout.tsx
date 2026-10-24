import { getSession } from "@/lib/session";
import { MENU, ROLE_LABEL } from "@/lib/roles";
import { BottomNav, SideNav } from "@/components/nav";
import { Avatar, Logo } from "@/components/ui";
import { IconLogout } from "@/components/icons";

function SignOutButton({ compact = false }: { compact?: boolean }) {
  return (
    <form action="/auth/signout" method="post">
      <button
        title="ออกจากระบบ"
        aria-label="ออกจากระบบ"
        className={`grid place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900 ${compact ? "size-9" : "size-8"}`}
      >
        <IconLogout />
      </button>
    </form>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, name } = await getSession();
  const items = MENU.filter((m) => m.roles.includes(role));
  const [first, ...rest] = name.split(" ");

  return (
    <div className="min-h-screen">
      {/* จอคอม: เมนูด้านซ้าย */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-zinc-200/80 bg-white md:flex">
        <div className="px-5 pb-6 pt-6">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SideNav items={items} />
        </div>
        <div className="m-3 flex items-center gap-3 rounded-2xl border border-zinc-200/80 p-3">
          <Avatar first={first} last={rest.join(" ")} seed={name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{name}</p>
            <p className="truncate text-xs text-zinc-500">{ROLE_LABEL[role]}</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* มือถือ: แถบด้านบน */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-200/80 bg-white/85 px-4 py-3 backdrop-blur-xl md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <Avatar first={first} last={rest.join(" ")} seed={name} size="sm" />
          <SignOutButton compact />
        </div>
      </header>

      <main className="px-4 pb-28 pt-6 sm:px-6 md:ml-64 md:px-10 md:pb-16 md:pt-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      <BottomNav items={items} />
    </div>
  );
}

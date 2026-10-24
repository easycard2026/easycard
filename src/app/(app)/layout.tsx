import Link from "next/link";
import { getSession } from "@/lib/session";
import { MENU, ROLE_LABEL } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, name } = await getSession();
  const items = MENU.filter((m) => m.roles.includes(role));

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-gray-200 bg-white md:min-h-screen md:w-64 md:border-b-0 md:border-r">
        <div className="p-5">
          <p className="text-lg font-semibold">Easycard HR</p>
          <p className="mt-2 text-sm">{name}</p>
          <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-800">
            {ROLE_LABEL[role]}
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col">
          {items.map((m) =>
            m.soon ? (
              <span key={m.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-gray-400">
                {m.label} <span className="text-xs">(เร็วๆ นี้)</span>
              </span>
            ) : (
              <Link key={m.href} href={m.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-gray-100">
                {m.label}
              </Link>
            ),
          )}
        </nav>
        <form action="/auth/signout" method="post" className="px-3 pb-5">
          <button className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">ออกจากระบบ</button>
        </form>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

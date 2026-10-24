import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

const POINTS = [
  { t: "ข้อมูลพนักงานครบในที่เดียว", d: "แผนก วันเริ่มงาน และสถานะทดลองงาน" },
  { t: "จัดกะได้หลายรูปแบบ", d: "รองรับกะกลางคืนและกะข้ามเที่ยงคืน" },
  { t: "สิทธิ์ตามตำแหน่ง", d: "แต่ละคนเห็นเฉพาะข้อมูลที่ควรเห็น" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const notice = error === "noprofile" ? "บัญชีนี้ยังไม่ได้ตั้งค่าสิทธิ์ ติดต่อผู้ดูแลระบบ" : undefined;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ฝั่งซ้าย: แบรนด์ (จอใหญ่) */}
      <section className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 30% 40%, #000 20%, transparent 75%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -right-32 size-[520px] rounded-full bg-indigo-500/25 blur-[120px]"
        />

        <div className="relative">
          <div className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-[10px] bg-white text-zinc-900">
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" aria-hidden="true">
                <rect x="3.5" y="6" width="17" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3.5 10.5h17" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="16.5" cy="14.5" r="1.2" fill="#6366f1" />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-tight">
              Easycard <span className="font-normal text-zinc-500">HR</span>
            </span>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[40px] font-semibold leading-[1.15] tracking-tight">
            งานบุคคลที่ง่าย
            <br />
            <span className="text-zinc-500">สำหรับทุกคนในทีม</span>
          </h2>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.t} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-indigo-400" />
                <div>
                  <p className="font-medium">{p.t}</p>
                  <p className="text-sm text-zinc-400">{p.d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-600">© {new Date().getFullYear() + 543} Easycard</p>
      </section>

      {/* ฝั่งขวา: ฟอร์ม */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="rise w-full max-w-[360px]">
          <Logo className="mb-12 lg:hidden" />
          <h1 className="text-[28px] font-semibold tracking-tight">ยินดีต้อนรับกลับ</h1>
          <p className="mb-8 mt-1.5 text-[15px] text-zinc-500">เข้าสู่ระบบด้วยบัญชีที่บริษัทสร้างให้</p>
          <LoginForm notice={notice} />
          <p className="mt-8 text-center text-[13px] text-zinc-400">ลืมรหัสผ่าน? ติดต่อฝ่ายบุคคลหรือผู้ดูแลระบบ</p>
        </div>
      </section>
    </main>
  );
}

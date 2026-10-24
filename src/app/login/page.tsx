import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="text-2xl font-semibold">Easycard HR</h1>
        <p className="mb-6 mt-1 text-sm text-gray-500">เข้าสู่ระบบด้วยบัญชีที่บริษัทสร้างให้</p>
        <LoginForm />
      </div>
    </main>
  );
}

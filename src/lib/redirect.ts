import { redirect } from "next/navigation";

// กลับไปหน้าเดิมพร้อมข้อความแจ้งผล
export function back(path: string, kind: "ok" | "error", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

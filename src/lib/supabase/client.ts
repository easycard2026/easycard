import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// ใช้ในเบราว์เซอร์ (เช่น อัปโหลดไฟล์ตรงไป Storage) สิทธิ์ยังถูกตรวจด้วย RLS เหมือนเดิม
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { todayBangkok } from "@/lib/format";

export const ANN_BUCKET = "announcement-images";
export const ANN_MAX_BYTES = 5 * 1024 * 1024;
export const ANN_MAX_IMAGES = 10;

export type Announcement = {
  id: string;
  title: string;
  body: string;
  image_paths: string[];
  pinned: boolean;
  show_in_ticker: boolean;
  expires_on: string | null;
  author_name: string | null;
  created_at: string;
  updated_at: string;
};

export const ANN_COLUMNS = "id, title, body, image_paths, pinned, show_in_ticker, expires_on, author_name, created_at, updated_at";

// ประกาศที่ยังขึ้นแถบข้อความเลื่อน (ยังไม่หมดอายุ)
export async function tickerAnnouncements(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body")
    .eq("show_in_ticker", true)
    .or(`expires_on.is.null,expires_on.gte.${todayBangkok()}`)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as { id: string; title: string; body: string }[];
}

// ลิงก์รูปชั่วคราว 1 ชั่วโมง (bucket เป็นแบบส่วนตัว เห็นได้เฉพาะคนที่ login)
export async function signImageUrls(supabase: SupabaseClient, paths: string[]) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await supabase.storage.from(ANN_BUCKET).createSignedUrls(paths, 3600);
  for (const s of data ?? []) if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  return map;
}

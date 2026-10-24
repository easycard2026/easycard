"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { back } from "@/lib/redirect";
import { ANN_BUCKET } from "@/lib/announcements";

const PATH = "/announcements";

export async function deleteAnnouncement(formData: FormData) {
  const { supabase } = await getSession();
  const { data: rows, error } = await supabase
    .from("announcements")
    .delete()
    .eq("id", String(formData.get("id")))
    .select("image_paths");
  if (error || !rows?.length) back(PATH, "error", "ลบประกาศไม่สำเร็จ (เฉพาะ CEO และบัญชีลบได้)");
  const paths = rows[0].image_paths as string[];
  if (paths.length) await supabase.storage.from(ANN_BUCKET).remove(paths);
  revalidatePath("/", "layout");
  back(PATH, "ok", "ลบประกาศแล้ว");
}

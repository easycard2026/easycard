"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ANN_BUCKET, ANN_MAX_BYTES, ANN_MAX_IMAGES, type Announcement } from "@/lib/announcements";
import { Field, inputClass } from "@/components/form";

type Existing = { path: string; url: string };

// ย่อรูปจากมือถือให้เล็กลงก่อนอัปโหลด (ด้านยาวสุด 1920px) ถ้าย่อไม่ได้ใช้ไฟล์เดิม
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function AnnouncementForm({
  initial,
  existingImages = [],
  authorName,
}: {
  initial?: Announcement;
  existingImages?: Existing[];
  authorName: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [pinned, setPinned] = useState(initial?.pinned ?? false);
  const [ticker, setTicker] = useState(initial?.show_in_ticker ?? true);
  const [expires, setExpires] = useState(initial?.expires_on ?? "");
  const [kept, setKept] = useState<Existing[]>(existingImages);
  const [files, setFiles] = useState<{ file: File; preview: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // คืนหน่วยความจำของรูปตัวอย่างเมื่อออกจากหน้า
  const previews = useRef<string[]>([]);
  previews.current = files.map((f) => f.preview);
  useEffect(() => () => previews.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const total = kept.length + files.length;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = ANN_MAX_IMAGES - total;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
    if (list.length > room) setError(`แนบรูปได้สูงสุด ${ANN_MAX_IMAGES} รูป`);
    else setError(null);
    setFiles((cur) => [...cur, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("กรุณาใส่หัวข้อประกาศ");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const id = initial?.id ?? crypto.randomUUID();
    const uploaded: string[] = [];

    const fail = async (text: string) => {
      if (uploaded.length) await supabase.storage.from(ANN_BUCKET).remove(uploaded);
      setBusy(false);
      setError(text);
    };

    for (const { file } of files) {
      const f = await shrink(file);
      if (f.size > ANN_MAX_BYTES) return fail(`รูป "${file.name}" ใหญ่เกิน 5 MB`);
      const ext = (f.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
      const path = `${id}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
      const up = await supabase.storage.from(ANN_BUCKET).upload(path, f, { contentType: f.type || undefined });
      if (up.error) {
        return fail(
          /mime|type/i.test(up.error.message)
            ? "รองรับเฉพาะรูป JPG PNG WEBP GIF"
            : /row-level|policy|unauthorized/i.test(up.error.message)
              ? "คุณไม่มีสิทธิ์ลงประกาศ (เฉพาะ CEO และบัญชี)"
              : "อัปโหลดรูปไม่สำเร็จ ลองอีกครั้ง",
        );
      }
      uploaded.push(path);
    }

    const row = {
      title: title.trim(),
      body: body.trim(),
      image_paths: [...kept.map((k) => k.path), ...uploaded],
      pinned,
      show_in_ticker: ticker,
      expires_on: expires || null,
    };
    const res = initial
      ? await supabase.from("announcements").update(row).eq("id", id).select("id")
      : await supabase.from("announcements").insert({ ...row, id, author_name: authorName }).select("id");
    if (res.error || !res.data?.length) return fail("บันทึกประกาศไม่สำเร็จ (เฉพาะ CEO และบัญชีลงประกาศได้)");

    // ลบรูปที่เอาออกตอนแก้ไข
    const removed = existingImages.filter((x) => !kept.some((k) => k.path === x.path)).map((x) => x.path);
    if (removed.length) await supabase.storage.from(ANN_BUCKET).remove(removed);

    const msg = initial ? "บันทึกการแก้ไขแล้ว" : "ลงประกาศแล้ว";
    router.push(`/announcements?ok=${encodeURIComponent(msg)}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="หัวข้อ">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="เช่น แจ้งวันหยุดสงกรานต์" className={inputClass} />
      </Field>
      <Field label="รายละเอียด">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={10000}
          rows={6}
          placeholder="เขียนข้อความประกาศ"
          className={`${inputClass} h-auto py-2 leading-relaxed`}
        />
      </Field>

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-zinc-700">รูปภาพ</span>
        {total > 0 && (
          <ul className="mb-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {kept.map((k) => (
              <Thumb key={k.path} src={k.url} onRemove={() => setKept((cur) => cur.filter((x) => x.path !== k.path))} />
            ))}
            {files.map((f, i) => (
              <Thumb key={f.preview} src={f.preview} onRemove={() => {
                  URL.revokeObjectURL(f.preview);
                  setFiles((cur) => cur.filter((_, j) => j !== i));
                }} />
            ))}
          </ul>
        )}
        {total < ANN_MAX_IMAGES && (
          <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
            + แนบรูป
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="sr-only" onChange={(e) => addFiles(e.target.files)} />
          </label>
        )}
        <span className="ml-3 text-[11px] text-zinc-400">ไม่เกิน {ANN_MAX_IMAGES} รูป ระบบย่อรูปให้อัตโนมัติ</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-zinc-50 px-3 py-2.5 text-[13px] text-zinc-700">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ticker} onChange={(e) => setTicker(e.target.checked)} className="size-4 accent-zinc-900" />
          ขึ้นแถบข้อความเลื่อน
        </label>
        {ticker && (
          <label className="flex flex-wrap items-center gap-2">
            ถึงวันที่
            <span className="w-40">
              <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={`${inputClass} h-8 text-[13px]`} />
            </span>
            <span className="text-[11px] text-zinc-400">ไม่ใส่ = ขึ้นตลอด</span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="size-4 accent-zinc-900" />
          ปักหมุดไว้บนสุด
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy && <span className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
          {initial ? "บันทึก" : "ลงประกาศ"}
        </button>
        {error && <span role="alert" className="text-xs text-rose-600">{error}</span>}
      </div>
    </form>
  );
}

function Thumb({ src, onRemove }: { src: string; onRemove: () => void }) {
  return (
    <li className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="size-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        aria-label="เอารูปออก"
        className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-zinc-900/70 text-xs text-white hover:bg-zinc-900"
      >
        ✕
      </button>
    </li>
  );
}

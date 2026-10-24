"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DOC_ACCEPT, DOC_BUCKET, DOC_CATEGORIES, DOC_LABEL, DOC_MAX_BYTES } from "@/lib/documents";
import { inputClass } from "@/components/form";

// อัปโหลดจากเบราว์เซอร์ตรงไป Storage (ไม่ผ่านเซิร์ฟเวอร์ จึงรับไฟล์ใหญ่ได้ถึง 10 MB)
export function UploadForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState("id_card");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return setMsg({ ok: false, text: "กรุณาเลือกไฟล์" });
    if (file.size > DOC_MAX_BYTES) return setMsg({ ok: false, text: "ไฟล์ใหญ่เกิน 10 MB" });

    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
    const path = `${employeeId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

    const { data: auth } = await supabase.auth.getUser();
    const up = await supabase.storage.from(DOC_BUCKET).upload(path, file, { contentType: file.type || undefined });
    if (up.error) {
      setBusy(false);
      const t = /mime|type/i.test(up.error.message)
        ? "ไฟล์ประเภทนี้อัปโหลดไม่ได้ ใช้ PDF รูปภาพ Word หรือ Excel"
        : /row-level|policy|unauthorized/i.test(up.error.message)
          ? "คุณไม่มีสิทธิ์อัปโหลดเอกสารให้พนักงานคนนี้"
          : "อัปโหลดไม่สำเร็จ ลองอีกครั้ง";
      return setMsg({ ok: false, text: t });
    }

    const { error } = await supabase.from("employee_documents").insert({
      employee_id: employeeId,
      category,
      title: title.trim() || DOC_LABEL[category],
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: auth.user?.id,
    });
    if (error) {
      await supabase.storage.from(DOC_BUCKET).remove([path]);
      setBusy(false);
      return setMsg({ ok: false, text: "บันทึกเอกสารไม่สำเร็จ" });
    }

    setBusy(false);
    setTitle("");
    if (fileRef.current) fileRef.current.value = "";
    setMsg({ ok: true, text: "อัปโหลดแล้ว" });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid gap-2.5 sm:grid-cols-[11rem_1fr]">
      <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} aria-label="ประเภทเอกสาร">
        {DOC_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </select>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="ชื่อเอกสาร (ไม่ใส่ก็ได้)" className={inputClass} />
      <input
        ref={fileRef}
        type="file"
        accept={DOC_ACCEPT}
        required
        className="text-[13px] text-zinc-600 file:mr-3 file:h-8 file:rounded-lg file:border file:border-zinc-200 file:bg-white file:px-3 file:text-xs file:font-medium file:text-zinc-700 hover:file:bg-zinc-50 sm:col-span-2"
      />
      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-8 items-center gap-2 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
        >
          {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" />}
          อัปโหลด
        </button>
        <span className="text-[11px] text-zinc-400">PDF รูปภาพ Word Excel ไม่เกิน 10 MB</span>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

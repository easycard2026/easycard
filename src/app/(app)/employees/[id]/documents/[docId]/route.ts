import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DOC_BUCKET } from "@/lib/documents";

// เปิดหรือดาวน์โหลดเอกสาร: ตรวจสิทธิ์ผ่าน RLS แล้วส่งไปลิงก์ชั่วคราว 60 วินาที
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("employee_documents")
    .select("file_path, file_name")
    .eq("id", docId)
    .eq("employee_id", id)
    .maybeSingle();
  if (!doc) return new NextResponse("ไม่พบเอกสาร หรือคุณไม่มีสิทธิ์ดู", { status: 404 });

  const download = req.nextUrl.searchParams.has("download");
  const { data, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(doc.file_path, 60, download ? { download: doc.file_name } : undefined);
  if (error || !data) return new NextResponse("เปิดไฟล์ไม่สำเร็จ", { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}

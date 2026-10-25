import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function signOut(request: NextRequest, to: string) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL(to, request.url), { status: 303 });
}

export async function POST(request: NextRequest) {
  return signOut(request, "/login");
}

// ใช้เมื่อบัญชีถูกปิดใช้งาน (ระบบพามาเอง)
export async function GET(request: NextRequest) {
  return signOut(request, request.nextUrl.searchParams.get("reason") === "inactive" ? "/login?error=inactive" : "/login");
}

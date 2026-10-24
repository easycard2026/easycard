// ค่าเชื่อมต่อ Supabase เป็นค่าสาธารณะ (เบราว์เซอร์เห็นอยู่แล้ว) ความปลอดภัยอยู่ที่ RLS ในฐานข้อมูล
// ตั้ง env ทับได้ถ้าย้ายไปโปรเจกต์ Supabase อื่น
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://mawuhdwufwgxakalwouc.supabase.co";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_XJR6wvNVV0b92Kqg6O35tQ_aL16NgJT";

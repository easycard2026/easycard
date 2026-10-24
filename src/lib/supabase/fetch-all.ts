// PostgREST ส่งกลับได้ครั้งละไม่เกิน 1000 แถว (ค่าเริ่มต้นของ Supabase)
// ตัวช่วยนี้ดึงทีละหน้าจนครบ ใส่ .order() ใน query ด้วยเพื่อให้แบ่งหน้าได้คงที่
const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchAll<T>(query: (from: number, to: number) => Page<T>): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) return { data: all, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) return { data: all, error: null };
  }
}

// ปุ่ม Export: เลือกตัวเลือกแล้วดาวน์โหลดไฟล์ (ฟอร์ม GET ธรรมดา ไม่ต้องใช้ JavaScript)
export function ExportMenu({ isAdmin }: { isAdmin: boolean }) {
  return (
    <details className="group relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 [&::-webkit-details-marker]:hidden">
        Export Excel
      </summary>
      <form
        action="/employees/export"
        method="get"
        className="absolute right-0 z-30 mt-1.5 w-64 space-y-2.5 rounded-xl border border-zinc-200 bg-white p-3 text-[13px] shadow-lg"
      >
        <p className="text-xs text-zinc-400">รหัส ชื่อ ตำแหน่ง แผนก หัวหน้า วันเริ่มงาน อายุงาน สถานะทดลองงาน จำนวนเอกสาร</p>
        <label className="flex items-center gap-2 text-zinc-700">
          <input type="checkbox" name="inactive" className="size-4 rounded" />
          รวมคนที่พ้นสภาพแล้ว
        </label>
        {isAdmin && (
          <label className="flex items-start gap-2 text-zinc-700">
            <input type="checkbox" name="private" className="mt-0.5 size-4 rounded" />
            <span>
              รวมข้อมูลส่วนตัว
              <span className="block text-[11px] text-zinc-400">เลขบัตรประชาชน บัญชีธนาคาร เงินเดือน</span>
            </span>
          </label>
        )}
        <button type="submit" className="h-8 w-full rounded-lg bg-zinc-900 text-xs font-medium text-white hover:bg-zinc-800">
          ดาวน์โหลด
        </button>
      </form>
    </details>
  );
}

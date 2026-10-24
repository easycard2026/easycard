-- หักเงินมาสาย / ออกก่อน / ขาดงาน และตั้งค่า "สายเกินกี่นาทีนับเป็นขาดงาน"
-- อัตราหัก: ต่อนาที = เงินเดือน ÷ วันต่อเดือน ÷ ชั่วโมงต่อวัน ÷ 60, ขาดงาน = เงินเดือน ÷ วันต่อเดือน ต่อวัน
alter table public.payroll_settings
  add column late_deduct boolean not null default true,          -- หักเงินมาสายตามนาที
  add column early_deduct boolean not null default true,         -- หักเงินออกก่อนเวลาตามนาที
  add column absent_deduct boolean not null default true,        -- หักเงินขาดงานเต็มวัน
  add column late_absent_minutes int check (late_absent_minutes is null or late_absent_minutes > 0); -- สายตั้งแต่กี่นาที = ขาดงาน (ว่าง = ไม่ใช้)

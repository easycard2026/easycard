-- ตั้งค่ากะ: เวลาเริ่มพัก (ไม่บังคับ) และกันค่าติดลบ
-- break_minutes = 0 คือกะที่ไม่มีเวลาพัก
-- break_start ว่าง = หักพักตามจำนวนนาทีเมื่อทำงานเกิน 5 ชม. / มีค่า = หักเฉพาะช่วงพักที่อยู่ในเวลาทำงานจริง
alter table public.shifts
  add column break_start time,
  add constraint shifts_break_minutes_check check (break_minutes >= 0 and break_minutes < 720),
  add constraint shifts_late_grace_check check (late_grace_minutes >= 0 and late_grace_minutes <= 240),
  add constraint shifts_name_check check (length(btrim(name)) > 0);

create trigger audit_shifts after insert or update or delete on public.shifts
  for each row execute function private.audit();

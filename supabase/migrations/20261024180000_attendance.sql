-- เวลาเข้า-ออกรายวัน และกะประจำของพนักงาน
-- attendance_days เก็บเวลาเข้า-ออกจริงต่อคนต่อวัน (จากไฟล์เครื่องสแกนในส่วนที่ 2 หรือบัญชีกรอกเอง)
-- ส่วนสาย / ออกก่อน / ขาด / ชั่วโมงทำงาน คำนวณตอนแสดงผลจากกะของวันนั้น จึงถูกต้องเสมอเมื่อแก้กะ

-- กะประจำ: ใช้เมื่อวันนั้นไม่มีการจัดกะเฉพาะวันใน shift_assignments
alter table public.employees
  add column default_shift_id uuid references public.shifts(id),
  add column days_off smallint[] not null default '{0}';   -- วันหยุดประจำสัปดาห์ 0 = อาทิตย์ ... 6 = เสาร์

create type public.attendance_source as enum ('import', 'manual');

create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  source public.attendance_source not null default 'manual',
  note text,
  updated_by uuid references auth.users(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date),
  check (clock_out is null or clock_in is null or clock_out > clock_in)
);
create index on public.attendance_days (work_date);

create trigger audit_attendance after insert or update or delete on public.attendance_days
  for each row execute function private.audit();

alter table public.attendance_days enable row level security;

create policy "read attendance" on public.attendance_days for select to authenticated using (
  (select private.is_admin())
  or employee_id = (select private.my_employee_id())
  or private.is_my_team(employee_id)
);
create policy "admin write attendance" on public.attendance_days for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ตั้งกะประจำและวันหยุดประจำสัปดาห์: CEO/บัญชีได้ทุกคน ผู้จัดการได้เฉพาะลูกทีม
create or replace function public.set_employee_schedule(emp uuid, shift uuid, off smallint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_admin() or private.is_my_team(emp)) then
    raise exception 'ไม่มีสิทธิ์ตั้งกะของพนักงานคนนี้';
  end if;
  if exists (select 1 from unnest(off) d where d < 0 or d > 6) then
    raise exception 'วันหยุดไม่ถูกต้อง';
  end if;
  update public.employees set default_shift_id = shift, days_off = coalesce(off, '{}') where id = emp;
end $$;
revoke execute on function public.set_employee_schedule(uuid, uuid, smallint[]) from public, anon;
grant execute on function public.set_employee_schedule(uuid, uuid, smallint[]) to authenticated;

-- วันที่มีข้อมูลเวลาเข้าระบบแล้ว (ของใครก็ได้) ใช้แยก "ขาดงาน" ออกจาก "ยังไม่ได้นำเข้าข้อมูล"
-- คืนเฉพาะวันที่ ไม่เปิดเผยข้อมูลของคนอื่น
create or replace function public.attendance_loaded_dates(from_date date, to_date date)
returns setof date language sql stable security definer set search_path = '' as $$
  select distinct work_date from public.attendance_days where work_date between from_date and to_date
$$;
revoke execute on function public.attendance_loaded_dates(date, date) from public, anon;
grant execute on function public.attendance_loaded_dates(date, date) to authenticated;

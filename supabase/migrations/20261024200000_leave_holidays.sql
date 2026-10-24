-- ระบบลา (ใบลา สิทธิ์การลา วันลาคงเหลือ) และวันหยุดประจำปีแยกตามตำแหน่ง / รายคน
-- ต้องรันหลัง positions (20261024191000) เพราะเพิ่มคอลัมน์ให้ตาราง positions

-- ===================== ชุดวันหยุดประจำปี =====================
-- แต่ละตำแหน่งเลือกชุดวันหยุดได้ พนักงานรายคนเลือกชุดอื่นทับได้ และเพิ่ม/ยกเว้นวันหยุดเป็นรายวันได้
create table public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index holiday_calendars_one_default on public.holiday_calendars (is_default) where is_default;
insert into public.holiday_calendars (name, is_default) values ('วันหยุดบริษัท (ค่าเริ่มต้น)', true);

create or replace function private.default_calendar()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.holiday_calendars where is_default limit 1
$$;

-- วันหยุดเดิมทั้งหมดย้ายเข้าชุดค่าเริ่มต้น
alter table public.holidays add column calendar_id uuid references public.holiday_calendars(id) on delete cascade;
update public.holidays set calendar_id = private.default_calendar();
alter table public.holidays alter column calendar_id set not null;
alter table public.holidays alter column calendar_id set default private.default_calendar();
alter table public.holidays drop constraint if exists holidays_holiday_date_key;
alter table public.holidays add constraint holidays_calendar_date_key unique (calendar_id, holiday_date);

alter table public.positions add column holiday_calendar_id uuid references public.holiday_calendars(id) on delete set null;
alter table public.employees add column holiday_calendar_id uuid references public.holiday_calendars(id) on delete set null;

-- เพิ่ม / ยกเว้นวันหยุดรายคน (is_holiday = false คือวันนั้นต้องมาทำงาน แม้ชุดวันหยุดจะหยุด)
create table public.employee_holiday_overrides (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  holiday_date date not null,
  is_holiday boolean not null default true,
  name text,
  created_at timestamptz not null default now(),
  unique (employee_id, holiday_date)
);

-- ชุดวันหยุดที่ใช้กับพนักงาน: ของตัวเอง > ของตำแหน่ง > ค่าเริ่มต้น
create or replace function private.calendar_of(emp uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(e.holiday_calendar_id, p.holiday_calendar_id, private.default_calendar())
  from public.employees e left join public.positions p on p.id = e.position_id
  where e.id = emp
$$;

create or replace function private.is_holiday_for(emp uuid, d date)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select o.is_holiday from public.employee_holiday_overrides o where o.employee_id = emp and o.holiday_date = d),
    exists (select 1 from public.holidays h where h.calendar_id = private.calendar_of(emp) and h.holiday_date = d)
  )
$$;

-- วันหยุดประจำปีของพนักงานแต่ละคน (ใช้สิทธิ์ของตาราง employees: เห็นเฉพาะคนที่มีสิทธิ์เห็น)
create view public.employee_holidays with (security_invoker = true) as
  select e.id as employee_id, h.holiday_date, h.name
  from public.employees e
  join public.holidays h on h.calendar_id = private.calendar_of(e.id)
  where not exists (select 1 from public.employee_holiday_overrides o
                    where o.employee_id = e.id and o.holiday_date = h.holiday_date and not o.is_holiday)
  union
  select o.employee_id, o.holiday_date, coalesce(o.name, 'วันหยุดเฉพาะบุคคล')
  from public.employee_holiday_overrides o
  join public.employees e on e.id = o.employee_id
  where o.is_holiday;

-- ===================== ประเภทการลาและสิทธิ์ =====================
-- ค่าเริ่มต้นตาม พ.ร.บ.คุ้มครองแรงงาน ฝ่ายบัญชี/HR ควรตรวจและแก้ได้ที่หน้าตั้งค่าการลา
create table public.leave_types (
  code text primary key,
  name text not null,
  max_days numeric(5,1),                       -- ลาได้สูงสุดต่อปี (null = ไม่จำกัด)
  paid_days numeric(5,1) not null default 0,   -- ได้รับค่าจ้างต่อปี ส่วนที่เกินเป็นลาไม่รับค่าจ้าง
  min_service_days int not null default 0,     -- ต้องทำงานครบกี่วันจึงมีสิทธิ์
  doc_after_days numeric(5,1),                 -- ลาติดกันเกินกี่วันต้องมีเอกสาร (เช่น ใบรับรองแพทย์)
  note text,
  active boolean not null default true,
  sort int not null default 0,
  check (max_days is null or max_days >= 0),
  check (paid_days >= 0)
);
insert into public.leave_types (code, name, max_days, paid_days, min_service_days, doc_after_days, note, sort) values
  ('sick', 'ลาป่วย', null, 30, 0, 3, 'ได้ค่าจ้างไม่เกิน 30 วันทำงานต่อปี ลาตั้งแต่ 3 วันขึ้นไปขอใบรับรองแพทย์ได้', 1),
  ('personal', 'ลากิจ', null, 3, 0, null, 'ลากิจธุระอันจำเป็น ได้ค่าจ้างไม่น้อยกว่า 3 วันทำงานต่อปี', 2),
  ('annual', 'ลาพักร้อน', 6, 6, 365, null, 'ทำงานครบ 1 ปี มีสิทธิ์ไม่น้อยกว่า 6 วันทำงานต่อปี', 3),
  ('maternity', 'ลาคลอด', 120, 60, 0, null, 'ลาได้ 120 วัน (นับวันหยุดด้วย) บริษัทจ่าย 60 วัน ส่วนที่เหลือเบิกประกันสังคม', 4),
  ('paternity', 'ลาช่วยภริยาคลอด', 15, 15, 0, null, 'ลาไปช่วยภริยาเลี้ยงดูบุตร 15 วันทำงาน', 5),
  ('military', 'ลารับราชการทหาร', 60, 60, 0, null, 'ฝึกหรือตรวจสอบพล ได้ค่าจ้างไม่เกิน 60 วันต่อปี', 6),
  ('unpaid', 'ลาไม่รับค่าจ้าง', null, 0, 0, null, 'หักเงินเดือนตามจำนวนวันที่ลา', 7);

-- สิทธิ์รายคน (ทับค่าของประเภทการลา เช่น อายุงานมากได้พักร้อนเพิ่ม)
create table public.leave_entitlements (
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null references public.leave_types(code) on delete cascade,
  max_days numeric(5,1),
  paid_days numeric(5,1) not null,
  updated_at timestamptz not null default now(),
  primary key (employee_id, leave_type),
  check (max_days is null or max_days >= 0),
  check (paid_days >= 0)
);

-- ===================== ใบลา =====================
create type public.leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null references public.leave_types(code),
  start_date date not null,
  end_date date not null,
  half_day text check (half_day in ('am', 'pm')),   -- ลาครึ่งวัน (เฉพาะลาวันเดียว)
  days numeric(5,1) not null default 0,              -- จำนวนวันลา (ระบบคำนวณ ไม่นับวันหยุด)
  unpaid_days numeric(5,1) not null default 0,       -- ส่วนที่ไม่ได้รับค่าจ้าง (คำนวณตอนอนุมัติ)
  reason text not null,
  status public.leave_status not null default 'pending',
  requested_by uuid references auth.users(id) default auth.uid(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (extract(year from start_date) = extract(year from end_date)),
  check (half_day is null or start_date = end_date)
);
create index on public.leave_requests (employee_id, start_date);
create index on public.leave_requests (status);

-- สิทธิ์ของพนักงานต่อประเภทการลา (รวมสิทธิ์รายคน)
create or replace function private.leave_quota(emp uuid, lt text, out max_days numeric, out paid_days numeric)
language sql stable security definer set search_path = '' as $$
  select coalesce(en.max_days, case when en.employee_id is null then t.max_days end),
         coalesce(en.paid_days, t.paid_days)
  from public.leave_types t
  left join public.leave_entitlements en on en.leave_type = t.code and en.employee_id = emp
  where t.code = lt
$$;

-- วันที่นับเป็นวันลา: ไม่นับวันหยุดประจำปีและวันหยุดประจำสัปดาห์ของพนักงาน
-- ยกเว้นลาคลอดที่กฎหมายให้นับวันหยุดรวมด้วย
create or replace function private.leave_dates(emp uuid, lt text, d1 date, d2 date)
returns setof date language plpgsql stable security definer set search_path = '' as $$
declare offs int[];
begin
  -- วันหยุดประจำสัปดาห์ (employees.days_off: 0 = อาทิตย์) ถ้ายังไม่มีคอลัมน์นี้ถือว่าไม่มี
  select coalesce(array(select jsonb_array_elements_text(to_jsonb(e)->'days_off')::int), '{}')
    into offs from public.employees e where e.id = emp;
  return query
    select g::date from generate_series(d1, d2, interval '1 day') g
    where lt = 'maternity'
       or (not private.is_holiday_for(emp, g::date) and not (extract(dow from g)::int = any(coalesce(offs, '{}'))));
end $$;

-- ตรวจใบลาก่อนบันทึก: คำนวณวัน ตรวจสิทธิ์ ตรวจวันซ้ำ
create or replace function private.leave_before_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  t public.leave_types;
  q record;
  emp_start date;
  used numeric;
begin
  select * into t from public.leave_types where code = new.leave_type;
  if not found or not t.active then raise exception 'ประเภทการลาไม่ถูกต้อง'; end if;

  select count(*) * case when new.half_day is null then 1 else 0.5 end into new.days
    from private.leave_dates(new.employee_id, new.leave_type, new.start_date, new.end_date);
  if new.days <= 0 then raise exception 'วันที่เลือกเป็นวันหยุดทั้งหมด ไม่ต้องยื่นใบลา'; end if;

  select start_date into emp_start from public.employees where id = new.employee_id;
  if t.min_service_days > 0 and new.start_date - emp_start < t.min_service_days then
    raise exception '% ใช้ได้เมื่อทำงานครบ % วัน (ครบวันที่ %)', t.name, t.min_service_days, to_char(emp_start + t.min_service_days, 'DD/MM/YYYY');
  end if;

  if exists (select 1 from public.leave_requests r
             where r.employee_id = new.employee_id and r.status in ('pending', 'approved')
               and r.start_date <= new.end_date and r.end_date >= new.start_date
               and (r.half_day is null or new.half_day is null or r.half_day = new.half_day)) then
    raise exception 'มีใบลาในช่วงวันที่นี้อยู่แล้ว';
  end if;

  select * into q from private.leave_quota(new.employee_id, new.leave_type);
  if q.max_days is not null then
    select coalesce(sum(days), 0) into used from public.leave_requests
      where employee_id = new.employee_id and leave_type = new.leave_type and status in ('pending', 'approved')
        and extract(year from start_date) = extract(year from new.start_date);
    if used + new.days > q.max_days then
      raise exception '% เหลือ % วัน แต่ขอลา % วัน', t.name, greatest(q.max_days - used, 0), new.days;
    end if;
  end if;
  new.unpaid_days := 0;
  return new;
end $$;
create trigger leave_before_insert before insert on public.leave_requests
  for each row execute function private.leave_before_insert();

create trigger audit_leave after insert or update or delete on public.leave_requests for each row execute function private.audit();
create trigger audit_leave_types after insert or update or delete on public.leave_types for each row execute function private.audit();
create trigger audit_leave_entitlements after insert or update or delete on public.leave_entitlements for each row execute function private.audit();

-- วันลาที่อนุมัติแล้ว 1 แถวต่อวัน (ใช้ร่วมกับหน้าเวลาเข้าออกและเงินเดือน)
-- ส่วนที่ไม่ได้รับค่าจ้างนับจากวันท้าย ๆ ของใบลา; paid = วันนั้นได้ค่าจ้างเต็ม
create view public.approved_leave_days with (security_invoker = true) as
  select r.id as request_id, r.employee_id, d.leave_date, r.leave_type, t.name as leave_name,
         d.portion,
         greatest(0, least(d.portion, r.unpaid_days - (d.k - 1)))::numeric(3,1) as unpaid_portion,
         greatest(0, least(d.portion, r.unpaid_days - (d.k - 1))) = 0 as paid,
         r.half_day
  from public.leave_requests r
  join public.leave_types t on t.code = r.leave_type
  cross join lateral (
    select x as leave_date,
           (case when r.half_day is null then 1 else 0.5 end)::numeric as portion,
           row_number() over (order by x desc) as k
    from private.leave_dates(r.employee_id, r.leave_type, r.start_date, r.end_date) x
  ) d
  where r.status = 'approved';

-- ===================== สิทธิ์ (RLS) =====================
alter table public.holiday_calendars enable row level security;
alter table public.employee_holiday_overrides enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.leave_requests enable row level security;

create policy "read calendars" on public.holiday_calendars for select to authenticated using (true);
create policy "admin write calendars" on public.holiday_calendars for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read holiday overrides" on public.employee_holiday_overrides for select to authenticated using (
  (select private.is_admin()) or employee_id = (select private.my_employee_id()) or private.is_my_team(employee_id)
);
create policy "admin write holiday overrides" on public.employee_holiday_overrides for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read leave types" on public.leave_types for select to authenticated using (true);
create policy "admin write leave types" on public.leave_types for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read entitlements" on public.leave_entitlements for select to authenticated using (
  (select private.is_admin()) or employee_id = (select private.my_employee_id()) or private.is_my_team(employee_id)
);
create policy "write entitlements" on public.leave_entitlements for all to authenticated
  using (private.can_edit_pay_of(employee_id)) with check (private.can_edit_pay_of(employee_id));

create policy "read leave" on public.leave_requests for select to authenticated using (
  (select private.is_admin()) or employee_id = (select private.my_employee_id()) or private.is_my_team(employee_id)
);
-- ยื่นให้ตัวเอง; ผู้จัดการยื่นแทนทีม; CEO/บัญชียื่นแทนทุกคน (เช่น พนักงานโทรมาลาป่วย)
create policy "insert leave" on public.leave_requests for insert to authenticated with check (
  status = 'pending' and decided_by is null and requested_by = (select auth.uid())
  and (
    employee_id = (select private.my_employee_id())
    or private.is_my_team(employee_id)
    or (select private.is_admin())
  )
);

-- ===================== ฟังก์ชันอนุมัติ / ยกเลิก =====================
-- ผู้จัดการอนุมัติของทีม (ไม่รวมตัวเอง) CEO อนุมัติได้ทุกคน
create or replace function public.decide_leave(request_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests; q record; used_paid numeric; paid numeric;
begin
  select * into r from public.leave_requests where id = request_id for update;
  if not found then raise exception 'ไม่พบใบลา'; end if;
  if r.status <> 'pending' then raise exception 'ใบลานี้ไม่อยู่ในสถานะรออนุมัติ'; end if;
  if r.employee_id = private.my_employee_id() then raise exception 'อนุมัติใบลาของตัวเองไม่ได้'; end if;
  if not (private.my_role() = 'ceo' or private.is_my_team(r.employee_id)) then
    raise exception 'ไม่มีสิทธิ์อนุมัติใบลานี้';
  end if;

  if approve then
    select * into q from private.leave_quota(r.employee_id, r.leave_type);
    select coalesce(sum(days - unpaid_days), 0) into used_paid from public.leave_requests
      where employee_id = r.employee_id and leave_type = r.leave_type and status = 'approved'
        and extract(year from start_date) = extract(year from r.start_date);
    paid := least(r.days, greatest(0, coalesce(q.paid_days, 0) - used_paid));
    update public.leave_requests
      set status = 'approved', unpaid_days = r.days - paid,
          decided_by = auth.uid(), decided_at = now(), decision_note = note
      where id = request_id;
  else
    update public.leave_requests
      set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = note
      where id = request_id;
  end if;
end $$;

-- ยกเลิก: เจ้าของ/ผู้ยื่นแทน ขณะรออนุมัติ; ผู้อนุมัติ (CEO / หัวหน้าทีม) ยกเลิกใบที่อนุมัติแล้วได้
create or replace function public.cancel_leave(request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.leave_requests;
begin
  select * into r from public.leave_requests where id = request_id for update;
  if not found then raise exception 'ไม่พบใบลา'; end if;
  if r.status = 'pending' and (r.employee_id = private.my_employee_id() or r.requested_by = auth.uid()) then
    null;
  elsif r.status = 'approved' and r.employee_id is distinct from private.my_employee_id()
        and (private.my_role() = 'ceo' or private.is_my_team(r.employee_id)) then
    null;
  else
    raise exception 'ยกเลิกใบลานี้ไม่ได้';
  end if;
  update public.leave_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = request_id;
end $$;

grant execute on all functions in schema private to authenticated;
revoke execute on function private.leave_before_insert() from public, anon, authenticated;
revoke execute on function public.decide_leave(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_leave(uuid) from public, anon;
grant execute on function public.decide_leave(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_leave(uuid) to authenticated;
grant select on public.employee_holidays, public.approved_leave_days to authenticated;

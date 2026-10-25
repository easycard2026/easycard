-- รองรับหลายบริษัท (บริษัทในเครือของเจ้าของเดียว)
--
-- หลักการ
-- 1. ข้อมูลทุกตารางมี company_id บอกว่าเป็นของบริษัทไหน
-- 2. ผู้ใช้ 1 คนอยู่ได้หลายบริษัท มี Role และข้อมูลพนักงานแยกต่อบริษัท (company_members)
-- 3. profiles เก็บ "บริษัทที่กำลังเปิดดูอยู่" (active_company_id) และ Role / employee_id ของบริษัทนั้น
--    ฟังก์ชันสิทธิ์เดิม (my_role, my_employee_id, is_admin, is_my_team) จึงใช้ต่อได้โดยไม่ต้องแก้
-- 4. นโยบายแบบ restrictive "เฉพาะบริษัทที่เปิดอยู่" ซ้อนบนนโยบายเดิมทุกตาราง (ต้องผ่านทั้งสองชั้น)
-- 5. trigger set_company เติม company_id ให้อัตโนมัติ กันข้อมูลอ้างข้ามบริษัท
--    และกันการเขียนข้อมูลบริษัทอื่นผ่านฟังก์ชัน security definer
-- ข้อมูลเดิมทั้งหมดย้ายเข้า "บริษัทแรก" ที่สร้างในไฟล์นี้

-- ===================== บริษัทและสมาชิก =====================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  tax_id text check (tax_id is null or tax_id ~ '^\d{13}$'),   -- เลขประจำตัวผู้เสียภาษี 13 หลัก
  branch text,                                                   -- สำนักงานใหญ่ / สาขาที่
  address text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'employee',
  employee_id uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, user_id),
  unique (company_id, employee_id)
);
create index on public.company_members (user_id);
create index on public.company_members (employee_id);

alter table public.profiles add column active_company_id uuid references public.companies(id) on delete set null;

-- บริษัทแรก: ใช้ชื่อจากหน้าตั้งค่าบัญชีโอนเงินเดือนถ้ามี
insert into public.companies (name, created_by)
select coalesce(nullif(btrim((select company_name from public.payroll_bank_settings limit 1)), ''), 'บริษัทหลัก'), null;

-- ===================== ตัวช่วย =====================
create or replace function private.my_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select active_company_id from public.profiles where id = (select auth.uid())
$$;

-- บริษัทแรก ใช้เป็นค่าเริ่มต้นตอนไม่มีผู้ใช้ล็อกอิน (เช่น สร้างผู้ใช้ผ่าน service role)
create or replace function private.default_company_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.companies order by created_at, id limit 1
$$;

create or replace function private.is_member(cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.company_members where company_id = cid and user_id = (select auth.uid()))
$$;

-- ผู้ใช้คนนี้อยู่ในบริษัทที่ฉันเปิดอยู่ไหม
create or replace function private.in_my_company(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.company_members
    where user_id = uid and company_id = (select active_company_id from public.profiles where id = (select auth.uid()))
  )
$$;

-- เติม company_id และตรวจว่าข้อมูลอยู่บริษัทเดียวกันทั้งหมด
-- อาร์กิวเมนต์ของ trigger: 'คอลัมน์:ตารางที่อ้างถึง' เช่น 'employee_id:employees'
-- คอลัมน์แรกที่มีค่าใช้กำหนดบริษัทให้แถวใหม่ ถ้าไม่มีเลยใช้บริษัทที่ผู้ใช้เปิดอยู่
create or replace function private.set_company()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j jsonb;
  i int;
  col text;
  tbl text;
  ref_id uuid;
  ref_co uuid;
  mine uuid := private.my_company_id();
  acting boolean := (select auth.uid()) is not null;
begin
  if tg_op = 'DELETE' then
    if acting and old.company_id is distinct from mine then
      raise exception 'ไม่พบข้อมูลในบริษัทที่เปิดอยู่';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id then
      raise exception 'ย้ายข้อมูลข้ามบริษัทไม่ได้';
    end if;
    if acting and old.company_id is distinct from mine then
      raise exception 'ไม่พบข้อมูลในบริษัทที่เปิดอยู่';
    end if;
  end if;

  j := to_jsonb(new);
  for i in 0 .. tg_nargs - 1 loop
    col := split_part(tg_argv[i], ':', 1);
    tbl := split_part(tg_argv[i], ':', 2);
    ref_id := (j->>col)::uuid;
    continue when ref_id is null;
    execute format('select company_id from public.%I where id = $1', tbl) into ref_co using ref_id;
    continue when ref_co is null;   -- ไม่พบแถวที่อ้างถึง ให้ foreign key แจ้งเอง
    if new.company_id is null then
      new.company_id := ref_co;
    elsif ref_co <> new.company_id then
      raise exception 'ข้อมูลที่เลือกอยู่คนละบริษัทกัน';
    end if;
  end loop;

  if new.company_id is null then
    new.company_id := coalesce(mine, case when not acting then private.default_company_id() end);
  end if;
  if new.company_id is null then
    raise exception 'ยังไม่ได้เลือกบริษัท';
  end if;
  if acting and new.company_id is distinct from mine then
    raise exception 'ไม่พบข้อมูลในบริษัทที่เปิดอยู่';
  end if;
  return new;
end $$;

-- ===================== เพิ่ม company_id ทุกตาราง =====================
do $$
declare
  t text;
  first_co uuid := private.default_company_id();
begin
  foreach t in array array[
    'departments', 'positions', 'employees', 'shifts', 'shift_assignments', 'holidays',
    'payroll_settings', 'payroll_bank_settings', 'ot_requests', 'salary_history',
    'recurring_allowances', 'tax_profiles', 'payroll_periods', 'payslips', 'payslip_items',
    'attendance_days', 'employee_documents', 'announcements', 'shift_swaps', 'audit_log'
  ] loop
    execute format('alter table public.%I add column company_id uuid references public.companies(id)', t);
    execute format('update public.%I set company_id = $1', t) using first_co;
    execute format('create index on public.%I (company_id)', t);
    if t <> 'audit_log' then
      execute format('alter table public.%I alter column company_id set not null', t);
    end if;
  end loop;
end $$;

-- ประวัติการแก้ไขบันทึกบริษัทที่ผู้แก้เปิดอยู่
alter table public.audit_log alter column company_id set default private.my_company_id();

-- เดิมห้ามซ้ำทั้งระบบ → ห้ามซ้ำภายในบริษัทเดียวกัน
alter table public.departments drop constraint departments_name_key, add unique (company_id, name);
alter table public.positions drop constraint positions_name_key, add unique (company_id, name);
alter table public.employees drop constraint employees_code_key, add unique (company_id, code);
alter table public.employees drop constraint employees_device_code_key, add unique (company_id, device_code);
alter table public.shifts drop constraint shifts_name_key, add unique (company_id, name);
alter table public.holidays drop constraint holidays_holiday_date_key, add unique (company_id, holiday_date);
alter table public.payroll_periods drop constraint payroll_periods_year_month_key, add unique (company_id, year, month);

-- ค่าตั้งค่าเงินเดือน / บัญชีโอนเงิน: เดิมมีแถวเดียว → หนึ่งแถวต่อบริษัท
-- คอลัมน์ id (= true) ยังอยู่ โค้ดเดิมที่ .eq("id", true) จึงใช้ได้ และเห็นเฉพาะแถวของบริษัทตัวเอง
alter table public.payroll_settings drop constraint payroll_settings_pkey, add primary key (company_id);
alter table public.payroll_bank_settings drop constraint payroll_bank_settings_pkey, add primary key (company_id);

-- ===================== trigger เติม/ตรวจบริษัท =====================
create trigger set_company before insert or update or delete on public.departments
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.positions
  for each row execute function private.set_company('department_id:departments');
create trigger set_company before insert or update or delete on public.employees
  for each row execute function private.set_company('department_id:departments', 'position_id:positions',
    'manager_id:employees', 'default_shift_id:shifts');
create trigger set_company before insert or update or delete on public.shifts
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.shift_assignments
  for each row execute function private.set_company('employee_id:employees', 'shift_id:shifts');
create trigger set_company before insert or update or delete on public.holidays
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.payroll_settings
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.payroll_bank_settings
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.ot_requests
  for each row execute function private.set_company('employee_id:employees');
create trigger set_company before insert or update or delete on public.salary_history
  for each row execute function private.set_company('employee_id:employees');
create trigger set_company before insert or update or delete on public.recurring_allowances
  for each row execute function private.set_company('employee_id:employees');
create trigger set_company before insert or update or delete on public.tax_profiles
  for each row execute function private.set_company('employee_id:employees');
create trigger set_company before insert or update or delete on public.payroll_periods
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.payslips
  for each row execute function private.set_company('period_id:payroll_periods', 'employee_id:employees');
create trigger set_company before insert or update or delete on public.payslip_items
  for each row execute function private.set_company('payslip_id:payslips');
create trigger set_company before insert or update or delete on public.attendance_days
  for each row execute function private.set_company('employee_id:employees');
create trigger set_company before insert or update or delete on public.employee_documents
  for each row execute function private.set_company('employee_id:employees');
create trigger set_company before insert or update or delete on public.announcements
  for each row execute function private.set_company();
create trigger set_company before insert or update or delete on public.shift_swaps
  for each row execute function private.set_company('requester_id:employees', 'target_id:employees',
    'requester_shift_id:shifts', 'target_shift_id:shifts');

-- ===================== สิทธิ์: เห็นเฉพาะบริษัทที่เปิดอยู่ =====================
do $$
declare t text;
begin
  foreach t in array array[
    'departments', 'positions', 'employees', 'shifts', 'shift_assignments', 'holidays',
    'payroll_settings', 'payroll_bank_settings', 'ot_requests', 'salary_history',
    'recurring_allowances', 'tax_profiles', 'payroll_periods', 'payslips', 'payslip_items',
    'attendance_days', 'employee_documents', 'announcements', 'shift_swaps', 'audit_log'
  ] loop
    execute format(
      'create policy "only active company" on public.%I as restrictive for all to authenticated
         using (company_id = (select private.my_company_id()))
         with check (company_id = (select private.my_company_id()))', t);
  end loop;
end $$;

-- profiles: เห็นตัวเอง และคนที่อยู่บริษัทเดียวกับที่ฉันเปิดอยู่
create policy "same company profiles" on public.profiles as restrictive for all to authenticated
  using (id = (select auth.uid()) or private.in_my_company(id))
  with check (id = (select auth.uid()) or private.in_my_company(id));

alter table public.companies enable row level security;
alter table public.company_members enable row level security;

create policy "read my companies" on public.companies for select to authenticated
  using (private.is_member(id));
create policy "ceo update company" on public.companies for update to authenticated
  using (id = (select private.my_company_id()) and (select private.my_role()) = 'ceo')
  with check (id = (select private.my_company_id()) and (select private.my_role()) = 'ceo');

create policy "read members" on public.company_members for select to authenticated using (
  user_id = (select auth.uid())
  or (company_id = (select private.my_company_id()) and (select private.is_admin()))
);
-- เพิ่ม / ลบ / เปลี่ยน Role ผ่านฟังก์ชันด้านล่างหรือผ่าน profiles เท่านั้น

-- ===================== ซิงก์ profiles ↔ company_members =====================
-- profiles.role / employee_id = ค่าของบริษัทที่เปิดอยู่
-- - ผู้ใช้สลับบริษัท: ต้องเป็นสมาชิก แล้วดึง Role ของบริษัทนั้นมาใส่
-- - CEO แก้ Role / ผูกพนักงานให้คนอื่น: บันทึกลงบริษัทที่ CEO เปิดอยู่
--   ถ้าคนนั้นกำลังเปิดบริษัทอื่น profiles ของเขาไม่เปลี่ยน (เห็นผลเมื่อสลับมา)
create or replace function private.sync_profile_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me uuid := case when current_setting('app.system_sync', true) = 'on' then null else (select auth.uid()) end;
  cid uuid;
  m public.company_members;
begin
  if tg_op = 'UPDATE' and me is not null and new.id <> me then
    new.active_company_id := old.active_company_id;   -- เปลี่ยนบริษัทให้คนอื่นไม่ได้
    cid := private.my_company_id();
    if (new.role, new.employee_id) is distinct from (old.role, old.employee_id) then
      if new.employee_id is distinct from old.employee_id and new.employee_id is not null
         and not exists (select 1 from public.employees where id = new.employee_id and company_id = cid) then
        raise exception 'พนักงานที่เลือกอยู่คนละบริษัท';
      end if;
      insert into public.company_members (company_id, user_id, role, employee_id)
        values (cid, new.id, new.role, new.employee_id)
        on conflict (company_id, user_id) do update set role = excluded.role, employee_id = excluded.employee_id;
      if old.active_company_id is distinct from cid then
        new.role := old.role;
        new.employee_id := old.employee_id;
      end if;
    end if;
    return new;
  end if;

  -- ผู้ใช้แก้ของตัวเอง หรือระบบ (ไม่มีผู้ล็อกอิน)
  if tg_op = 'UPDATE' and new.active_company_id is distinct from old.active_company_id then
    if new.active_company_id is null then
      new.role := 'employee';
      new.employee_id := null;
      return new;
    end if;
    select * into m from public.company_members where company_id = new.active_company_id and user_id = new.id;
    if not found then
      if me is not null then raise exception 'คุณไม่ได้อยู่ในบริษัทนี้'; end if;
      insert into public.company_members (company_id, user_id, role, employee_id)
        values (new.active_company_id, new.id, new.role, new.employee_id);
    else
      new.role := m.role;
      new.employee_id := m.employee_id;
    end if;
    return new;
  end if;

  if new.active_company_id is not null and (tg_op = 'INSERT'
     or (new.role, new.employee_id) is distinct from (old.role, old.employee_id)) then
    if new.employee_id is not null
       and not exists (select 1 from public.employees where id = new.employee_id and company_id = new.active_company_id) then
      raise exception 'พนักงานที่เลือกอยู่คนละบริษัท';
    end if;
    insert into public.company_members (company_id, user_id, role, employee_id)
      values (new.active_company_id, new.id, new.role, new.employee_id)
      on conflict (company_id, user_id) do update set role = excluded.role, employee_id = excluded.employee_id;
  end if;
  return new;
end $$;

-- ข้อมูลเดิม: ทุกคนเป็นสมาชิกบริษัทแรกด้วย Role เดิม
insert into public.company_members (company_id, user_id, role, employee_id)
select private.default_company_id(), id, role, employee_id from public.profiles;
update public.profiles set active_company_id = private.default_company_id();

create trigger sync_membership before insert or update on public.profiles
  for each row execute function private.sync_profile_membership();

-- ผู้ใช้ใหม่: เข้าบริษัทที่ระบุใน metadata (company_id) ถ้าไม่ระบุเข้าบริษัทแรก
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  begin
    cid := nullif(new.raw_user_meta_data->>'company_id', '')::uuid;
  exception when others then cid := null;
  end;
  if cid is null or not exists (select 1 from public.companies where id = cid) then
    cid := private.default_company_id();
  end if;
  insert into public.profiles (id, display_name, active_company_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), cid);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ===================== ฟังก์ชันสำหรับหน้าจอ =====================
-- สลับบริษัทที่เปิดดู
create or replace function public.switch_company(cid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(cid) then raise exception 'คุณไม่ได้อยู่ในบริษัทนี้'; end if;
  update public.profiles set active_company_id = cid where id = (select auth.uid());
end $$;

-- สร้างบริษัทใหม่ในเครือ (เฉพาะ CEO) ผู้สร้างเป็น CEO ของบริษัทใหม่และสลับไปบริษัทนั้นทันที
-- คัดลอกค่าตั้งค่าเงินเดือนและวันหยุดที่ยังไม่ถึงจากบริษัทที่เปิดอยู่
create or replace function public.create_company(company_name text, company_tax_id text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  src uuid := private.my_company_id();
  new_id uuid;
  s public.payroll_settings;
begin
  if me is null or private.my_role() <> 'ceo' then raise exception 'เฉพาะ CEO สร้างบริษัทได้'; end if;
  if coalesce(btrim(company_name), '') = '' then raise exception 'กรุณาใส่ชื่อบริษัท'; end if;

  insert into public.companies (name, tax_id) values (btrim(company_name), nullif(btrim(company_tax_id), ''))
    returning id into new_id;
  insert into public.company_members (company_id, user_id, role) values (new_id, me, 'ceo');
  update public.profiles set active_company_id = new_id where id = me;

  select * into s from public.payroll_settings where company_id = src;
  if found then
    s.company_id := new_id;
    s.updated_at := now();
    insert into public.payroll_settings select (s).*;
  else
    insert into public.payroll_settings (company_id) values (new_id);
  end if;
  insert into public.payroll_bank_settings (company_id, company_name) values (new_id, btrim(company_name));
  insert into public.holidays (company_id, holiday_date, name)
    select new_id, holiday_date, name from public.holidays
    where company_id = src and holiday_date >= (now() at time zone 'Asia/Bangkok')::date;
  return new_id;
end $$;

-- เพิ่มผู้ใช้ที่มีบัญชีอยู่แล้วเข้าบริษัทที่เปิดอยู่ (เฉพาะ CEO)
create or replace function public.add_company_member(member_email text, member_role public.app_role default 'employee')
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid; cid uuid := private.my_company_id();
begin
  if private.my_role() <> 'ceo' then raise exception 'เฉพาะ CEO เพิ่มผู้ใช้เข้าบริษัทได้'; end if;
  select id into uid from auth.users where lower(email) = lower(btrim(member_email));
  if uid is null then raise exception 'ไม่พบผู้ใช้อีเมลนี้'; end if;
  insert into public.company_members (company_id, user_id, role) values (cid, uid, member_role)
    on conflict (company_id, user_id) do nothing;
  return uid;
end $$;

-- เอาผู้ใช้ออกจากบริษัทที่เปิดอยู่ (เฉพาะ CEO ลบตัวเองไม่ได้)
create or replace function public.remove_company_member(member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare cid uuid := private.my_company_id(); next_co uuid;
begin
  if private.my_role() <> 'ceo' then raise exception 'เฉพาะ CEO เอาผู้ใช้ออกได้'; end if;
  if member = (select auth.uid()) then raise exception 'เอาตัวเองออกจากบริษัทไม่ได้'; end if;
  delete from public.company_members where company_id = cid and user_id = member;
  -- ถ้าเขากำลังเปิดบริษัทนี้อยู่ ย้ายไปบริษัทอื่นที่เขาอยู่ (ถ้ามี)
  if exists (select 1 from public.profiles where id = member and active_company_id = cid) then
    select company_id into next_co from public.company_members where user_id = member order by created_at limit 1;
    perform set_config('app.system_sync', 'on', true);   -- ทำในนามระบบ
    update public.profiles set active_company_id = next_co where id = member;
    perform set_config('app.system_sync', 'off', true);
  end if;
end $$;

revoke execute on function public.switch_company(uuid) from public, anon;
revoke execute on function public.create_company(text, text) from public, anon;
revoke execute on function public.add_company_member(text, public.app_role) from public, anon;
revoke execute on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.switch_company(uuid) to authenticated;
grant execute on function public.create_company(text, text) to authenticated;
grant execute on function public.add_company_member(text, public.app_role) to authenticated;
grant execute on function public.remove_company_member(uuid) to authenticated;

-- ===================== ฟังก์ชันเดิมที่อ่านข้ามสิทธิ์ ต้องจำกัดบริษัท =====================
-- เอกสารพนักงาน: ต้องเป็นพนักงานของบริษัทที่เปิดอยู่
create or replace function private.can_view_employee(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select emp is not null
    and exists (select 1 from public.employees where id = emp and company_id = private.my_company_id())
    and (private.is_admin() or emp = private.my_employee_id() or private.is_my_team(emp))
$$;
create or replace function private.can_upload_employee_doc(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select emp is not null
    and exists (select 1 from public.employees where id = emp and company_id = private.my_company_id())
    and (private.is_admin() or emp = private.my_employee_id())
$$;
drop policy "employee docs: delete" on storage.objects;
create policy "employee docs: delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and private.can_view_employee(private.doc_folder_employee(name))
    and (
      (select private.is_admin())
      or (private.doc_folder_employee(name) = (select private.my_employee_id()) and owner_id = (select auth.uid())::text)
    )
  );

-- รูปประกาศ: อ่านได้เฉพาะรูปของประกาศในบริษัทที่เปิดอยู่ (ตาราง announcements ถูกจำกัดบริษัทด้วย RLS แล้ว)
drop policy "announcement images: read" on storage.objects;
create policy "announcement images: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'announcement-images'
    and (
      exists (select 1 from public.announcements a where storage.objects.name = any (a.image_paths))
      or ((select private.is_admin()) and owner_id = (select auth.uid())::text)   -- รูปที่เพิ่งอัปโหลดก่อนบันทึก
    )
  );

-- วันที่มีข้อมูลเวลาเข้าแล้ว: เฉพาะบริษัทที่เปิดอยู่
create or replace function public.attendance_loaded_dates(from_date date, to_date date)
returns setof date language sql stable security definer set search_path = '' as $$
  select distinct work_date from public.attendance_days
  where work_date between from_date and to_date and company_id = private.my_company_id()
$$;

-- กะของพนักงานในวันหนึ่ง: วันหยุดบริษัทใช้ของบริษัทพนักงานคนนั้น
create or replace function private.base_shift_on(emp uuid, d date)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid;
  e record;
  is_holiday boolean;
begin
  select shift_id into sid from public.shift_assignments where employee_id = emp and work_date = d;
  if found then return sid; end if;
  select default_shift_id, days_off, company_id into e from public.employees where id = emp;
  -- ใช้ปฏิทินวันหยุดรายคนของระบบลาถ้ามี ไม่งั้นใช้วันหยุดบริษัท
  if to_regprocedure('private.is_holiday_for(uuid, date)') is not null then
    execute 'select private.is_holiday_for($1, $2)' into is_holiday using emp, d;
  else
    select exists (select 1 from public.holidays where holiday_date = d and company_id = e.company_id) into is_holiday;
  end if;
  if coalesce(is_holiday, false) then return null; end if;
  if extract(dow from d)::smallint = any (e.days_off) then return null; end if;
  return e.default_shift_id;
end $$;
revoke execute on function private.base_shift_on(uuid, date) from public, anon, authenticated;

-- เพื่อนที่ขอแลกกะได้: เฉพาะบริษัทที่เปิดอยู่
create or replace function public.swap_candidates(d date)
returns table (id uuid, code text, first_name text, last_name text, shift_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.id, e.code, e.first_name, e.last_name, private.base_shift_on(e.id, d)
  from public.employees e
  where e.active and e.id <> private.my_employee_id() and private.my_employee_id() is not null
    and e.company_id = private.my_company_id()
  order by e.code
$$;

grant execute on function private.my_company_id() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.in_my_company(uuid) to authenticated;
grant execute on function private.can_view_employee(uuid) to authenticated;
grant execute on function private.can_upload_employee_doc(uuid) to authenticated;
revoke execute on function private.default_company_id() from public, anon, authenticated;
revoke execute on function private.set_company() from public, anon, authenticated;
revoke execute on function private.sync_profile_membership() from public, anon, authenticated;

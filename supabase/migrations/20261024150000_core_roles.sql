-- ส่วนที่ 1: ผู้ใช้ 4 Role, แผนก, พนักงาน, กะ, วันหยุด พร้อมสิทธิ์ระดับแถว (RLS)

create type public.app_role as enum ('ceo', 'accounting', 'manager', 'employee');
create type public.probation_status as enum ('on_probation', 'passed', 'failed', 'extended');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- รหัสพนักงาน
  device_code text unique,                   -- รหัสในเครื่องสแกน
  first_name text not null,
  last_name text not null,
  national_id text,
  department_id uuid references public.departments(id),
  manager_id uuid references public.employees(id),   -- หัวหน้าที่อนุมัติ OT
  start_date date not null,
  probation_days int not null default 119,
  probation_end_date date generated always as (start_date + probation_days) stored,
  probation_status public.probation_status not null default 'on_probation',
  bank_name text,
  bank_account text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.employees (manager_id);
create index on public.employees (department_id);

-- บัญชีผู้ใช้ 1 คนต่อ 1 login
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'employee',
  employee_id uuid unique references public.employees(id),
  display_name text,
  created_at timestamptz not null default now()
);
create index on public.profiles (employee_id);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_time time not null,
  end_time time not null,
  break_minutes int not null default 60,
  crosses_midnight boolean generated always as (end_time <= start_time) stored,
  late_grace_minutes int not null default 0,
  created_at timestamptz not null default now()
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_id uuid not null references public.shifts(id),
  work_date date not null,
  unique (employee_id, work_date)
);
create index on public.shift_assignments (shift_id);

create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name text not null
);

-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่ (ค่าเริ่มต้น = พนักงาน)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ตัวช่วยสำหรับ RLS (อยู่ใน schema private ที่ API มองไม่เห็น)
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function private.my_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where id = (select auth.uid())
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = (select auth.uid())) in ('ceo', 'accounting'), false)
$$;

create or replace function private.is_my_team(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    join public.profiles p on p.employee_id = e.manager_id
    where e.id = emp and p.id = (select auth.uid()) and p.role = 'manager'
  )
$$;

grant execute on all functions in schema private to authenticated;

alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.holidays enable row level security;

-- แผนก กะ วันหยุด: ทุกคนดูได้ CEO/บัญชีแก้ได้
create policy "read departments" on public.departments for select to authenticated using (true);
create policy "admin write departments" on public.departments for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read shifts" on public.shifts for select to authenticated using (true);
create policy "admin write shifts" on public.shifts for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "read holidays" on public.holidays for select to authenticated using (true);
create policy "admin write holidays" on public.holidays for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- พนักงาน: CEO/บัญชีเห็นทุกคน ผู้จัดการเห็นทีม พนักงานเห็นตัวเอง
create policy "read employees" on public.employees for select to authenticated using (
  (select private.is_admin())
  or id = (select private.my_employee_id())
  or private.is_my_team(id)
);
create policy "admin insert employees" on public.employees for insert to authenticated
  with check ((select private.is_admin()));
create policy "admin update employees" on public.employees for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "ceo delete employees" on public.employees for delete to authenticated
  using ((select private.my_role()) = 'ceo');

-- profile: ดูของตัวเองได้ CEO/บัญชีดูทั้งหมด เฉพาะ CEO เปลี่ยน Role ได้
create policy "read profiles" on public.profiles for select to authenticated using (
  id = (select auth.uid()) or (select private.is_admin())
);
create policy "ceo update profiles" on public.profiles for update to authenticated
  using ((select private.my_role()) = 'ceo') with check ((select private.my_role()) = 'ceo');

-- ตารางกะ: CEO/บัญชีทั้งหมด ผู้จัดการจัดกะทีมตัวเอง พนักงานดูของตัวเอง
create policy "read shift assignments" on public.shift_assignments for select to authenticated using (
  (select private.is_admin())
  or employee_id = (select private.my_employee_id())
  or private.is_my_team(employee_id)
);
create policy "write shift assignments" on public.shift_assignments for all to authenticated
  using ((select private.is_admin()) or private.is_my_team(employee_id))
  with check ((select private.is_admin()) or private.is_my_team(employee_id));

revoke execute on function public.handle_new_user() from public, anon, authenticated;

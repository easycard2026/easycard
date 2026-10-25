-- KPI พนักงาน: ตั้งหัวข้อ KPI (เป้าหมาย + น้ำหนัก) ให้ทุกคน / ตามตำแหน่ง / รายคน แล้วให้คะแนนรายเดือน
create type public.kpi_direction as enum ('higher', 'lower');  -- higher = ยิ่งมากยิ่งดี, lower = ยิ่งน้อยยิ่งดี

create table public.kpi_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  unit text,                                   -- เช่น บาท, ชิ้น, %, ครั้ง
  target numeric(14,2) not null check (target >= 0),
  weight numeric(6,2) not null default 1 check (weight > 0),
  direction public.kpi_direction not null default 'higher',
  -- ใช้กับใคร: ว่างทั้งคู่ = ทุกคน, ระบุตำแหน่ง = ทุกคนในตำแหน่งนั้น, ระบุพนักงาน = คนเดียว
  position_id uuid references public.positions(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  active boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (position_id is null or employee_id is null)
);
create index on public.kpi_items (position_id);
create index on public.kpi_items (employee_id);

create table public.kpi_scores (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.kpi_items(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  period date not null check (extract(day from period) = 1),   -- วันแรกของเดือน
  target numeric(14,2) not null,               -- เก็บเป้าหมาย ณ ตอนให้คะแนน (แก้เป้าทีหลังไม่กระทบเดือนเก่า)
  actual numeric(14,2) not null,
  note text,
  scored_by uuid references auth.users(id) default auth.uid(),
  scored_at timestamptz not null default now(),
  unique (item_id, employee_id, period)
);
create index on public.kpi_scores (employee_id, period);

-- ใครให้คะแนน / ตั้ง KPI รายคนให้พนักงานคนนี้ได้: CEO ทุกคน, บัญชีทุกคนยกเว้นตัวเอง, ผู้จัดการเฉพาะลูกทีม
create or replace function private.can_manage_kpi_of(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case (select role from public.profiles where id = (select auth.uid()))
    when 'ceo' then true
    when 'accounting' then emp is distinct from (select employee_id from public.profiles where id = (select auth.uid()))
    when 'manager' then private.is_my_team(emp)
    else false end
$$;
grant execute on function private.can_manage_kpi_of(uuid) to authenticated;

create trigger audit_kpi_items after insert or update or delete on public.kpi_items for each row execute function private.audit();
create trigger audit_kpi_scores after insert or update or delete on public.kpi_scores for each row execute function private.audit();

alter table public.kpi_items enable row level security;
alter table public.kpi_scores enable row level security;

-- หัวข้อ KPI: หัวข้อกลาง/ตามตำแหน่งทุกคนดูได้ หัวข้อรายคนเห็นเฉพาะเจ้าตัว หัวหน้า และ CEO/บัญชี
create policy "read kpi items" on public.kpi_items for select to authenticated using (
  employee_id is null
  or employee_id = (select private.my_employee_id())
  or (select private.is_admin())
  or private.is_my_team(employee_id)
);
-- หัวข้อกลาง/ตามตำแหน่ง: CEO/บัญชี; หัวข้อรายคน: ตาม can_manage_kpi_of
create policy "write kpi items" on public.kpi_items for all to authenticated
  using (case when employee_id is null then (select private.is_admin()) else private.can_manage_kpi_of(employee_id) end)
  with check (case when employee_id is null then (select private.is_admin()) else private.can_manage_kpi_of(employee_id) end);

create policy "read kpi scores" on public.kpi_scores for select to authenticated using (
  (select private.is_admin())
  or employee_id = (select private.my_employee_id())
  or private.is_my_team(employee_id)
);
create policy "write kpi scores" on public.kpi_scores for all to authenticated
  using (private.can_manage_kpi_of(employee_id))
  with check (private.can_manage_kpi_of(employee_id));

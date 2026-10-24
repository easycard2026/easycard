-- ตำแหน่งงาน: CEO/บัญชีตั้งค่าและกำหนดให้พนักงาน ทุกคนดูรายชื่อตำแหน่งได้
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 100),
  department_id uuid references public.departments(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.employees add column position_id uuid references public.positions(id) on delete set null;
create index on public.employees (position_id);
create index on public.positions (department_id);

alter table public.positions enable row level security;
create policy "read positions" on public.positions for select to authenticated using (true);
create policy "admin write positions" on public.positions for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

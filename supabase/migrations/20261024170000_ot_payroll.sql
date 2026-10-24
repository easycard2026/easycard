-- ส่วนที่ 3: ขอ / อนุมัติ OT
-- ส่วนที่ 4: เงินเดือน ประกันสังคม ภาษี สลิป และประวัติการแก้ไข

-- ===================== ค่าตั้งค่าการคำนวณ (แถวเดียว) =====================
-- ตัวเลขทุกตัวแก้ได้จากหน้าตั้งค่า ฝ่ายบัญชีควรตรวจก่อนใช้จริง
create table public.payroll_settings (
  id boolean primary key default true check (id),
  days_per_month numeric not null default 30,
  hours_per_day numeric not null default 8,
  ot_rate_workday numeric not null default 1.5,       -- OT หลังเลิกงานวันทำงาน
  ot_rate_holiday_work numeric not null default 1.0,  -- ทำงานวันหยุด เวลาปกติ (เพิ่มจากเงินเดือน)
  ot_rate_holiday_ot numeric not null default 3.0,    -- OT ในวันหยุด
  ot_round_minutes int not null default 30,           -- ปัดชั่วโมง OT ลงทีละกี่นาที
  sso_rate numeric not null default 0.05,
  sso_min_base numeric not null default 1650,
  sso_max_base numeric not null default 17500,
  expense_rate numeric not null default 0.5,
  expense_cap numeric not null default 100000,
  personal_allowance numeric not null default 60000,
  spouse_allowance numeric not null default 60000,
  child_allowance numeric not null default 30000,
  parent_allowance numeric not null default 30000,
  -- ขั้นบันไดภาษี: เงินได้สุทธิถึง upto บาท เสียอัตรา rate (upto = null คือส่วนที่เกิน)
  tax_brackets jsonb not null default '[
    {"upto":150000,"rate":0},{"upto":300000,"rate":0.05},{"upto":500000,"rate":0.10},
    {"upto":750000,"rate":0.15},{"upto":1000000,"rate":0.20},{"upto":2000000,"rate":0.25},
    {"upto":5000000,"rate":0.30},{"upto":null,"rate":0.35}]'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.payroll_settings default values;

-- ===================== OT =====================
create type public.ot_type as enum ('workday', 'holiday_work', 'holiday_ot');
create type public.ot_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table public.ot_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  start_time time not null,
  end_time time not null,                    -- ถ้าน้อยกว่าเวลาเริ่ม = ข้ามเที่ยงคืน
  ot_type public.ot_type not null default 'workday',
  hours numeric(5,2) generated always as (
    round((extract(epoch from (end_time - start_time))::numeric / 3600
      + case when end_time <= start_time then 24 else 0 end), 2)
  ) stored,
  actual_hours numeric(5,2),                 -- ชั่วโมงจริงจากเวลาสแกน (เติมโดยส่วนที่ 2)
  reason text not null,
  status public.ot_status not null default 'pending',
  requested_by uuid references auth.users(id) default auth.uid(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (end_time <> start_time)
);
create index on public.ot_requests (employee_id, work_date);
create index on public.ot_requests (status);

-- ===================== เงินเดือนและค่าลดหย่อน =====================
create table public.salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  monthly_salary numeric(12,2) not null check (monthly_salary >= 0),
  effective_date date not null,
  note text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (employee_id, effective_date)
);

-- เบี้ยเลี้ยงประจำทุกเดือน เช่น ค่ากะ ค่าเดินทาง
create table public.recurring_allowances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  taxable boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.recurring_allowances (employee_id);

create table public.tax_profiles (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  spouse_no_income boolean not null default false,
  children int not null default 0 check (children >= 0),
  parents int not null default 0 check (parents between 0 and 4),
  other_deductions numeric(12,2) not null default 0,   -- ประกันชีวิต กองทุน ฯลฯ รวมต่อปี
  updated_at timestamptz not null default now()
);

-- ===================== งวดเงินเดือนและสลิป =====================
create type public.payroll_status as enum ('draft', 'reviewed', 'approved', 'closed');

create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  year int not null check (year between 2020 and 2100),
  month int not null check (month between 1 and 12),
  start_date date not null,
  end_date date not null,
  pay_date date,
  status public.payroll_status not null default 'draft',
  calculated_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (year, month),
  check (end_date >= start_date)
);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  base_salary numeric(12,2) not null default 0,   -- เงินเดือนเต็มเดือน
  salary_paid numeric(12,2) not null default 0,   -- เงินเดือนที่จ่ายงวดนี้ (คิดตามวันถ้าเริ่ม/ออกกลางเดือน)
  ot_hours numeric(6,2) not null default 0,
  ot_amount numeric(12,2) not null default 0,
  allowances numeric(12,2) not null default 0,
  other_earnings numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0,    -- หักขาด/สาย/อื่น ๆ
  gross numeric(12,2) not null default 0,
  taxable_income numeric(12,2) not null default 0,
  sso_employee numeric(12,2) not null default 0,
  sso_employer numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  net numeric(12,2) not null default 0,
  ytd_income numeric(14,2) not null default 0,    -- รวมตั้งแต่ต้นปีถึงงวดนี้
  ytd_tax numeric(14,2) not null default 0,
  ytd_sso numeric(14,2) not null default 0,
  calc_note jsonb,                                -- รายละเอียดการคำนวณภาษี ให้บัญชีตรวจ
  created_at timestamptz not null default now(),
  unique (period_id, employee_id)
);
create index on public.payslips (employee_id);

create type public.payslip_item_kind as enum ('earning', 'deduction');

create table public.payslip_items (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips(id) on delete cascade,
  kind public.payslip_item_kind not null,
  code text not null,          -- salary, ot_workday, ot_holiday_work, ot_holiday_ot, allowance, sso, tax, manual
  label text not null,
  quantity numeric(10,2),
  rate numeric(12,4),
  amount numeric(12,2) not null,
  taxable boolean not null default true,
  manual boolean not null default false,          -- บัญชีเพิ่มเอง (ไม่ถูกลบตอนคำนวณใหม่)
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.payslip_items (payslip_id);

-- ===================== ประวัติการแก้ไข =====================
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb
);
create index on public.audit_log (table_name, at desc);

create or replace function private.audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- รายการในสลิป: เก็บประวัติเฉพาะรายการที่บัญชีเพิ่มเอง (รายการคำนวณถูกสร้างใหม่ทุกครั้ง)
  if tg_table_name = 'payslip_items' and not coalesce((to_jsonb(coalesce(new, old))->>'manual')::boolean, false) then
    return coalesce(new, old);
  end if;
  insert into public.audit_log (user_id, table_name, row_id, action, old_data, new_data)
  values (
    (select auth.uid()), tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',
             (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'employee_id'),
    tg_op,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_salary after insert or update or delete on public.salary_history for each row execute function private.audit();
create trigger audit_allowances after insert or update or delete on public.recurring_allowances for each row execute function private.audit();
create trigger audit_tax_profiles after insert or update or delete on public.tax_profiles for each row execute function private.audit();
create trigger audit_ot after insert or update or delete on public.ot_requests for each row execute function private.audit();
create trigger audit_periods after insert or update or delete on public.payroll_periods for each row execute function private.audit();
create trigger audit_payslip_items after insert or update or delete on public.payslip_items for each row execute function private.audit();
create trigger audit_settings after update on public.payroll_settings for each row execute function private.audit();

-- ===================== ตัวช่วยสิทธิ์ =====================
-- งวดยังแก้ได้ไหม (ร่างเท่านั้น)
create or replace function private.period_is_draft(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select status = 'draft' from public.payroll_periods where id = pid), false)
$$;
create or replace function private.payslip_period_is_draft(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select pp.status = 'draft' from public.payslips s join public.payroll_periods pp on pp.id = s.period_id where s.id = sid), false)
$$;
-- บัญชีแก้เงินเดือน/สลิปของตัวเองไม่ได้ ต้องเป็น CEO
create or replace function private.can_edit_pay_of(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case (select role from public.profiles where id = (select auth.uid()))
    when 'ceo' then true
    when 'accounting' then emp is distinct from (select employee_id from public.profiles where id = (select auth.uid()))
    else false end
$$;
-- ใช้ในนโยบายของงวด/สลิป (security definer เพื่อไม่ให้นโยบายสองตารางเรียกกันวนไม่จบ)
create or replace function private.period_released(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select status in ('approved', 'closed') from public.payroll_periods where id = pid), false)
$$;
create or replace function private.has_my_payslip(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payslips s
    where s.period_id = pid and s.employee_id = (select employee_id from public.profiles where id = (select auth.uid())))
$$;
grant execute on all functions in schema private to authenticated;
revoke execute on function private.audit() from public, anon, authenticated;

-- ===================== RLS =====================
alter table public.payroll_settings enable row level security;
alter table public.ot_requests enable row level security;
alter table public.salary_history enable row level security;
alter table public.recurring_allowances enable row level security;
alter table public.tax_profiles enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_items enable row level security;
alter table public.audit_log enable row level security;

create policy "read settings" on public.payroll_settings for select to authenticated using (true);
create policy "admin update settings" on public.payroll_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- OT: ดูได้ตามขอบเขต Role; ยื่นคำขอให้ตัวเอง (ผู้จัดการ/CEO สั่งให้ทีมได้); เปลี่ยนสถานะผ่านฟังก์ชันด้านล่างเท่านั้น
create policy "read ot" on public.ot_requests for select to authenticated using (
  (select private.is_admin())
  or employee_id = (select private.my_employee_id())
  or private.is_my_team(employee_id)
);
create policy "insert ot" on public.ot_requests for insert to authenticated with check (
  status = 'pending' and decided_by is null and actual_hours is null
  and requested_by = (select auth.uid())
  and (
    employee_id = (select private.my_employee_id())
    or private.is_my_team(employee_id)
    or (select private.my_role()) = 'ceo'
  )
);

-- เงินเดือน เบี้ยเลี้ยง ค่าลดหย่อน: CEO/บัญชีดูทั้งหมด พนักงานดูของตัวเอง; แก้ได้ตาม can_edit_pay_of
create policy "read salary" on public.salary_history for select to authenticated using (
  (select private.is_admin()) or employee_id = (select private.my_employee_id())
);
create policy "write salary" on public.salary_history for all to authenticated
  using (private.can_edit_pay_of(employee_id)) with check (private.can_edit_pay_of(employee_id));

create policy "read allowances" on public.recurring_allowances for select to authenticated using (
  (select private.is_admin()) or employee_id = (select private.my_employee_id())
);
create policy "write allowances" on public.recurring_allowances for all to authenticated
  using (private.can_edit_pay_of(employee_id)) with check (private.can_edit_pay_of(employee_id));

create policy "read tax profiles" on public.tax_profiles for select to authenticated using (
  (select private.is_admin()) or employee_id = (select private.my_employee_id())
);
create policy "write tax profiles" on public.tax_profiles for all to authenticated
  using (private.can_edit_pay_of(employee_id)) with check (private.can_edit_pay_of(employee_id));

-- งวด: CEO/บัญชีดู สร้างได้; เปลี่ยนสถานะผ่านฟังก์ชัน
create policy "read periods" on public.payroll_periods for select to authenticated using (
  (select private.is_admin())
  or (status in ('approved', 'closed') and private.has_my_payslip(id))
);
create policy "admin insert periods" on public.payroll_periods for insert to authenticated
  with check ((select private.is_admin()) and status = 'draft');
create policy "admin delete draft periods" on public.payroll_periods for delete to authenticated
  using ((select private.is_admin()) and status = 'draft');

-- สลิป: CEO/บัญชีดูทุกใบ พนักงานเห็นของตัวเองเมื่อ CEO อนุมัติแล้ว; เขียนได้เฉพาะงวดร่าง
create policy "read payslips" on public.payslips for select to authenticated using (
  (select private.is_admin())
  or (employee_id = (select private.my_employee_id()) and private.period_released(period_id))
);
create policy "write payslips" on public.payslips for all to authenticated
  using ((select private.is_admin()) and private.period_is_draft(period_id))
  with check ((select private.is_admin()) and private.period_is_draft(period_id));

create policy "read payslip items" on public.payslip_items for select to authenticated using (
  exists (select 1 from public.payslips s where s.id = payslip_id)   -- ใช้สิทธิ์ของตาราง payslips
);
create policy "write payslip items" on public.payslip_items for all to authenticated
  using ((select private.is_admin()) and private.payslip_period_is_draft(payslip_id)
         and (not manual or private.can_edit_pay_of((select employee_id from public.payslips where id = payslip_id))))
  with check ((select private.is_admin()) and private.payslip_period_is_draft(payslip_id)
         and (not manual or private.can_edit_pay_of((select employee_id from public.payslips where id = payslip_id))));

create policy "admin read audit" on public.audit_log for select to authenticated using ((select private.is_admin()));

-- ===================== ฟังก์ชันเปลี่ยนสถานะ =====================
-- อนุมัติ / ไม่อนุมัติ OT: ผู้จัดการเฉพาะทีมตัวเอง (ไม่รวมตัวเอง) CEO ได้ทุกคน
create or replace function public.decide_ot(request_id uuid, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.ot_requests;
begin
  select * into r from public.ot_requests where id = request_id for update;
  if not found then raise exception 'ไม่พบคำขอ OT'; end if;
  if r.status <> 'pending' then raise exception 'คำขอนี้ไม่อยู่ในสถานะรออนุมัติ'; end if;
  if r.employee_id = private.my_employee_id() then raise exception 'อนุมัติ OT ของตัวเองไม่ได้'; end if;
  if not (private.my_role() = 'ceo' or private.is_my_team(r.employee_id)) then
    raise exception 'ไม่มีสิทธิ์อนุมัติคำขอนี้';
  end if;
  update public.ot_requests
    set status = case when approve then 'approved'::public.ot_status else 'rejected'::public.ot_status end,
        decided_by = auth.uid(), decided_at = now(), decision_note = note
    where id = request_id;
end $$;

-- ยกเลิกคำขอ: เจ้าของหรือผู้ยื่นแทน ทำได้ขณะรออนุมัติ
create or replace function public.cancel_ot(request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.ot_requests;
begin
  select * into r from public.ot_requests where id = request_id for update;
  if not found then raise exception 'ไม่พบคำขอ OT'; end if;
  if r.status <> 'pending' then raise exception 'ยกเลิกได้เฉพาะคำขอที่รออนุมัติ'; end if;
  if not (r.employee_id = private.my_employee_id() or r.requested_by = auth.uid()) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกคำขอนี้';
  end if;
  update public.ot_requests set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = request_id;
end $$;

-- ขั้นตอนงวดเงินเดือน: ร่าง → บัญชีตรวจแล้ว → CEO อนุมัติ → ปิดงวด
create or replace function public.set_payroll_status(period uuid, new_status public.payroll_status)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.payroll_periods; me public.app_role := private.my_role();
begin
  select * into p from public.payroll_periods where id = period for update;
  if not found then raise exception 'ไม่พบงวดเงินเดือน'; end if;
  if p.status = 'closed' then raise exception 'งวดนี้ปิดแล้ว แก้ไขไม่ได้'; end if;

  if new_status = 'reviewed' and p.status = 'draft' and me in ('accounting', 'ceo') then
    if not exists (select 1 from public.payslips where period_id = period) then
      raise exception 'ยังไม่ได้คำนวณเงินเดือน';
    end if;
    update public.payroll_periods set status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now() where id = period;
  elsif new_status = 'approved' and p.status = 'reviewed' and me = 'ceo' then
    update public.payroll_periods set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = period;
  elsif new_status = 'closed' and p.status = 'approved' and me = 'ceo' then
    update public.payroll_periods set status = 'closed', closed_at = now() where id = period;
  elsif new_status = 'draft' and p.status in ('reviewed', 'approved') and (me = 'ceo' or (me = 'accounting' and p.status = 'reviewed')) then
    update public.payroll_periods set status = 'draft', reviewed_by = null, reviewed_at = null, approved_by = null, approved_at = null where id = period;
  else
    raise exception 'ไม่สามารถเปลี่ยนสถานะงวดนี้ได้';
  end if;
end $$;

-- บันทึกเวลาที่คำนวณล่าสุด (เรียกหลังคำนวณสลิปเสร็จ)
create or replace function public.mark_payroll_calculated(period uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.payroll_periods set calculated_at = now() where id = period and status = 'draft';
end $$;

revoke execute on function public.decide_ot(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_ot(uuid) from public, anon;
revoke execute on function public.set_payroll_status(uuid, public.payroll_status) from public, anon;
revoke execute on function public.mark_payroll_calculated(uuid) from public, anon;
grant execute on function public.decide_ot(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_ot(uuid) to authenticated;
grant execute on function public.set_payroll_status(uuid, public.payroll_status) to authenticated;
grant execute on function public.mark_payroll_calculated(uuid) to authenticated;

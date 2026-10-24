-- ไฟล์โอนเงินเดือนเข้าบัญชีพนักงาน (SCB และกสิกรไทย)

-- บัญชีรับเงินเดือนของพนักงาน: เก็บรหัสธนาคาร 3 หลักตามธนาคารแห่งประเทศไทย แทนชื่อที่พิมพ์เอง
alter table public.employees
  add column bank_code text check (bank_code ~ '^\d{3}$'),
  add column bank_account_name text;

update public.employees set bank_code = case
    when bank_name ~* 'scb|ไทยพาณิชย์' then '014'
    when bank_name ~* 'kbank|kasikorn|กสิกร' then '004'
    when bank_name ~* 'bbl|bangkok bank|กรุงเทพ' then '002'
    when bank_name ~* 'ktb|krungthai|กรุงไทย' then '006'
    when bank_name ~* 'bay|krungsri|กรุงศรี' then '025'
    when bank_name ~* 'ttb|tmb|ทหารไทย|ธนชาต' then '011'
    when bank_name ~* 'gsb|ออมสิน' then '030'
  end
where bank_name is not null and bank_code is null;

-- บัญชีบริษัทที่ใช้จ่ายเงินเดือน แยกจาก payroll_settings เพราะตารางนั้นทุกคนอ่านได้ ตารางนี้เฉพาะ CEO/บัญชี
create table public.payroll_bank_settings (
  id boolean primary key default true check (id),
  company_name text,
  scb_account text,
  scb_company_id text,      -- รหัสบริษัทที่ SCB ให้มาตอนสมัครบริการจ่ายเงินเดือน
  kbank_account text,
  kbank_company_id text,    -- รหัสบริษัทที่กสิกรให้มา
  -- พนักงานที่ใช้บัญชีธนาคารอื่น ให้โอนจากธนาคารไหน
  other_bank_payer text not null default 'kbank' check (other_bank_payer in ('scb', 'kbank')),
  updated_at timestamptz not null default now()
);
insert into public.payroll_bank_settings default values;

create trigger audit_bank_settings after update on public.payroll_bank_settings for each row execute function private.audit();

alter table public.payroll_bank_settings enable row level security;
create policy "admin read bank settings" on public.payroll_bank_settings for select to authenticated
  using ((select private.is_admin()));
create policy "admin update bank settings" on public.payroll_bank_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

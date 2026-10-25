-- ทดสอบการแยกข้อมูลหลายบริษัทบนฐานข้อมูลทดสอบ (ไม่ใช่ฐานข้อมูลจริง)
-- รัน: psql -v ON_ERROR_STOP=1 -f supabase/tests/multi_company_rls.sql
\set QUIET on
begin;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000c','ceo@x'),('00000000-0000-0000-0000-00000000000a','acc@x'),
 ('00000000-0000-0000-0000-000000000001','e1@x');
insert into public.employees (id, code, first_name, last_name, start_date) values
 ('10000000-0000-0000-0000-00000000000c','C','ceo','x','2020-01-01'),
 ('10000000-0000-0000-0000-00000000000a','A','acc','x','2020-01-01'),
 ('10000000-0000-0000-0000-000000000001','E1','e1','x','2020-01-01');
update public.profiles set role='ceo', employee_id='10000000-0000-0000-0000-00000000000c' where id='00000000-0000-0000-0000-00000000000c';
update public.profiles set role='accounting', employee_id='10000000-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-00000000000a';
update public.profiles set employee_id='10000000-0000-0000-0000-000000000001' where id='00000000-0000-0000-0000-000000000001';
insert into public.holidays (holiday_date, name) values ('2099-01-01', 'ปีใหม่'), ('2000-01-01', 'อดีต');

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true), set_config('role', 'authenticated', true) $$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claim.sub', '', true) $$;
create function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if; raise notice 'pass: %', msg; end $$;
create function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

-- ข้อมูลเดิมอยู่บริษัทแรก และทุกคนเป็นสมาชิกพร้อม Role เดิม
select pg_temp.expect((select count(*) from public.companies) = 1, 'one company after migration');
select pg_temp.expect((select count(*) from public.employees where company_id = private.default_company_id()) = 3, 'employees in first company');
select pg_temp.expect((select role from public.company_members where user_id='00000000-0000-0000-0000-00000000000a') = 'accounting', 'membership mirrors role');
select pg_temp.expect((select count(*) from public.payroll_settings) = 1, 'settings row for first company');

-- ผู้ที่ไม่ใช่ CEO สร้างบริษัทไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(pg_temp.fails($q$select public.create_company('B')$q$), 'accounting cannot create company');

-- CEO สร้างบริษัท B แล้วถูกสลับไปบริษัท B
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select set_config('test.a', private.my_company_id()::text, true);
select set_config('test.b', public.create_company('บริษัท B', '0105555000000')::text, true);
select pg_temp.expect(private.my_company_id() = current_setting('test.b')::uuid, 'ceo switched to new company');
select pg_temp.expect(private.my_role() = 'ceo' and private.my_employee_id() is null, 'ceo in new company, no employee record');
select pg_temp.expect((select count(*) from public.employees) = 0, 'new company sees no employees');
select pg_temp.expect((select count(*) from public.companies) = 2, 'ceo sees both companies');
select pg_temp.expect((select count(*) from public.payroll_settings) = 1, 'new company has its own settings');
select pg_temp.expect((select count(*) from public.payroll_bank_settings where company_name = 'บริษัท B') = 1, 'bank settings created');
select pg_temp.expect((select count(*) from public.holidays) = 1, 'future holidays copied');

-- รหัสพนักงานซ้ำกับบริษัทอื่นได้
insert into public.employees (id, code, first_name, last_name, start_date) values
 ('10000000-0000-0000-0000-0000000000b1','E1','b1','x','2020-01-01'),
 ('10000000-0000-0000-0000-0000000000b2','E2','b2','x','2020-01-01');
select pg_temp.expect((select company_id from public.employees where id='10000000-0000-0000-0000-0000000000b1') = current_setting('test.b')::uuid, 'new employee goes to active company');
-- ห้ามอ้างพนักงานบริษัทอื่น
select pg_temp.expect(pg_temp.fails($q$insert into public.ot_requests (employee_id, work_date, start_time, end_time, reason) values ('10000000-0000-0000-0000-000000000001','2026-10-10','17:00','20:00','x')$q$), 'cannot create OT for other company employee');
select pg_temp.expect(pg_temp.fails($q$update public.employees set manager_id='10000000-0000-0000-0000-00000000000c' where id='10000000-0000-0000-0000-0000000000b1'$q$), 'cannot set manager from other company');
select pg_temp.expect(pg_temp.fails($q$insert into public.employees (code, first_name, last_name, start_date, company_id) values ('Z','z','z','2020-01-01','$q$ || current_setting('test.a') || $q$')$q$), 'cannot insert into non-active company');

-- การตั้งค่าเงินเดือนแยกกัน
update public.payroll_settings set ot_rate_workday = 2 where id;
select pg_temp.as_admin();
select pg_temp.expect((select ot_rate_workday from public.payroll_settings where company_id = current_setting('test.a')::uuid) = 1.5, 'other company settings untouched');

-- เพิ่มฝ่ายบัญชีเข้าบริษัท B
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.add_company_member('ACC@x', 'accounting');
-- ผูกพนักงานของบริษัท B ให้ฝ่ายบัญชี ขณะที่เขาเปิดบริษัท A อยู่: profiles ของเขาไม่เปลี่ยน
update public.profiles set employee_id = '10000000-0000-0000-0000-0000000000b2' where id = '00000000-0000-0000-0000-00000000000a';
select pg_temp.as_admin();
select pg_temp.expect((select employee_id from public.profiles where id='00000000-0000-0000-0000-00000000000a') = '10000000-0000-0000-0000-00000000000a', 'other user active view unchanged');
select pg_temp.expect((select employee_id from public.company_members where user_id='00000000-0000-0000-0000-00000000000a' and company_id = current_setting('test.b')::uuid) = '10000000-0000-0000-0000-0000000000b2', 'membership in B updated');

-- ผูกพนักงานบริษัทอื่นไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(pg_temp.fails($q$update public.profiles set employee_id = '10000000-0000-0000-0000-000000000001' where id = '00000000-0000-0000-0000-00000000000a'$q$), 'cannot link employee from other company');
-- CEO ในบริษัท B มองไม่เห็นโปรไฟล์ของคนที่อยู่แค่บริษัท A
select pg_temp.expect((select count(*) from public.profiles where id='00000000-0000-0000-0000-000000000001') = 0, 'cannot see profile outside company');
-- เปลี่ยนบริษัทให้คนอื่นไม่ได้
update public.profiles set active_company_id = current_setting('test.b')::uuid where id='00000000-0000-0000-0000-00000000000a';

-- ฝ่ายบัญชีเปิดบริษัท A อยู่: เห็นแค่ A
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(private.my_company_id() = current_setting('test.a')::uuid, 'others cannot change my active company');
select pg_temp.expect((select count(*) from public.employees) = 3, 'accounting sees only company A employees');
select pg_temp.expect((select count(*) from public.companies) = 2, 'accounting is member of both');
-- สลับไป B ได้ Role และพนักงานของ B
select public.switch_company(current_setting('test.b')::uuid);
select pg_temp.expect(private.my_role() = 'accounting' and private.my_employee_id() = '10000000-0000-0000-0000-0000000000b2', 'switch picks company B role and employee');
select pg_temp.expect((select count(*) from public.employees) = 2, 'now sees only company B employees');
select public.switch_company(current_setting('test.a')::uuid);
select pg_temp.expect(private.my_employee_id() = '10000000-0000-0000-0000-00000000000a', 'switch back restores company A employee');

-- พนักงานที่อยู่บริษัทเดียวสลับไปบริษัทอื่นไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($q$select public.switch_company('$q$ || current_setting('test.b') || $q$')$q$), 'non-member cannot switch');
update public.profiles set active_company_id = current_setting('test.b')::uuid where id = auth.uid();
select pg_temp.expect(private.my_company_id() = current_setting('test.a')::uuid, 'non-member cannot set active company directly');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(pg_temp.fails($q$update public.profiles set active_company_id = gen_random_uuid() where id = auth.uid()$q$), 'ceo cannot jump to company without membership');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.companies) = 1, 'employee sees only own company');
select pg_temp.expect((select count(*) from public.swap_candidates('2099-02-01')) = 2, 'swap candidates only own company');

-- คำขอ OT ของบริษัท A อนุมัติจากบริษัท B ไม่ได้
insert into public.ot_requests (id, employee_id, work_date, start_time, end_time, reason)
  values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-10-10','17:00','20:00','งาน');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(private.my_company_id() = current_setting('test.b')::uuid, 'ceo still in B');
select pg_temp.expect((select count(*) from public.ot_requests) = 0, 'company B cannot see company A OT');
select pg_temp.expect(pg_temp.fails($q$select public.decide_ot('20000000-0000-0000-0000-000000000001', true)$q$), 'cannot approve OT of other company');
select public.switch_company(current_setting('test.a')::uuid);
select public.decide_ot('20000000-0000-0000-0000-000000000001', true);
select pg_temp.expect((select status from public.ot_requests where id='20000000-0000-0000-0000-000000000001') = 'approved', 'approve within own company works');

-- ประวัติการแก้ไขแยกบริษัท
select pg_temp.expect((select count(*) from public.audit_log where table_name='ot_requests') = 2, 'audit visible in company A');
select public.switch_company(current_setting('test.b')::uuid);
select pg_temp.expect((select count(*) from public.audit_log where table_name='ot_requests') = 0, 'audit hidden in company B');

-- เอาฝ่ายบัญชีออกจากบริษัท B
select public.remove_company_member('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(pg_temp.fails($q$select public.remove_company_member('00000000-0000-0000-0000-00000000000c')$q$), 'ceo cannot remove self');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.companies) = 1, 'removed member loses access');
rollback;

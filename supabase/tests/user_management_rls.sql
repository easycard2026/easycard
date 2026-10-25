-- ทดสอบระบบจัดการผู้ใช้บนฐานข้อมูลทดสอบ (ไม่ใช่ฐานข้อมูลจริง)
-- รัน: psql -v ON_ERROR_STOP=1 -f supabase/tests/user_management_rls.sql
\set QUIET on
begin;
insert into auth.users (id, email, encrypted_password) values
 ('00000000-0000-0000-0000-00000000000c','ceo@x', extensions.crypt('ceo-pass-1', extensions.gen_salt('bf'))),
 ('00000000-0000-0000-0000-00000000000a','acc@x', extensions.crypt('acc-pass-1', extensions.gen_salt('bf'))),
 ('00000000-0000-0000-0000-00000000000e','emp@x', extensions.crypt('emp-pass-1', extensions.gen_salt('bf')));
insert into public.employees (id, code, first_name, last_name, start_date) values
 ('10000000-0000-0000-0000-00000000000c','C','ceo','x','2020-01-01'),
 ('10000000-0000-0000-0000-000000000001','E1','สมชาย','ใจดี','2020-01-01'),
 ('10000000-0000-0000-0000-000000000002','E2','สมหญิง','ใจดี','2020-01-01');
update public.profiles set role='ceo', employee_id='10000000-0000-0000-0000-00000000000c' where id='00000000-0000-0000-0000-00000000000c';
update public.profiles set role='accounting' where id='00000000-0000-0000-0000-00000000000a';

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true), set_config('role', 'authenticated', true) $$;
create function pg_temp.as_admin() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claim.sub', '', true) $$;
create function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'FAIL: %', msg; end if; raise notice 'pass: %', msg; end $$;
create function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

-- พนักงานทั่วไปดูรายชื่อ/สร้างบัญชีไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select pg_temp.expect(pg_temp.fails($q$select * from public.list_users()$q$), 'employee cannot list users');
select pg_temp.expect(pg_temp.fails($q$select public.admin_create_user('x@staff.easycard.local','12345678','employee',null,null)$q$), 'employee cannot create user');

-- CEO สร้างบัญชีผู้จัดการให้ E1
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select set_config('test.m', public.admin_create_user('e1@staff.easycard.local', 'temp-pass-1', 'manager',
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select pg_temp.expect((select role from public.list_users() where id = current_setting('test.m')::uuid) = 'manager', 'created as manager');
select pg_temp.expect((select display_name from public.list_users() where id = current_setting('test.m')::uuid) = 'สมชาย ใจดี', 'name from employee');
select pg_temp.expect((select must_change_password from public.list_users() where id = current_setting('test.m')::uuid), 'must change password');
select pg_temp.expect(pg_temp.fails($q$select public.admin_create_user('e1@staff.easycard.local','temp-pass-1','employee',null,null)$q$), 'duplicate username rejected');
select pg_temp.expect(pg_temp.fails($q$select public.admin_create_user('z@staff.easycard.local','temp-pass-1','employee','10000000-0000-0000-0000-000000000001',null)$q$), 'employee already linked');
select pg_temp.expect(pg_temp.fails($q$select public.admin_create_user('z@staff.easycard.local','short','employee',null,null)$q$), 'short password rejected');
select pg_temp.as_admin();
select pg_temp.expect((select count(*) from auth.identities where user_id = current_setting('test.m')::uuid) = 1, 'identity row created');
select pg_temp.expect((select role from public.company_members where user_id = current_setting('test.m')::uuid) = 'manager', 'membership written');
select pg_temp.expect((select active_company_id from public.profiles where id = current_setting('test.m')::uuid) = private.default_company_id(), 'joined ceo company');

-- ฝ่ายบัญชี: สร้างได้เฉพาะผู้จัดการ/พนักงาน แตะบัญชี CEO ไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(pg_temp.fails($q$select public.admin_create_user('c2@x.co','temp-pass-1','ceo',null,null)$q$), 'accounting cannot create ceo');
select set_config('test.e', public.admin_create_user('e2@staff.easycard.local', 'temp-pass-2', 'employee',
  '10000000-0000-0000-0000-000000000002', null)::text, true);
select pg_temp.expect(pg_temp.fails($q$select public.admin_reset_password('00000000-0000-0000-0000-00000000000c','new-pass-123')$q$), 'accounting cannot reset ceo');
select pg_temp.expect(pg_temp.fails($q$select public.admin_set_active('00000000-0000-0000-0000-00000000000c', false)$q$), 'accounting cannot disable ceo');
select pg_temp.expect(pg_temp.fails($q$select public.admin_update_user(current_setting('test.e')::uuid,'accounting',null,null)$q$), 'accounting cannot grant accounting');
select public.admin_update_user(current_setting('test.e')::uuid, 'employee', null, 'ชื่อใหม่');
select pg_temp.expect((select employee_id from public.list_users() where id = current_setting('test.e')::uuid) is null, 'unlinked employee');
select public.admin_update_user(current_setting('test.e')::uuid, 'employee', '10000000-0000-0000-0000-000000000002', null);

-- CEO เปลี่ยน Role ตัวเอง/ปิดตัวเองไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.expect(pg_temp.fails($q$select public.admin_update_user('00000000-0000-0000-0000-00000000000c','employee',null,null)$q$), 'ceo cannot demote self');
select pg_temp.expect(pg_temp.fails($q$select public.admin_set_active('00000000-0000-0000-0000-00000000000c', false)$q$), 'ceo cannot disable self');

-- ผู้ใช้เปลี่ยนรหัสผ่านเอง
select pg_temp.as_user(current_setting('test.m'));
select pg_temp.expect(pg_temp.fails($q$select public.change_my_password('wrong-pass', 'brand-new-1')$q$), 'wrong current password');
select public.change_my_password('temp-pass-1', 'brand-new-1');
select pg_temp.expect(not (select must_change_password from public.profiles where id = auth.uid()), 'flag cleared');
select pg_temp.expect(private.is_my_team('10000000-0000-0000-0000-000000000002') = false, 'not team yet');

-- รีเซ็ตรหัส: ตั้ง flag และตัด session
select pg_temp.as_admin();
insert into auth.sessions (user_id) values (current_setting('test.m')::uuid);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.admin_reset_password(current_setting('test.m')::uuid, 'reset-pass-1');
select pg_temp.as_admin();
select pg_temp.expect((select must_change_password from public.profiles where id = current_setting('test.m')::uuid), 'reset sets flag');
select pg_temp.expect((select encrypted_password from auth.users where id = current_setting('test.m')::uuid)
  = extensions.crypt('reset-pass-1', (select encrypted_password from auth.users where id = current_setting('test.m')::uuid)), 'password changed');
select pg_temp.expect(not exists (select 1 from auth.sessions where user_id = current_setting('test.m')::uuid), 'sessions ended');

-- ปิดบัญชี: เข้าไม่ได้ และหมดสิทธิ์ทันที
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.admin_set_active('00000000-0000-0000-0000-00000000000a', false);
select pg_temp.as_admin();
select pg_temp.expect((select banned_until from auth.users where id = '00000000-0000-0000-0000-00000000000a') = 'infinity', 'banned');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect(not private.is_admin(), 'disabled user loses admin');
select pg_temp.expect((select count(*) from public.employees) = 0, 'disabled user sees no employees');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.admin_set_active('00000000-0000-0000-0000-00000000000a', true);
select pg_temp.as_admin();
select pg_temp.expect((select banned_until from auth.users where id = '00000000-0000-0000-0000-00000000000a') is null, 'reactivated');

-- บริษัทอื่น: CEO สลับไปบริษัท B แล้วเห็น/แก้ผู้ใช้บริษัท A ไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.create_company('บริษัท B');
select pg_temp.expect((select count(*) from public.list_users()) = 1, 'company B lists only ceo');
select pg_temp.expect(pg_temp.fails($q$select public.admin_reset_password(current_setting('test.e')::uuid,'other-pass-1')$q$), 'cannot reset user of other company');
select pg_temp.expect(pg_temp.fails($q$select public.admin_update_user(current_setting('test.e')::uuid,'employee',null,null)$q$), 'cannot edit user of other company');

rollback;

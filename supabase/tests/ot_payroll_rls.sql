-- ทดสอบสิทธิ์ OT และเงินเดือนบนฐานข้อมูลทดสอบ (ไม่ใช่ฐานข้อมูลจริง)
-- รัน: psql -v ON_ERROR_STOP=1 -f supabase/tests/ot_payroll_rls.sql
\set QUIET on
begin;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000c','ceo'),('00000000-0000-0000-0000-00000000000a','acc'),
 ('00000000-0000-0000-0000-00000000000b','mgr'),('00000000-0000-0000-0000-000000000001','e1'),
 ('00000000-0000-0000-0000-000000000002','e2');
insert into public.employees (id, code, first_name, last_name, start_date) values
 ('10000000-0000-0000-0000-00000000000c','C','ceo','x','2020-01-01'),
 ('10000000-0000-0000-0000-00000000000a','A','acc','x','2020-01-01'),
 ('10000000-0000-0000-0000-00000000000b','M','mgr','x','2020-01-01');
insert into public.employees (id, code, first_name, last_name, start_date, manager_id) values
 ('10000000-0000-0000-0000-000000000001','E1','e1','x','2020-01-01','10000000-0000-0000-0000-00000000000b'),
 ('10000000-0000-0000-0000-000000000002','E2','e2','x','2020-01-01', null);
update public.profiles set role='ceo', employee_id='10000000-0000-0000-0000-00000000000c' where id='00000000-0000-0000-0000-00000000000c';
update public.profiles set role='accounting', employee_id='10000000-0000-0000-0000-00000000000a' where id='00000000-0000-0000-0000-00000000000a';
update public.profiles set role='manager', employee_id='10000000-0000-0000-0000-00000000000b' where id='00000000-0000-0000-0000-00000000000b';
update public.profiles set employee_id='10000000-0000-0000-0000-000000000001' where id='00000000-0000-0000-0000-000000000001';
update public.profiles set employee_id='10000000-0000-0000-0000-000000000002' where id='00000000-0000-0000-0000-000000000002';

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, true), set_config('role', 'authenticated', true) $$;
create function pg_temp.expect(ok boolean, msg text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', msg; end if; raise notice 'pass: %', msg; end $$;
create function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;

-- พนักงาน e1 ขอ OT ให้ตัวเองได้ แต่ขอให้ e2 ไม่ได้ และตั้งสถานะอนุมัติเองไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.ot_requests (id, employee_id, work_date, start_time, end_time, reason)
  values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','2026-10-10','17:00','20:00','งานด่วน');
select pg_temp.expect((select hours from public.ot_requests where id='20000000-0000-0000-0000-000000000001') = 3, 'OT hours computed');
select pg_temp.expect(pg_temp.fails($q$insert into public.ot_requests (employee_id, work_date, start_time, end_time, reason) values ('10000000-0000-0000-0000-000000000002','2026-10-10','17:00','20:00','x')$q$), 'employee cannot request for others');
select pg_temp.expect(pg_temp.fails($q$insert into public.ot_requests (employee_id, work_date, start_time, end_time, reason, status) values ('10000000-0000-0000-0000-000000000001','2026-10-11','17:00','20:00','x','approved')$q$), 'employee cannot self-approve on insert');
select pg_temp.expect(pg_temp.fails($q$select public.decide_ot('20000000-0000-0000-0000-000000000001', true)$q$), 'employee cannot approve');
update public.ot_requests set status='approved' where id='20000000-0000-0000-0000-000000000001';
select pg_temp.expect((select status from public.ot_requests where id='20000000-0000-0000-0000-000000000001') = 'pending', 'direct update blocked');
-- ข้ามเที่ยงคืน
insert into public.ot_requests (employee_id, work_date, start_time, end_time, reason) values ('10000000-0000-0000-0000-000000000001','2026-10-12','22:00','02:00','กะดึก');
select pg_temp.expect((select hours from public.ot_requests where work_date='2026-10-12') = 4, 'overnight OT hours');
reset role;

-- e2 มองไม่เห็นคำขอของ e1
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.ot_requests) = 0, 'other employee cannot see');
reset role;

-- ผู้จัดการเห็นและอนุมัติของทีมได้ แต่อนุมัติของตัวเองไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.ot_requests) = 2, 'manager sees team');
select public.decide_ot('20000000-0000-0000-0000-000000000001', true, 'ok');
insert into public.ot_requests (id, employee_id, work_date, start_time, end_time, reason)
  values ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','2026-10-10','17:00','19:00','x');
select pg_temp.expect(pg_temp.fails($q$select public.decide_ot('20000000-0000-0000-0000-00000000000b', true)$q$), 'manager cannot approve own');
select pg_temp.expect(pg_temp.fails($q$select public.decide_ot('20000000-0000-0000-0000-000000000001', false)$q$), 'cannot decide twice');
reset role;
select pg_temp.expect((select status from public.ot_requests where id='20000000-0000-0000-0000-000000000001') = 'approved', 'manager approval stored');

-- บัญชีดูได้ แต่อนุมัติไม่ได้; CEO อนุมัติของผู้จัดการได้
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.ot_requests) = 3, 'accounting sees all OT');
select pg_temp.expect(pg_temp.fails($q$select public.decide_ot('20000000-0000-0000-0000-00000000000b', true)$q$), 'accounting cannot approve');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.decide_ot('20000000-0000-0000-0000-00000000000b', true);
reset role;

-- เงินเดือน: บัญชีตั้งของคนอื่นได้ ของตัวเองไม่ได้; พนักงานเห็นของตัวเองเท่านั้น
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.salary_history (employee_id, monthly_salary, effective_date) values ('10000000-0000-0000-0000-000000000001', 20000, '2020-01-01');
insert into public.salary_history (employee_id, monthly_salary, effective_date) values ('10000000-0000-0000-0000-000000000002', 30000, '2020-01-01');
select pg_temp.expect(pg_temp.fails($q$insert into public.salary_history (employee_id, monthly_salary, effective_date) values ('10000000-0000-0000-0000-00000000000a', 99999, '2020-01-01')$q$), 'accounting cannot set own salary');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.salary_history (employee_id, monthly_salary, effective_date) values ('10000000-0000-0000-0000-00000000000a', 25000, '2020-01-01');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.salary_history) = 1, 'employee sees own salary only');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.salary_history) = 0, 'manager cannot see team salary');
reset role;

-- งวดเงินเดือน: สลิปซ่อนจากพนักงานจนกว่า CEO อนุมัติ; แก้ไม่ได้หลังส่งตรวจ
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.payroll_periods (id, year, month, start_date, end_date) values ('30000000-0000-0000-0000-000000000001', 2026, 10, '2026-10-01', '2026-10-31');
insert into public.payslips (id, period_id, employee_id, net) values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001', 19000);
insert into public.payslip_items (payslip_id, kind, code, label, amount, manual) values ('40000000-0000-0000-0000-000000000001','earning','manual','โบนัส',500,true);
select pg_temp.expect(pg_temp.fails($q$select public.set_payroll_status('30000000-0000-0000-0000-000000000001','approved')$q$), 'accounting cannot approve period');
select public.set_payroll_status('30000000-0000-0000-0000-000000000001','reviewed');
update public.payslips set net = 1 where id='40000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.expect((select net from public.payslips where id='40000000-0000-0000-0000-000000000001') = 19000, 'payslip locked after review');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.payslips) = 0, 'employee cannot see unapproved slip');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.set_payroll_status('30000000-0000-0000-0000-000000000001','approved');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect((select count(*) from public.payslips) = 1, 'employee sees approved slip');
select pg_temp.expect((select count(*) from public.payslip_items) = 1, 'employee sees slip items');
select pg_temp.expect((select count(*) from public.payroll_periods) = 1, 'employee sees approved period');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.expect((select count(*) from public.payslips) = 0, 'other employee cannot see slip');
reset role;
select pg_temp.expect((select count(*) from public.audit_log where table_name='payslip_items') = 1, 'manual item audited');
select pg_temp.expect((select count(*) from public.audit_log where table_name='salary_history') = 3, 'salary audited');
rollback;

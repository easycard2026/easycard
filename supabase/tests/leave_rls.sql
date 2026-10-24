-- ทดสอบระบบลาและวันหยุดประจำปีบนฐานข้อมูลทดสอบ (ไม่ใช่ฐานข้อมูลจริง)
-- รัน: psql -v ON_ERROR_STOP=1 -f supabase/tests/leave_rls.sql
\set QUIET on
begin;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000c','ceo'),('00000000-0000-0000-0000-00000000000a','acc'),
 ('00000000-0000-0000-0000-00000000000b','mgr'),('00000000-0000-0000-0000-000000000001','e1'),
 ('00000000-0000-0000-0000-000000000002','e2');
insert into public.holiday_calendars (id, name) values ('30000000-0000-0000-0000-000000000001', 'โรงงาน');
insert into public.positions (id, name, holiday_calendar_id) values ('40000000-0000-0000-0000-000000000001', 'ช่าง', '30000000-0000-0000-0000-000000000001');
insert into public.employees (id, code, first_name, last_name, start_date) values
 ('10000000-0000-0000-0000-00000000000c','C','ceo','x','2020-01-01'),
 ('10000000-0000-0000-0000-00000000000a','A','acc','x','2020-01-01'),
 ('10000000-0000-0000-0000-00000000000b','M','mgr','x','2020-01-01');
insert into public.employees (id, code, first_name, last_name, start_date, manager_id, position_id) values
 ('10000000-0000-0000-0000-000000000001','E1','e1','x','2020-01-01','10000000-0000-0000-0000-00000000000b','40000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002','E2','e2','x','2026-06-01', null, null);
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

-- ===== วันหยุดประจำปี =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.holidays (holiday_date, name) values ('2026-12-31', 'สิ้นปี');
insert into public.holidays (calendar_id, holiday_date, name) values ('30000000-0000-0000-0000-000000000001', '2026-12-30', 'หยุดโรงงาน');
insert into public.employee_holiday_overrides (employee_id, holiday_date, is_holiday) values ('10000000-0000-0000-0000-000000000002', '2026-12-31', false);
insert into public.employee_holiday_overrides (employee_id, holiday_date, is_holiday, name) values ('10000000-0000-0000-0000-000000000002', '2026-12-25', true, 'วันเกิด');
reset role;
select pg_temp.expect((select array_agg(holiday_date order by holiday_date) from public.employee_holidays where employee_id='10000000-0000-0000-0000-000000000001') = '{2026-12-30}', 'position calendar applies');
select pg_temp.expect((select array_agg(holiday_date order by holiday_date) from public.employee_holidays where employee_id='10000000-0000-0000-0000-00000000000c') = '{2026-12-31}', 'default calendar applies');
select pg_temp.expect((select array_agg(holiday_date order by holiday_date) from public.employee_holidays where employee_id='10000000-0000-0000-0000-000000000002') = '{2026-12-25}', 'per-employee add/remove');
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select pg_temp.expect(pg_temp.fails($q$insert into public.holidays (holiday_date, name) values ('2026-12-01','x')$q$), 'employee cannot add holidays');
select pg_temp.expect((select count(*) from public.employee_holidays) = 1, 'employee sees only own holidays');
reset role;

-- ===== ยื่นใบลา =====
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
-- จ. 28 ถึง พฤ. 31 ธ.ค.: 30 เป็นวันหยุดของตำแหน่ง = 3 วัน
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, reason)
  values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','sick','2026-12-28','2026-12-31','ไข้');
select pg_temp.expect((select days from public.leave_requests where id='20000000-0000-0000-0000-000000000001') = 3, 'days skip holidays');
-- อา. ถึง จ. (อาทิตย์เป็นวันหยุดประจำสัปดาห์) = 1 วัน
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, reason)
  values ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','personal','2026-11-01','2026-11-04','ธุระ');
select pg_temp.expect((select days from public.leave_requests where id='20000000-0000-0000-0000-000000000002') = 3, 'days skip weekly day off');
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, reason)
  values ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','personal','2026-11-09','2026-11-10','ธุระ');
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, half_day, reason)
  values ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001','annual','2026-11-16','2026-11-16','am','พัก');
select pg_temp.expect((select days from public.leave_requests where id='20000000-0000-0000-0000-000000000004') = 0.5, 'half day');
insert into public.leave_requests (employee_id, leave_type, start_date, end_date, half_day, reason)
  values ('10000000-0000-0000-0000-000000000001','annual','2026-11-16','2026-11-16','pm','พัก');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason) values ('10000000-0000-0000-0000-000000000001','sick','2026-11-16','2026-11-16','x')$q$), 'overlap blocked');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason) values ('10000000-0000-0000-0000-000000000001','annual','2026-10-05','2026-10-12','x')$q$), 'annual max 6 enforced');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason) values ('10000000-0000-0000-0000-000000000001','sick','2026-12-30','2026-12-30','x')$q$), 'holiday-only leave blocked');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason) values ('10000000-0000-0000-0000-000000000002','sick','2026-10-05','2026-10-05','x')$q$), 'employee cannot request for others');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status) values ('10000000-0000-0000-0000-000000000001','sick','2026-10-05','2026-10-05','x','approved')$q$), 'employee cannot self-approve on insert');
select pg_temp.expect(pg_temp.fails($q$select public.decide_leave('20000000-0000-0000-0000-000000000001', true)$q$), 'employee cannot approve');
update public.leave_requests set status='approved' where id='20000000-0000-0000-0000-000000000001';
select pg_temp.expect((select status from public.leave_requests where id='20000000-0000-0000-0000-000000000001') = 'pending', 'direct update blocked');
reset role;

-- พนักงานใหม่ (เริ่ม มิ.ย. 2569) ยังลาพักร้อนไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-000000000002');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason) values ('10000000-0000-0000-0000-000000000002','annual','2026-10-05','2026-10-05','x')$q$), 'annual needs 1 year service');
select pg_temp.expect((select count(*) from public.leave_requests) = 0, 'other employee cannot see');
reset role;

-- ===== อนุมัติ =====
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect((select count(*) from public.leave_requests) = 5, 'manager sees team');
select public.decide_leave('20000000-0000-0000-0000-000000000002', true);
select public.decide_leave('20000000-0000-0000-0000-000000000003', true);
select public.decide_leave('20000000-0000-0000-0000-000000000001', true, 'หายไว ๆ');
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, reason)
  values ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','sick','2026-10-06','2026-10-06','x');
select pg_temp.expect(pg_temp.fails($q$select public.decide_leave('20000000-0000-0000-0000-00000000000b', true)$q$), 'manager cannot approve own');
select pg_temp.expect(pg_temp.fails($q$select public.decide_leave('20000000-0000-0000-0000-000000000002', false)$q$), 'cannot decide twice');
reset role;
select pg_temp.expect((select unpaid_days from public.leave_requests where id='20000000-0000-0000-0000-000000000002') = 0, 'first 3 personal days paid');
select pg_temp.expect((select unpaid_days from public.leave_requests where id='20000000-0000-0000-0000-000000000003') = 2, 'personal beyond 3 days unpaid');
select pg_temp.expect((select count(*) from public.approved_leave_days where request_id='20000000-0000-0000-0000-000000000003' and not paid) = 2, 'view marks unpaid days');
select pg_temp.expect((select array_agg(leave_date order by leave_date) from public.approved_leave_days where request_id='20000000-0000-0000-0000-000000000001') = '{2026-12-28,2026-12-29,2026-12-31}', 'view dates skip holiday');

-- บัญชีดูทั้งหมด ยื่นแทนได้ แต่อนุมัติไม่ได้; CEO อนุมัติของผู้จัดการ
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect((select count(*) from public.leave_requests) = 6, 'accounting sees all');
insert into public.leave_requests (id, employee_id, leave_type, start_date, end_date, reason)
  values ('20000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000002','sick','2026-10-07','2026-10-07','โทรมาลา');
select pg_temp.expect(pg_temp.fails($q$select public.decide_leave('20000000-0000-0000-0000-00000000000b', true)$q$), 'accounting cannot approve');
insert into public.leave_entitlements (employee_id, leave_type, max_days, paid_days) values ('10000000-0000-0000-0000-000000000001','annual',10,10);
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.decide_leave('20000000-0000-0000-0000-00000000000b', true);
reset role;
select pg_temp.expect((select status from public.leave_requests where id='20000000-0000-0000-0000-00000000000b') = 'approved', 'ceo approves manager');

-- สิทธิ์รายคน: พักร้อน 10 วัน ลาเพิ่มได้
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
insert into public.leave_requests (employee_id, leave_type, start_date, end_date, reason) values ('10000000-0000-0000-0000-000000000001','annual','2026-10-05','2026-10-12','เที่ยว');
select pg_temp.expect(pg_temp.fails($q$insert into public.leave_entitlements (employee_id, leave_type, max_days, paid_days) values ('10000000-0000-0000-0000-000000000001','sick',99,99)$q$), 'employee cannot edit entitlements');
-- ยกเลิก: ของที่อนุมัติแล้วยกเลิกเองไม่ได้
select pg_temp.expect(pg_temp.fails($q$select public.cancel_leave('20000000-0000-0000-0000-000000000001')$q$), 'employee cannot cancel approved');
select public.cancel_leave('20000000-0000-0000-0000-000000000004');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.cancel_leave('20000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.expect((select status from public.leave_requests where id='20000000-0000-0000-0000-000000000001') = 'cancelled', 'manager cancels approved');
select pg_temp.expect((select count(*) from public.approved_leave_days where request_id='20000000-0000-0000-0000-000000000001') = 0, 'cancelled leave leaves view');

rollback;
\echo 'ALL LEAVE TESTS PASSED'

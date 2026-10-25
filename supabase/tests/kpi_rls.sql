-- ทดสอบสิทธิ์ KPI (ทุกอย่างถูกย้อนกลับตอนจบด้วย raise exception)
-- E001 = CEO, E002 = บัญชี, E003 = ผู้จัดการ (ลูกทีม E004), E004 = พนักงาน
do $$
declare
  ceo uuid := '0a13df62-42df-4510-aaa2-70cc1c06131c';
  acc uuid := '3df2eeec-fae0-4a0b-aa83-853d0fbfc3e0';
  mgr uuid := 'd48e3957-240d-407c-907f-c0f0167e31b5';
  emp uuid := '3bceb378-ceff-40c7-b577-7109ae68ea38';
  e_ceo uuid := 'be5041ae-77b8-478c-9e90-b6f3763cab7c';
  e_acc uuid := '56e0af63-a1f1-4cc4-8681-02e8e17cec5d';
  e_mgr uuid := 'f47c657e-d3bf-4320-8979-81f259cebe04';
  e_emp uuid := 'a524db14-f3d9-4417-8f9f-7ff1950ebcbf';
  g uuid; pe uuid; pa uuid; n int; out text := ''; ok boolean;
begin
  perform set_config('role', 'authenticated', true);

  -- CEO: สร้างหัวข้อกลาง และหัวข้อรายคนของบัญชี
  perform set_config('request.jwt.claims', json_build_object('sub', ceo, 'role', 'authenticated')::text, true);
  insert into kpi_items (name, target) values ('global', 100) returning id into g;
  insert into kpi_items (name, target, employee_id) values ('acc only', 10, e_acc) returning id into pa;
  out := out || '1 ceo creates global: ok; ';

  -- ผู้จัดการ: สร้างหัวข้อกลางไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  begin insert into kpi_items (name, target) values ('x', 1); out := out || '2 FAIL mgr global; ';
  exception when insufficient_privilege then out := out || '2 mgr global denied: ok; '; end;
  -- ผู้จัดการ: สร้างหัวข้อรายคนให้ลูกทีมได้ แต่ให้ตัวเอง/คนนอกทีมไม่ได้
  insert into kpi_items (name, target, employee_id) values ('emp only', 5, e_emp) returning id into pe;
  out := out || '3 mgr item for team: ok; ';
  begin insert into kpi_items (name, target, employee_id) values ('x', 1, e_mgr); out := out || '4 FAIL mgr self item; ';
  exception when insufficient_privilege then out := out || '4 mgr self item denied: ok; '; end;
  -- ผู้จัดการ: ให้คะแนนลูกทีมได้ ให้ตัวเองไม่ได้
  insert into kpi_scores (item_id, employee_id, period, target, actual) values (g, e_emp, '2026-10-01', 100, 90);
  out := out || '5 mgr scores team: ok; ';
  begin insert into kpi_scores (item_id, employee_id, period, target, actual) values (g, e_mgr, '2026-10-01', 100, 100); out := out || '6 FAIL mgr self score; ';
  exception when insufficient_privilege then out := out || '6 mgr self score denied: ok; '; end;
  -- ผู้จัดการไม่เห็นหัวข้อรายคนของบัญชี
  select count(*) into n from kpi_items where id = pa;
  out := out || '7 mgr sees acc item: ' || n || case when n = 0 then ' ok; ' else ' FAIL; ' end;

  -- บัญชี: ให้คะแนนตัวเองไม่ได้ ให้คนอื่นได้
  perform set_config('request.jwt.claims', json_build_object('sub', acc, 'role', 'authenticated')::text, true);
  begin insert into kpi_scores (item_id, employee_id, period, target, actual) values (g, e_acc, '2026-10-01', 100, 100); out := out || '8 FAIL acc self score; ';
  exception when insufficient_privilege then out := out || '8 acc self score denied: ok; '; end;
  insert into kpi_scores (item_id, employee_id, period, target, actual) values (g, e_mgr, '2026-10-01', 100, 70);
  out := out || '9 acc scores mgr: ok; ';

  -- พนักงาน: เห็นคะแนนตัวเองเท่านั้น แก้อะไรไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
  select count(*) into n from kpi_scores;
  out := out || '10 emp sees scores: ' || n || case when n = 1 then ' ok; ' else ' FAIL; ' end;
  select count(*) into n from kpi_items where id in (g, pe, pa);
  out := out || '11 emp sees items: ' || n || case when n = 2 then ' ok; ' else ' FAIL; ' end;
  update kpi_scores set actual = 999 where employee_id = e_emp;
  get diagnostics n = row_count;
  out := out || '12 emp edits own score rows: ' || n || case when n = 0 then ' ok; ' else ' FAIL; ' end;
  begin insert into kpi_items (name, target, employee_id) values ('x', 1, e_emp); out := out || '13 FAIL emp item; ';
  exception when insufficient_privilege then out := out || '13 emp item denied: ok; '; end;

  raise exception 'RESULT: %', out;
end $$;

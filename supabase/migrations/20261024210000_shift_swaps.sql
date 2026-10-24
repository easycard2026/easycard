-- ขอแลกกะรายครั้ง: พนักงาน A ขอแลกกะของวันหนึ่งกับพนักงาน B
-- ขั้นตอน: A ส่งคำขอ → B ตอบรับ → หัวหน้างาน และ บัญชี อนุมัติ (ลำดับไหนก่อนก็ได้) → มีผล
-- เมื่ออนุมัติครบ A ได้กะเดิมของ B และ B ได้กะเดิมของ A ในวันนั้น (กะ null = วันหยุด)
-- หน้าเวลาเข้าออกอ่านคำขอที่อนุมัติแล้วมาแทนกะของวันนั้น (ชนะการจัดกะเฉพาะวัน)

create type public.swap_status as enum ('pending_peer', 'pending_approval', 'approved', 'rejected', 'cancelled');

create table public.shift_swaps (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  requester_id uuid not null references public.employees(id) on delete cascade,
  target_id uuid not null references public.employees(id) on delete cascade,
  requester_shift_id uuid references public.shifts(id),   -- กะเดิมของผู้ขอ (null = วันหยุด) อัปเดตอีกครั้งตอนอนุมัติครบ
  target_shift_id uuid references public.shifts(id),      -- กะเดิมของคนที่ถูกขอแลก
  reason text not null,
  status public.swap_status not null default 'pending_peer',
  requested_by uuid references auth.users(id) default auth.uid(),
  peer_at timestamptz,
  manager_by uuid references auth.users(id),
  manager_at timestamptz,
  accounting_by uuid references auth.users(id),
  accounting_at timestamptz,
  decided_by uuid references auth.users(id),               -- คนที่ปฏิเสธ / ยกเลิก
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  check (requester_id <> target_id)
);
create index on public.shift_swaps (work_date);
create index on public.shift_swaps (requester_id);
create index on public.shift_swaps (target_id);
create index on public.shift_swaps (status);

create trigger audit_shift_swaps after insert or update or delete on public.shift_swaps
  for each row execute function private.audit();

alter table public.shift_swaps enable row level security;

-- ดูได้: CEO/บัญชีทุกคำขอ, ผู้ขอและคนที่ถูกขอ, ผู้จัดการของทั้งสองฝั่ง
-- เขียนผ่านฟังก์ชันด้านล่างเท่านั้น
create policy "read shift swaps" on public.shift_swaps for select to authenticated using (
  (select private.is_admin())
  or requester_id = (select private.my_employee_id())
  or target_id = (select private.my_employee_id())
  or private.is_my_team(requester_id)
  or private.is_my_team(target_id)
);

-- กะของพนักงานในวันหนึ่ง ก่อนคิดการแลกกะ: จัดกะเฉพาะวัน → วันหยุดบริษัท → วันหยุดประจำสัปดาห์ → กะประจำ
create or replace function private.base_shift_on(emp uuid, d date)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  sid uuid;
  e record;
  is_holiday boolean;
begin
  select shift_id into sid from public.shift_assignments where employee_id = emp and work_date = d;
  if found then return sid; end if;
  -- ใช้ปฏิทินวันหยุดรายคนของระบบลาถ้ามี ไม่งั้นใช้วันหยุดบริษัทร่วมกัน
  if to_regprocedure('private.is_holiday_for(uuid, date)') is not null then
    execute 'select private.is_holiday_for($1, $2)' into is_holiday using emp, d;
  else
    select exists (select 1 from public.holidays where holiday_date = d) into is_holiday;
  end if;
  if coalesce(is_holiday, false) then return null; end if;
  select default_shift_id, days_off into e from public.employees where id = emp;
  if extract(dow from d)::smallint = any (e.days_off) then return null; end if;
  return e.default_shift_id;
end $$;

-- รายชื่อเพื่อนร่วมงานที่ขอแลกกะด้วยได้ พร้อมกะของวันนั้น (ชื่อและกะเท่านั้น ไม่เปิดข้อมูลอื่น)
create or replace function public.swap_candidates(d date)
returns table (id uuid, code text, first_name text, last_name text, shift_id uuid)
language sql stable security definer set search_path = '' as $$
  select e.id, e.code, e.first_name, e.last_name, private.base_shift_on(e.id, d)
  from public.employees e
  where e.active and e.id <> private.my_employee_id() and private.my_employee_id() is not null
  order by e.code
$$;

-- กะของฉันในวันนั้น (ใช้แสดงในฟอร์ม)
create or replace function public.my_shift_on(d date)
returns uuid language sql stable security definer set search_path = '' as $$
  select private.base_shift_on(private.my_employee_id(), d)
$$;

-- คนนี้มีคำขอแลกกะที่ยังค้างหรืออนุมัติแล้วในวันนั้นอยู่หรือไม่
create or replace function private.has_active_swap(emp uuid, d date, except_id uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shift_swaps s
    where s.work_date = d and (s.requester_id = emp or s.target_id = emp)
      and s.status in ('pending_peer', 'pending_approval', 'approved')
      and (except_id is null or s.id <> except_id)
  )
$$;

-- ส่งคำขอแลกกะ
create or replace function public.request_shift_swap(target uuid, d date, why text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_employee_id();
  my_shift uuid;
  their_shift uuid;
  new_id uuid;
begin
  if me is null then raise exception 'บัญชีของคุณยังไม่ได้ผูกกับข้อมูลพนักงาน'; end if;
  if target is null or target = me then raise exception 'กรุณาเลือกเพื่อนร่วมงานที่จะแลกกะด้วย'; end if;
  if not exists (select 1 from public.employees where id = target and active) then raise exception 'ไม่พบพนักงานที่เลือก'; end if;
  if d is null or d < (now() at time zone 'Asia/Bangkok')::date then raise exception 'ขอแลกกะได้เฉพาะวันนี้หรือวันข้างหน้า'; end if;
  if coalesce(trim(why), '') = '' then raise exception 'กรุณาใส่เหตุผล'; end if;
  my_shift := private.base_shift_on(me, d);
  their_shift := private.base_shift_on(target, d);
  if my_shift is not distinct from their_shift then
    raise exception 'วันนั้นคุณกับเพื่อนอยู่กะเดียวกัน (หรือหยุดทั้งคู่) ไม่ต้องแลก';
  end if;
  if private.has_active_swap(me, d) then raise exception 'คุณมีคำขอแลกกะของวันนั้นอยู่แล้ว'; end if;
  if private.has_active_swap(target, d) then raise exception 'เพื่อนคนนี้มีคำขอแลกกะของวันนั้นอยู่แล้ว'; end if;
  insert into public.shift_swaps (work_date, requester_id, target_id, requester_shift_id, target_shift_id, reason)
    values (d, me, target, my_shift, their_shift, trim(why))
    returning id into new_id;
  return new_id;
end $$;

-- คนที่ถูกขอแลก ตอบรับ / ปฏิเสธ
create or replace function public.respond_shift_swap(swap_id uuid, accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.shift_swaps;
begin
  select * into r from public.shift_swaps where id = swap_id for update;
  if not found then raise exception 'ไม่พบคำขอแลกกะ'; end if;
  if r.target_id is distinct from private.my_employee_id() then raise exception 'คำขอนี้ไม่ได้ส่งถึงคุณ'; end if;
  if r.status <> 'pending_peer' then raise exception 'คำขอนี้ตอบไปแล้ว'; end if;
  if accept then
    update public.shift_swaps set status = 'pending_approval', peer_at = now() where id = swap_id;
  else
    update public.shift_swaps set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = 'เพื่อนไม่สะดวกแลก' where id = swap_id;
  end if;
end $$;

-- อนุมัติ / ไม่อนุมัติ
-- step = 'manager': ผู้จัดการของผู้ขอหรือของเพื่อน หรือ CEO
-- step = 'accounting': บัญชี หรือ CEO
-- คนที่อยู่ในคำขอเองอนุมัติไม่ได้ อนุมัติครบสองขั้นแล้วมีผลทันที
create or replace function public.decide_shift_swap(swap_id uuid, step text, approve boolean, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.shift_swaps;
  my_role public.app_role := private.my_role();
  me uuid := private.my_employee_id();
begin
  select * into r from public.shift_swaps where id = swap_id for update;
  if not found then raise exception 'ไม่พบคำขอแลกกะ'; end if;
  if r.status <> 'pending_approval' then raise exception 'คำขอนี้ไม่อยู่ในสถานะรออนุมัติ'; end if;
  if me is not null and (me = r.requester_id or me = r.target_id) then raise exception 'อนุมัติคำขอแลกกะของตัวเองไม่ได้'; end if;

  if step = 'manager' then
    if not (my_role = 'ceo' or private.is_my_team(r.requester_id) or private.is_my_team(r.target_id)) then
      raise exception 'เฉพาะหัวหน้างานของพนักงานหรือ CEO';
    end if;
    if r.manager_at is not null then raise exception 'หัวหน้างานอนุมัติไปแล้ว'; end if;
  elsif step = 'accounting' then
    if my_role not in ('accounting', 'ceo') then raise exception 'เฉพาะฝ่ายบัญชีหรือ CEO'; end if;
    if r.accounting_at is not null then raise exception 'ฝ่ายบัญชีอนุมัติไปแล้ว'; end if;
  else
    raise exception 'ขั้นการอนุมัติไม่ถูกต้อง';
  end if;

  if not approve then
    update public.shift_swaps set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = note where id = swap_id;
    return;
  end if;

  if step = 'manager' then
    update public.shift_swaps set manager_by = auth.uid(), manager_at = now() where id = swap_id returning * into r;
  else
    update public.shift_swaps set accounting_by = auth.uid(), accounting_at = now() where id = swap_id returning * into r;
  end if;

  if r.manager_at is not null and r.accounting_at is not null then
    -- ใช้กะล่าสุดของทั้งสองคน ณ ตอนอนุมัติ เผื่อมีการเปลี่ยนกะระหว่างรอ
    update public.shift_swaps
      set status = 'approved',
          requester_shift_id = private.base_shift_on(r.requester_id, r.work_date),
          target_shift_id = private.base_shift_on(r.target_id, r.work_date),
          decision_note = coalesce(note, decision_note)
      where id = swap_id;
  end if;
end $$;

-- ยกเลิก: ผู้ขอยกเลิกได้ก่อนอนุมัติครบ CEO/บัญชียกเลิกได้ทุกสถานะ (รวมที่อนุมัติแล้ว = กลับไปใช้กะเดิม)
create or replace function public.cancel_shift_swap(swap_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.shift_swaps;
begin
  select * into r from public.shift_swaps where id = swap_id for update;
  if not found then raise exception 'ไม่พบคำขอแลกกะ'; end if;
  if r.status in ('rejected', 'cancelled') then raise exception 'คำขอนี้จบไปแล้ว'; end if;
  if not (
    private.is_admin()
    or (r.requester_id = private.my_employee_id() and r.status in ('pending_peer', 'pending_approval'))
  ) then
    raise exception 'ไม่มีสิทธิ์ยกเลิกคำขอนี้';
  end if;
  update public.shift_swaps set status = 'cancelled', decided_by = auth.uid(), decided_at = now() where id = swap_id;
end $$;

revoke execute on function private.base_shift_on(uuid, date) from public, anon, authenticated;
revoke execute on function private.has_active_swap(uuid, date, uuid) from public, anon, authenticated;
revoke execute on function public.swap_candidates(date) from public, anon;
revoke execute on function public.my_shift_on(date) from public, anon;
revoke execute on function public.request_shift_swap(uuid, date, text) from public, anon;
revoke execute on function public.respond_shift_swap(uuid, boolean) from public, anon;
revoke execute on function public.decide_shift_swap(uuid, text, boolean, text) from public, anon;
revoke execute on function public.cancel_shift_swap(uuid) from public, anon;
grant execute on function public.swap_candidates(date) to authenticated;
grant execute on function public.my_shift_on(date) to authenticated;
grant execute on function public.request_shift_swap(uuid, date, text) to authenticated;
grant execute on function public.respond_shift_swap(uuid, boolean) to authenticated;
grant execute on function public.decide_shift_swap(uuid, text, boolean, text) to authenticated;
grant execute on function public.cancel_shift_swap(uuid) to authenticated;

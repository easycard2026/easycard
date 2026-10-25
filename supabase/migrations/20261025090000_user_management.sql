-- จัดการผู้ใช้: สร้างบัญชี ผูกกับพนักงาน กำหนด Role รีเซ็ตรหัสผ่าน ปิด/เปิดบัญชี และเปลี่ยนรหัสผ่านเอง
-- ทำในฐานข้อมูลทั้งหมด (security definer) จึงไม่ต้องเก็บ service role key ไว้ในเว็บ
-- CEO จัดการได้ทุกบัญชี / บัญชีจัดการได้เฉพาะ Role ผู้จัดการและพนักงาน

alter table public.profiles
  add column if not exists email text,
  add column if not exists active boolean not null default true,
  add column if not exists must_change_password boolean not null default false;

update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), new.email);
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- บัญชีที่ถูกปิดหมดสิทธิ์ทันที แม้ token เดิมยังไม่หมดอายุ
create or replace function private.my_role()
returns public.app_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function private.my_employee_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select employee_id from public.profiles where id = (select auth.uid()) and active
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.profiles where id = (select auth.uid()) and active) in ('ceo', 'accounting'), false)
$$;

create or replace function private.is_my_team(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    join public.profiles p on p.employee_id = e.manager_id
    where e.id = emp and p.id = (select auth.uid()) and p.role = 'manager' and p.active
  )
$$;

-- ผู้เรียกจัดการบัญชีที่มี Role นี้ได้ไหม
create or replace function private.can_manage_role(r public.app_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select case private.my_role()
    when 'ceo' then true
    when 'accounting' then r in ('manager', 'employee')
    else false end
$$;

create or replace function private.check_password(pw text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if pw is null or length(pw) < 8 then raise exception 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว'; end if;
  if length(pw) > 72 then raise exception 'รหัสผ่านยาวเกินไป'; end if;
end $$;

create or replace function private.check_employee_link(emp uuid, uid uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if emp is null then return; end if;
  if not exists (select 1 from public.employees where id = emp) then raise exception 'ไม่พบข้อมูลพนักงานที่เลือก'; end if;
  if exists (select 1 from public.profiles where employee_id = emp and id is distinct from uid) then
    raise exception 'พนักงานคนนี้มีบัญชีผู้ใช้อยู่แล้ว';
  end if;
end $$;

-- ตัดการเข้าสู่ระบบที่ค้างอยู่ของบัญชี
create or replace function private.end_sessions(uid uuid)
returns void language sql security definer set search_path = '' as $$
  delete from auth.sessions where user_id = uid;
$$;

-- รายชื่อผู้ใช้ (CEO/บัญชี)
create or replace function public.list_users()
returns table (
  id uuid, email text, display_name text, role public.app_role, employee_id uuid,
  active boolean, must_change_password boolean, last_sign_in_at timestamptz, created_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception 'ไม่มีสิทธิ์'; end if;
  return query
    select p.id, coalesce(p.email, u.email)::text, p.display_name, p.role, p.employee_id,
           p.active, p.must_change_password, u.last_sign_in_at, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.active desc, p.role, p.display_name;
end $$;

create or replace function public.admin_create_user(
  p_email text, p_password text, p_role public.app_role, p_employee_id uuid, p_display_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := gen_random_uuid();
  mail text := lower(trim(p_email));
  name text := nullif(trim(p_display_name), '');
begin
  if not private.can_manage_role(p_role) then raise exception 'คุณไม่มีสิทธิ์สร้างบัญชี Role นี้'; end if;
  if mail is null or mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ชื่อผู้ใช้หรืออีเมลไม่ถูกต้อง'; end if;
  if exists (select 1 from auth.users where lower(email) = mail) then raise exception 'มีบัญชีที่ใช้ชื่อนี้แล้ว'; end if;
  perform private.check_password(p_password);
  perform private.check_employee_link(p_employee_id, null);
  if name is null and p_employee_id is not null then
    select first_name || ' ' || last_name into name from public.employees where id = p_employee_id;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', coalesce(name, mail)),
    now(), now(), '', '', '', '', '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, 'email',
          jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), now(), now(), now());

  update public.profiles
    set role = p_role, employee_id = p_employee_id, display_name = coalesce(name, mail),
        email = mail, must_change_password = true
    where id = uid;
  return uid;
end $$;

create or replace function public.admin_update_user(
  p_user uuid, p_role public.app_role, p_employee_id uuid, p_display_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare cur public.profiles;
begin
  select * into cur from public.profiles where id = p_user for update;
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;
  if not (private.can_manage_role(cur.role) and private.can_manage_role(p_role)) then
    raise exception 'คุณไม่มีสิทธิ์แก้บัญชีนี้หรือให้ Role นี้';
  end if;
  if p_user = auth.uid() and p_role <> cur.role then raise exception 'เปลี่ยน Role ของตัวเองไม่ได้'; end if;
  perform private.check_employee_link(p_employee_id, p_user);
  update public.profiles
    set role = p_role, employee_id = p_employee_id,
        display_name = coalesce(nullif(trim(p_display_name), ''), display_name)
    where id = p_user;
end $$;

-- ตั้งรหัสผ่านชั่วคราวให้ผู้ใช้ (ผู้ใช้ต้องเปลี่ยนเองตอนเข้าครั้งถัดไป)
create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.app_role;
begin
  select role into r from public.profiles where id = p_user;
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;
  if p_user = auth.uid() then raise exception 'เปลี่ยนรหัสผ่านของตัวเองที่หน้า "บัญชีของฉัน"'; end if;
  if not private.can_manage_role(r) then raise exception 'คุณไม่มีสิทธิ์รีเซ็ตรหัสผ่านบัญชีนี้'; end if;
  perform private.check_password(p_password);
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now()
    where id = p_user;
  update public.profiles set must_change_password = true where id = p_user;
  perform private.end_sessions(p_user);
end $$;

create or replace function public.admin_set_active(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.app_role;
begin
  select role into r from public.profiles where id = p_user;
  if not found then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;
  if p_user = auth.uid() then raise exception 'ปิดบัญชีของตัวเองไม่ได้'; end if;
  if not private.can_manage_role(r) then raise exception 'คุณไม่มีสิทธิ์เปิด/ปิดบัญชีนี้'; end if;
  update public.profiles set active = p_active where id = p_user;
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end, updated_at = now()
    where id = p_user;
  if not p_active then perform private.end_sessions(p_user); end if;
end $$;

-- ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง (ต้องใส่รหัสเดิม)
create or replace function public.change_my_password(p_current text, p_new text)
returns void language plpgsql security definer set search_path = '' as $$
declare hash text;
begin
  select encrypted_password into hash from auth.users where id = auth.uid();
  if hash is null then raise exception 'ไม่พบบัญชีผู้ใช้'; end if;
  if extensions.crypt(coalesce(p_current, ''), hash) <> hash then raise exception 'รหัสผ่านเดิมไม่ถูกต้อง'; end if;
  perform private.check_password(p_new);
  if p_new = p_current then raise exception 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_new, extensions.gen_salt('bf')), updated_at = now()
    where id = auth.uid();
  update public.profiles set must_change_password = false where id = auth.uid();
end $$;

revoke execute on function public.list_users() from public, anon;
revoke execute on function public.admin_create_user(text, text, public.app_role, uuid, text) from public, anon;
revoke execute on function public.admin_update_user(uuid, public.app_role, uuid, text) from public, anon;
revoke execute on function public.admin_reset_password(uuid, text) from public, anon;
revoke execute on function public.admin_set_active(uuid, boolean) from public, anon;
revoke execute on function public.change_my_password(text, text) from public, anon;
grant execute on function public.list_users() to authenticated;
grant execute on function public.admin_create_user(text, text, public.app_role, uuid, text) to authenticated;
grant execute on function public.admin_update_user(uuid, public.app_role, uuid, text) to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.admin_set_active(uuid, boolean) to authenticated;
grant execute on function public.change_my_password(text, text) to authenticated;

revoke execute on function private.end_sessions(uuid) from public, anon, authenticated;
grant execute on function private.can_manage_role(public.app_role) to authenticated;
grant execute on function private.check_password(text) to authenticated;
grant execute on function private.check_employee_link(uuid, uuid) to authenticated;

-- แก้ profile ได้เฉพาะผ่านฟังก์ชันด้านบน (กันไม่ให้แก้ active / must_change_password ตรงๆ)
drop policy if exists "ceo update profiles" on public.profiles;

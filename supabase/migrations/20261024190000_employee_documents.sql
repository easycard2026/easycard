-- เอกสารพนักงาน (สำเนาบัตรประชาชน สัญญาจ้าง ใบรับรอง ฯลฯ)
-- ไฟล์เก็บใน Supabase Storage bucket ส่วนตัว "employee-documents" ที่ path <employee_id>/<ชื่อไฟล์>
-- สิทธิ์: CEO/บัญชี ดูและอัปโหลดได้ทุกคน, ผู้จัดการดูของลูกทีม, พนักงานดูและอัปโหลดของตัวเอง
-- ลบ: CEO/บัญชี หรือพนักงานลบไฟล์ที่ตัวเองอัปโหลดเอง

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null default 'other'
    check (category in ('id_card', 'house_registration', 'contract', 'education', 'certificate', 'medical', 'bank', 'other')),
  title text not null check (length(title) between 1 and 200),
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check (file_path like employee_id::text || '/%')
);
create index on public.employee_documents (employee_id, created_at desc);
create index on public.employee_documents (uploaded_by);

-- ใครดูเอกสารของพนักงานคนนี้ได้
create or replace function private.can_view_employee(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select emp is not null and (
    private.is_admin() or emp = private.my_employee_id() or private.is_my_team(emp)
  )
$$;

-- ใครอัปโหลดเอกสารให้พนักงานคนนี้ได้
create or replace function private.can_upload_employee_doc(emp uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select emp is not null and (private.is_admin() or emp = private.my_employee_id())
$$;

-- อ่าน employee_id จากโฟลเดอร์แรกของ path ใน Storage (ไม่ใช่ uuid = null)
create or replace function private.doc_folder_employee(path text)
returns uuid language sql immutable set search_path = '' as $$
  select case when split_part(path, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(path, '/', 1)::uuid end
$$;

grant execute on all functions in schema private to authenticated;

alter table public.employee_documents enable row level security;

create policy "read employee documents" on public.employee_documents for select to authenticated
  using (private.can_view_employee(employee_id));
create policy "upload employee documents" on public.employee_documents for insert to authenticated
  with check (private.can_upload_employee_doc(employee_id) and uploaded_by = (select auth.uid()));
create policy "delete employee documents" on public.employee_documents for delete to authenticated
  using (
    (select private.is_admin())
    or (employee_id = (select private.my_employee_id()) and uploaded_by = (select auth.uid()))
  );

-- ===================== Storage =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'employee-documents', 'employee-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do nothing;

create policy "employee docs: read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-documents' and private.can_view_employee(private.doc_folder_employee(name)));
create policy "employee docs: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-documents' and private.can_upload_employee_doc(private.doc_folder_employee(name)));
create policy "employee docs: delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-documents' and (
      (select private.is_admin())
      or (private.doc_folder_employee(name) = (select private.my_employee_id()) and owner_id = (select auth.uid())::text)
    )
  );

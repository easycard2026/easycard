-- ประกาศบริษัท: ข้อความ + รูปแนบ ทุกคนอ่านได้ CEO/บัญชีสร้าง แก้ และลบได้
-- รูปเก็บใน Supabase Storage bucket ส่วนตัว "announcement-images" ที่ path <announcement_id>/<ชื่อไฟล์>

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null default '' check (length(body) <= 10000),
  image_paths text[] not null default '{}' check (cardinality(image_paths) <= 10),
  pinned boolean not null default false,          -- ปักหมุดไว้บนสุด
  show_in_ticker boolean not null default true,   -- ขึ้นแถบข้อความเลื่อน
  expires_on date,                                -- เลิกขึ้นแถบเลื่อนหลังวันนี้ (ว่าง = ไม่มีกำหนด)
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.announcements (pinned desc, created_at desc);
create index on public.announcements (created_by);

create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger announcements_touch before update on public.announcements
  for each row execute function private.touch_updated_at();

alter table public.announcements enable row level security;

create policy "read announcements" on public.announcements for select to authenticated using (true);
create policy "admin insert announcements" on public.announcements for insert to authenticated
  with check ((select private.is_admin()));
create policy "admin update announcements" on public.announcements for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admin delete announcements" on public.announcements for delete to authenticated
  using ((select private.is_admin()));

-- ===================== Storage =====================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-images', 'announcement-images', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "announcement images: read" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-images');
create policy "announcement images: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-images' and (select private.is_admin()));
create policy "announcement images: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-images' and (select private.is_admin()));

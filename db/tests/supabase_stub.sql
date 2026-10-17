-- Stub mínimo de Supabase para probar las migraciones en un Postgres local (Docker).
-- Imita lo que las migraciones usan: roles, auth.uid(), auth.jwt(), auth.users, storage y la publicación de Realtime.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid, created_at timestamptz default now());
alter table storage.objects enable row level security;

grant usage on schema public, storage to anon, authenticated, service_role;
grant all on all tables in schema storage to anon, authenticated, service_role;
-- Igual que Supabase: privilegios por defecto amplios; RLS y los REVOKE de las migraciones restringen.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create publication supabase_realtime;

-- v2 simulada (para probar 0001 y 0002 sobre un proyecto como el actual)
create table public.categories (id uuid primary key, slug text unique, name_en text);
create table public.admin_users (id uuid primary key, username text, password_hash text);
alter table public.categories enable row level security;
alter table public.admin_users enable row level security;
create policy "Enable all for all users" on public.categories for all to public using (true) with check (true);
create policy "Enable read for all" on public.admin_users for select to public using (true);
create policy "Allow public deletes" on storage.objects for delete to public using (bucket_id = 'product-images');
create policy "Public Upload" on storage.objects for insert to public with check (bucket_id = 'product-images');
insert into public.categories values ('3353baa5-aede-4081-8a4c-796aa2182d68', 'trending', 'Trending');
insert into public.admin_users values (gen_random_uuid(), 'admin', 'texto-plano');
create function public.verify_admin_password(p_username text, p_password text) returns json
  language sql security definer as $$ select json_build_object('valid', false) $$;

insert into auth.users (id, email) values
  ('09b5dce9-55d8-4859-844e-47bae15d71fd', 'owner@test.local'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'staff@test.local');

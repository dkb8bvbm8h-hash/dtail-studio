-- D-Tail Studio 4.0 Supabase schema
create extension if not exists pgcrypto;

create table if not exists public.customers(
 id text primary key,user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,phone text default '',email text default '',note text default '',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.cars(
 id text primary key,user_id uuid not null references auth.users(id) on delete cascade,
 customer_id text not null references public.customers(id) on delete cascade,
 make_model text not null,plate text default '',year integer,color text default '',km integer default 0,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.jobs(
 id text primary key,user_id uuid not null references auth.users(id) on delete cascade,
 customer_id text references public.customers(id) on delete set null,car_id text references public.cars(id) on delete set null,
 customer_name text not null,phone text default '',car_label text not null,plate text default '',year integer,km integer default 0,
 service_id text not null,service_name text not null,service_price numeric(12,2) not null default 0,
 extras jsonb not null default '[]'::jsonb,discount numeric(12,2) not null default 0,cost numeric(12,2) not null default 0,total numeric(12,2) not null default 0,
 status text not null default 'open' check(status in('open','closed')),payment_method text default '',note text default '',
 checklist jsonb not null default '{}'::jsonb,start_at timestamptz not null,end_at timestamptz not null,timer_seconds integer not null default 0,
 timer_started_at timestamptz,closed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.inventory(
 id text primary key,user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,category text default 'Egyéb',qty numeric(12,3) not null default 0,unit text not null default 'db',
 min_qty numeric(12,3) not null default 0,unit_price numeric(12,2) not null default 0,updated_at timestamptz not null default now()
);
create table if not exists public.studio_settings(user_id uuid primary key references auth.users(id) on delete cascade,monthly_goal numeric(12,2) not null default 1000000,updated_at timestamptz not null default now());
create table if not exists public.job_photos(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,job_id text not null references public.jobs(id) on delete cascade,label text default 'Fotó',storage_path text not null,created_at timestamptz not null default now());

alter table public.customers enable row level security;
alter table public.cars enable row level security;
alter table public.jobs enable row level security;
alter table public.inventory enable row level security;
alter table public.studio_settings enable row level security;
alter table public.job_photos enable row level security;

drop policy if exists customers_owner on public.customers;
drop policy if exists cars_owner on public.cars;
drop policy if exists jobs_owner on public.jobs;
drop policy if exists inventory_owner on public.inventory;
drop policy if exists settings_owner on public.studio_settings;
drop policy if exists photos_owner on public.job_photos;

create policy customers_owner on public.customers for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy cars_owner on public.cars for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy jobs_owner on public.jobs for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy inventory_owner on public.inventory for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy settings_owner on public.studio_settings for all using(auth.uid()=user_id) with check(auth.uid()=user_id);
create policy photos_owner on public.job_photos for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

insert into storage.buckets(id,name,public) values('job-photos','job-photos',false) on conflict(id) do nothing;
drop policy if exists job_photos_select on storage.objects;
drop policy if exists job_photos_insert on storage.objects;
drop policy if exists job_photos_update on storage.objects;
drop policy if exists job_photos_delete on storage.objects;
create policy job_photos_select on storage.objects for select to authenticated using(bucket_id='job-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy job_photos_insert on storage.objects for insert to authenticated with check(bucket_id='job-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy job_photos_update on storage.objects for update to authenticated using(bucket_id='job-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='job-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy job_photos_delete on storage.objects for delete to authenticated using(bucket_id='job-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create index if not exists idx_jobs_user_start on public.jobs(user_id,start_at desc);
create index if not exists idx_inventory_user on public.inventory(user_id,name);
create index if not exists idx_cars_user_customer on public.cars(user_id,customer_id);
create index if not exists idx_photos_job on public.job_photos(user_id,job_id,created_at);

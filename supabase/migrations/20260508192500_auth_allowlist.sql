create extension if not exists pgcrypto;

create table if not exists public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);

alter table public.allowed_users enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "Profiles are readable by owner" on public.profiles;

create policy "Profiles are readable by owner"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

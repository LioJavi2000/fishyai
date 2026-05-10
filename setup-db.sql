-- Run this entire file in your Supabase SQL editor at:
-- https://supabase.com/dashboard/project/spckbmbbtusnvwopuxjc/sql

-- ── EXTENSIONS ──
create extension if not exists "uuid-ossp";

-- ── TABLES ──

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  avatar_url text,
  bio text,
  created_at timestamptz default now()
);

create table if not exists public.spots (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz default now()
);

create table if not exists public.catches (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  species text not null,
  confidence integer,
  weight_lbs numeric(6,2),
  length_in numeric(6,2),
  lure_used text,
  kept boolean default false,
  spot_id uuid references public.spots,
  spot_name text,
  photo_url text,
  is_public boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.likes (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  catch_id uuid references public.catches on delete cascade not null,
  created_at timestamptz default now(),
  unique(user_id, catch_id)
);

create table if not exists public.follows (
  id uuid default uuid_generate_v4() primary key,
  follower_id uuid references auth.users on delete cascade not null,
  following_id uuid references auth.users on delete cascade not null,
  created_at timestamptz default now(),
  unique(follower_id, following_id)
);

-- ── ROW LEVEL SECURITY ──

alter table public.profiles enable row level security;
alter table public.spots enable row level security;
alter table public.catches enable row level security;
alter table public.likes enable row level security;
alter table public.follows enable row level security;

-- Profiles
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Spots
create policy "Spots are viewable by everyone" on public.spots for select using (true);
create policy "Authenticated users can insert spots" on public.spots for insert with check (auth.role() = 'authenticated');

-- Catches
create policy "Public catches viewable by everyone" on public.catches for select using (is_public = true or auth.uid() = user_id);
create policy "Users can insert their own catches" on public.catches for insert with check (auth.uid() = user_id);
create policy "Users can update their own catches" on public.catches for update using (auth.uid() = user_id);
create policy "Users can delete their own catches" on public.catches for delete using (auth.uid() = user_id);

-- Likes
create policy "Likes viewable by everyone" on public.likes for select using (true);
create policy "Authenticated users can like" on public.likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike" on public.likes for delete using (auth.uid() = user_id);

-- Follows
create policy "Follows viewable by everyone" on public.follows for select using (true);
create policy "Authenticated users can follow" on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow" on public.follows for delete using (auth.uid() = follower_id);

-- ── AUTO-CREATE PROFILE ON SIGNUP ──

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── SAMPLE SOUTHERN CALIFORNIA FISHING SPOTS ──

insert into public.spots (name, lat, lng) values
  ('Lake Elsinore South Cove', 33.6559, -117.3480),
  ('Prado Basin East Shore', 33.8670, -117.6354),
  ('Santa Monica Pier', 34.0083, -118.4983),
  ('Santa Ana River Bend', 33.8347, -117.8947),
  ('Corona Lake South', 33.8100, -117.5700),
  ('Big Bear Lake Marina', 34.2399, -116.8963),
  ('Castaic Lake South Cove', 34.4893, -118.6063),
  ('Lake Perris Recreation Area', 33.8550, -117.1720),
  ('Lake Skinner', 33.6158, -117.0685),
  ('Dixon Lake', 33.1734, -117.0694),
  ('San Vicente Reservoir', 32.9300, -116.9200),
  ('Otay Lakes', 32.6100, -116.9700)
on conflict do nothing;

-- ── STORAGE ──
-- After running this SQL, go to Storage in your Supabase dashboard and:
-- 1. Create a bucket named "catches"
-- 2. Set it to Public
-- 3. Add policy: allow authenticated users to upload (INSERT) to their own folder (user_id/*)

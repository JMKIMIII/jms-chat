-- Enable Realtime
begin;
  drop publication if exists supabase_realtime;
  create publication supabase_realtime;
commit;

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  full_name text,
  avatar_url text,
  preferred_language text default 'ko',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

-- Channels table
create table public.channels (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.channels enable row level security;
create policy "Channels are viewable by everyone." on channels for select using (true);

-- Messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  channel_id uuid references public.channels on delete cascade not null,
  user_id uuid references public.profiles on delete cascade not null,
  original_text text not null,
  detected_language text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);
alter table public.messages enable row level security;
create policy "Messages are viewable by everyone." on messages for select using (true);
create policy "Users can insert messages." on messages for insert with check (auth.uid() = user_id);

alter publication supabase_realtime add table public.messages;

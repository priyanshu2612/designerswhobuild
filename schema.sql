-- ═══════════════════════════════════════════════════
--  designerswhobuild.com — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════

-- ── 1. Profiles ───────────────────────────────────
--  Stores every builder profile.
--  auth_id links to a real Supabase Auth user once they sign up.
--  Pre-seeded rows have auth_id = NULL (they're public profiles).
-- ──────────────────────────────────────────────────
create table if not exists profiles (
  id               uuid default gen_random_uuid() primary key,
  auth_id          uuid references auth.users(id) unique,   -- null = pre-seeded builder
  name             text not null,
  handle           text unique,
  avatar_url       text,
  role             text,            -- "Product Designer"
  company          text,            -- "CRED"
  experience_years int,
  bio              text,
  linkedin_url     text,
  twitter_url      text,
  portfolio_url    text,
  cover_url        text,
  total_projects   int default 0,
  live_projects    int default 0,
  rank             int,
  tags             text[] default '{}',
  created_at       timestamptz default now()
);

-- ── 2. Posts ──────────────────────────────────────
--  One row per build/project. Supports full feed cards
--  (featured=true) and compact listing cards.
-- ──────────────────────────────────────────────────
create table if not exists posts (
  id               uuid default gen_random_uuid() primary key,
  profile_id       uuid references profiles(id) on delete cascade not null,
  title            text not null,
  app_name         text,            -- short name for compact cards
  description      text,
  status           text check (status in ('live','wip','concept')) default 'wip',
  category         text,            -- 'iOS app' | 'macOS' | 'Web' | 'Games' | 'Interactive'
  helpful_tags     text[] default '{}',   -- ['utility','fun','productivity','self-care']
  live_url         text,
  journey_url      text,
  thumbnail_url    text,            -- icon/thumbnail for compact listing cards
  media_layout     text default 'single', -- 'single' | '5grid' | 'carousel' | 'video'
  media_urls       text[] default '{}',
  media_video_url  text,
  tools_used       jsonb default '[]',    -- [{name, icon_url}]
  tools_count      int default 0,
  views_count      int default 0,
  source           text,            -- 'LinkedIn' | 'Twitter'
  reactions_teach_me  int default 0,
  reactions_buy_this  int default 0,
  reactions_use_this  int default 0,
  featured         boolean default false,  -- shows up in Feed as full card
  created_at       timestamptz default now()
);

-- ── 3. Reactions ──────────────────────────────────
create table if not exists reactions (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references posts(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  type       text check (type in ('teach_me','buy_this','use_this')) not null,
  created_at timestamptz default now(),
  unique (post_id, profile_id, type)
);

-- ── 4. Comments ───────────────────────────────────
create table if not exists comments (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references posts(id) on delete cascade not null,
  profile_id uuid references profiles(id) on delete cascade not null,
  content    text not null,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════════
--  Row Level Security
-- ═══════════════════════════════════════════════════
alter table profiles  enable row level security;
alter table posts      enable row level security;
alter table reactions  enable row level security;
alter table comments   enable row level security;

-- profiles: public read; only owner can write
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth_id = auth.uid());
create policy "profiles_update" on profiles for update using (auth_id = auth.uid());

-- posts: public read; only the post owner's profile can write
create policy "posts_select" on posts for select using (true);
create policy "posts_insert" on posts for insert with check (
  profile_id in (select id from profiles where auth_id = auth.uid())
);
create policy "posts_update" on posts for update using (
  profile_id in (select id from profiles where auth_id = auth.uid())
);

-- reactions: public read; authed users can react (via their profile)
create policy "reactions_select" on reactions for select using (true);
create policy "reactions_insert" on reactions for insert with check (
  auth.uid() is not null
  and profile_id in (select id from profiles where auth_id = auth.uid())
);
create policy "reactions_delete" on reactions for delete using (
  profile_id in (select id from profiles where auth_id = auth.uid())
);

-- comments: public read; authed users can comment
create policy "comments_select" on comments for select using (true);
create policy "comments_insert" on comments for insert with check (
  auth.uid() is not null
  and profile_id in (select id from profiles where auth_id = auth.uid())
);
create policy "comments_delete" on comments for delete using (
  profile_id in (select id from profiles where auth_id = auth.uid())
);

-- ═══════════════════════════════════════════════════
--  Trigger: auto-create profile on signup
-- ═══════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (auth_id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (auth_id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ═══════════════════════════════════════════════════
--  Trigger: keep reaction count columns in sync
-- ═══════════════════════════════════════════════════
create or replace function update_reaction_counts()
returns trigger language plpgsql as $$
begin
  if TG_OP = 'INSERT' then
    update posts set
      reactions_teach_me = reactions_teach_me + (case when new.type='teach_me' then 1 else 0 end),
      reactions_buy_this  = reactions_buy_this  + (case when new.type='buy_this'  then 1 else 0 end),
      reactions_use_this  = reactions_use_this  + (case when new.type='use_this'  then 1 else 0 end)
    where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update posts set
      reactions_teach_me = greatest(0, reactions_teach_me - (case when old.type='teach_me' then 1 else 0 end)),
      reactions_buy_this  = greatest(0, reactions_buy_this  - (case when old.type='buy_this'  then 1 else 0 end)),
      reactions_use_this  = greatest(0, reactions_use_this  - (case when old.type='use_this'  then 1 else 0 end))
    where id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger reaction_count_trigger
  after insert or delete on reactions
  for each row execute procedure update_reaction_counts();

-- ═══════════════════════════════════════════════════
--  Seed Data — Profiles (8 builders)
-- ═══════════════════════════════════════════════════
insert into profiles (id, name, handle, avatar_url, role, company, experience_years, total_projects, live_projects, rank, tags) values
  ('11111111-0000-0000-0000-000000000001', 'Priyanshu Barnwal', 'priyanshu', 'https://ik.imagekit.io/424h6me27c/1720635179303.jpeg', 'Product Designer',      'Zomato',         4, 12, 7,  1, array['4 Apps','1 Games','1 Interactions']),
  ('11111111-0000-0000-0000-000000000002', 'Priya Menon',       'priya',     'https://ik.imagekit.io/424h6me27c/1774526753952.jpeg', 'UX Designer',           'Razorpay',       3,  9, 4,  2, array['3 Apps','2 Web','1 macOS']),
  ('11111111-0000-0000-0000-000000000003', 'Arjun Sethi',       'arjun',     'https://ik.imagekit.io/424h6me27c/1758728645137.jpeg', 'Interaction Designer',  'CRED',           5, 15, 5,  3, array['5 Apps','3 Interactions']),
  ('11111111-0000-0000-0000-000000000004', 'Neha Kapoor',       'neha',      'https://ik.imagekit.io/424h6me27c/1669709292471.jpeg', 'Visual Designer',       'Flipkart',       4,  8, 3,  4, array['2 Apps','2 Web','1 Games']),
  ('11111111-0000-0000-0000-000000000005', 'Rohan Verma',       'rohan',     'https://ik.imagekit.io/424h6me27c/1746609724722.jpeg', 'Product Designer',      'Swiggy',         3, 11, 6,  5, array['4 Apps','2 Interactions']),
  ('11111111-0000-0000-0000-000000000006', 'Sana Mirza',        'sana',      'https://ik.imagekit.io/424h6me27c/1745770693685.jpeg', 'UI Designer',           'Meesho',         2,  6, 2,  6, array['3 Apps','1 macOS']),
  ('11111111-0000-0000-0000-000000000007', 'Gowtham Oleti',     'gowtham',   'https://ik.imagekit.io/424h6me27c/1745770693685.jpeg', 'Product Designer',      'CRED',           4, 18, 8,  7, array['6 Apps','2 Interactions']),
  ('11111111-0000-0000-0000-000000000008', 'Sagar Bhardwaj',    'sagar',     'https://ik.imagekit.io/424h6me27c/1593694785946.jpeg', 'Lead Product Designer', 'Urban Company',  6, 22, 10, 8, array['8 Apps','2 Web'])
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════
--  Seed Data — Posts (4 featured feed cards)
-- ═══════════════════════════════════════════════════
insert into posts (
  id, profile_id, title, app_name, description,
  status, category, helpful_tags,
  live_url, journey_url,
  thumbnail_url, media_layout, media_urls, media_video_url,
  tools_used, tools_count, views_count, source,
  reactions_teach_me, reactions_buy_this, reactions_use_this,
  featured, created_at
) values

-- Post 1: Clipt (single image)
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000007',
  'Introducing Clipt - Clipboard History for iPhone.',
  'Clipt',
  'Clipt is a beautifully engineered clipboard manager with seamless sync across iPhone, Mac and iPad, along with keyboard clipboard history for iPhone. Simple, secure, and native. Best use case? You can use it as your personal bookmark vault. Just copy from anywhere, and it is in your app.',
  'live', 'iOS app', array['utility','productivity'],
  '#', '#',
  'https://ik.imagekit.io/424h6me27c/1769139467912.jpeg',
  'single',
  array['https://ik.imagekit.io/424h6me27c/1769139467912.jpeg'],
  null,
  '[{"name":"ChatGPT","icon_url":"https://ik.imagekit.io/424h6me27c/chatgpt-logo-chat-gpt-icon-on-white-background-free-vector.jpg"},{"name":"Codex","icon_url":"https://ik.imagekit.io/424h6me27c/codex-color.png"},{"name":"Cursor","icon_url":"https://ik.imagekit.io/424h6me27c/images.png"}]',
  5, 124, 'LinkedIn', 14, 3, 14, true,
  now() - interval '2 days'
),

-- Post 2: Brink (5-photo grid)
(
  'aaaaaaaa-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000007',
  'Brink — Podcast player, superpowered',
  'Brink',
  'Dynamic themes that adapt to each podcast artwork. Smart folders, offline sync, and granular playback speed controls.',
  'wip', 'iOS app', array['productivity'],
  '#', '#',
  'https://ik.imagekit.io/424h6me27c/1773811274544.jpeg',
  '5grid',
  array[
    'https://ik.imagekit.io/424h6me27c/1773811274544.jpeg',
    'https://ik.imagekit.io/424h6me27c/1773811274764.jpeg',
    'https://ik.imagekit.io/424h6me27c/1773811274487.jpeg',
    'https://ik.imagekit.io/424h6me27c/1773811274527.jpeg'
  ],
  null,
  '[{"name":"Cursor","icon_url":"https://ik.imagekit.io/424h6me27c/images.png"},{"name":"ChatGPT","icon_url":"https://ik.imagekit.io/424h6me27c/chatgpt-logo-chat-gpt-icon-on-white-background-free-vector.jpg"},{"name":"Codex","icon_url":"https://ik.imagekit.io/424h6me27c/codex-color.png"}]',
  3, 0, 'Twitter', 8, 5, 21, true,
  now() - interval '1 day'
),

-- Post 3: Voice Blob (video)
(
  'aaaaaaaa-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000008',
  'Voice interactive blob particles using SwiftUI and Cursor.',
  'Voice Blob',
  'Sound on 🔊 Random giggles at the end 💁',
  'live', 'iOS app', array['fun'],
  '#', '#',
  'https://ik.imagekit.io/424h6me27c/1593694785946.jpeg',
  'video',
  array[]::text[],
  'https://ik.imagekit.io/424h6me27c/linkedin-video-2.mp4',
  '[{"name":"Codex","icon_url":"https://ik.imagekit.io/424h6me27c/codex-color.png"},{"name":"Cursor","icon_url":"https://ik.imagekit.io/424h6me27c/images.png"}]',
  2, 318, 'LinkedIn', 19, 7, 33, true,
  now() - interval '5 hours'
),

-- Post 4: Pastery (carousel)
(
  'aaaaaaaa-0000-0000-0000-000000000004',
  '11111111-0000-0000-0000-000000000001',
  'Introducing Pastery',
  'Pastery',
  'A clipboard app for macOS that brings up all your previous copied items with a single hotkey

No more switching between windows multiple times. Just copy everything at once, and paste seamlessly right where you need them.

Supports all file formats, customisable hotkeys, and feels like a native macOS feature rather than an installed app.

Download now for free : pasteryapp.xyz',
  'live', 'macOS', array['utility','productivity'],
  'https://pasteryapp.xyz', '#',
  'https://ik.imagekit.io/424h6me27c/1757355199034.jpeg',
  'carousel',
  array[
    'https://ik.imagekit.io/424h6me27c/1757355199034.jpeg',
    'https://ik.imagekit.io/424h6me27c/Screenshot%202026-05-02%20at%203.57.30%E2%80%AFAM.png'
  ],
  null,
  '[{"name":"ChatGPT","icon_url":"https://ik.imagekit.io/424h6me27c/chatgpt-logo-chat-gpt-icon-on-white-background-free-vector.jpg"},{"name":"Cursor","icon_url":"https://ik.imagekit.io/424h6me27c/images.png"}]',
  2, 0, 'LinkedIn', 11, 2, 16, true,
  now() - interval '3 days'
)

on conflict (id) do nothing;

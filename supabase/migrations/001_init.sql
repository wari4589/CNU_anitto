-- ANITTO initial Supabase schema
-- Run in Supabase Dashboard -> SQL Editor, or apply with Supabase CLI.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  real_name text not null,
  nickname text not null unique,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  name text not null,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'ended')),
  duration_days integer not null default 7 check (duration_days > 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  score integer not null default 0,
  pending_score integer not null default 0,
  coins integer not null default 100,
  created_at timestamptz not null default now(),
  unique (game_session_id, profile_id)
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  title text not null,
  description text,
  score_reward integer not null default 0,
  coin_reward integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.mission_completions (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  photo_url text,
  description text,
  score_given integer not null default 0,
  coins_given integer not null default 0,
  score_pending_until timestamptz,
  is_score_reflected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (mission_id, participant_id)
);

create table if not exists public.score_log (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_id uuid,
  is_pending boolean not null default false,
  reflect_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.coin_log (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  type text not null,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.manittos (
  id uuid primary key default gen_random_uuid(),
  game_session_id uuid not null references public.game_sessions(id) on delete cascade,
  from_participant_id uuid not null references public.participants(id) on delete cascade,
  to_participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (game_session_id, from_participant_id),
  unique (game_session_id, to_participant_id),
  check (from_participant_id <> to_participant_id)
);

create index if not exists idx_game_sessions_status_created
  on public.game_sessions(status, created_at desc);
create index if not exists idx_participants_game_score
  on public.participants(game_session_id, score desc);
create index if not exists idx_missions_game_active
  on public.missions(game_session_id, is_active);
create index if not exists idx_notifications_participant_created
  on public.notifications(participant_id, created_at desc);
create index if not exists idx_score_log_pending_reflect
  on public.score_log(is_pending, reflect_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.add_coins_and_pending_score(
  p_participant_id uuid,
  p_coins integer,
  p_pending_score integer
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.participants
  set
    coins = coins + p_coins,
    pending_score = pending_score + p_pending_score
  where id = p_participant_id;
$$;

alter table public.profiles enable row level security;
alter table public.seasons enable row level security;
alter table public.game_sessions enable row level security;
alter table public.participants enable row level security;
alter table public.missions enable row level security;
alter table public.mission_completions enable row level security;
alter table public.score_log enable row level security;
alter table public.coin_log enable row level security;
alter table public.notifications enable row level security;
alter table public.manittos enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "seasons_select_authenticated" on public.seasons;
create policy "seasons_select_authenticated"
on public.seasons for select
to authenticated
using (true);

drop policy if exists "game_sessions_select_authenticated" on public.game_sessions;
create policy "game_sessions_select_authenticated"
on public.game_sessions for select
to authenticated
using (true);

drop policy if exists "participants_select_authenticated" on public.participants;
create policy "participants_select_authenticated"
on public.participants for select
to authenticated
using (true);

drop policy if exists "participants_insert_own" on public.participants;
create policy "participants_insert_own"
on public.participants for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = participants.profile_id
      and p.id = auth.uid()
  )
);

drop policy if exists "participants_update_own" on public.participants;
create policy "participants_update_own"
on public.participants for update
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = participants.profile_id
      and p.id = auth.uid()
  )
);

drop policy if exists "missions_select_authenticated" on public.missions;
create policy "missions_select_authenticated"
on public.missions for select
to authenticated
using (true);

drop policy if exists "mission_completions_select_own" on public.mission_completions;
create policy "mission_completions_select_own"
on public.mission_completions for select
to authenticated
using (
  exists (
    select 1 from public.participants p
    where p.id = mission_completions.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "mission_completions_insert_own" on public.mission_completions;
create policy "mission_completions_insert_own"
on public.mission_completions for insert
to authenticated
with check (
  exists (
    select 1 from public.participants p
    where p.id = mission_completions.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "score_log_select_own" on public.score_log;
create policy "score_log_select_own"
on public.score_log for select
to authenticated
using (
  exists (
    select 1 from public.participants p
    where p.id = score_log.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "score_log_insert_own" on public.score_log;
create policy "score_log_insert_own"
on public.score_log for insert
to authenticated
with check (
  exists (
    select 1 from public.participants p
    where p.id = score_log.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "coin_log_select_own" on public.coin_log;
create policy "coin_log_select_own"
on public.coin_log for select
to authenticated
using (
  exists (
    select 1 from public.participants p
    where p.id = coin_log.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "coin_log_insert_own" on public.coin_log;
create policy "coin_log_insert_own"
on public.coin_log for insert
to authenticated
with check (
  exists (
    select 1 from public.participants p
    where p.id = coin_log.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications for select
to authenticated
using (
  exists (
    select 1 from public.participants p
    where p.id = notifications.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications for update
to authenticated
using (
  exists (
    select 1 from public.participants p
    where p.id = notifications.participant_id
      and p.profile_id = auth.uid()
  )
);

drop policy if exists "manittos_select_own" on public.manittos;
create policy "manittos_select_own"
on public.manittos for select
to authenticated
using (
  exists (
    select 1 from public.participants p
    where p.game_session_id = manittos.game_session_id
      and p.profile_id = auth.uid()
      and (
        p.id = manittos.from_participant_id
        or p.id = manittos.to_participant_id
      )
  )
);

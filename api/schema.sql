-- TwinArchitect Postgres schema (Supabase in production, see docs/BUILD.md
-- Phase 7). Applied automatically at startup by PostgresStore.init() below
-- via CREATE ... IF NOT EXISTS, so it's safe to run repeatedly.
--
-- Raw answers are the source of truth (docs/CORE.md) — the profile is
-- always recalculated from them. profile_snapshot on sessions is a cache
-- only: it's overwritten in lockstep with the answer log after every
-- accepted answer, never edited on its own, and never trusted as
-- authoritative by the API (which always rebuilds from `answers`).

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  frozen boolean not null default false,
  profile_snapshot jsonb
);

create table if not exists answers (
  id bigserial primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  question_id text not null,
  option_id text not null,
  source text not null default 'quiz',
  created_at timestamptz not null default now()
);

create index if not exists answers_session_id_idx on answers (session_id, id);

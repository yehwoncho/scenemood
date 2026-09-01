-- BLINK 보관함(찜하기 · 별점) 스키마
--
-- 사용법: Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여넣고 Run.
-- 이미 실행한 뒤 다시 돌려도 안전하도록(idempotent) if not exists / or replace 를 썼다.
--
-- 이후 대시보드 Authentication → URL Configuration → Redirect URLs 에
--   http://localhost:3000/**
-- (배포하면 배포 도메인의 /** 도) 등록해야 이메일 매직링크 클릭 후 세션이 붙는다.
-- Email 프로바이더는 기본 활성화돼 있고, 매직링크는 Supabase 기본 이메일 발송
-- (시간당 발송량이 매우 적은 무료 한도)을 그대로 쓴다 — 운영 전엔 커스텀 SMTP 권장.

-- ── bookmarks: 찜한 작품 ────────────────────────────────────────────────
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  title text not null,
  poster_path text,
  saved_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists bookmarks_user_id_idx on public.bookmarks (user_id, saved_at desc);

alter table public.bookmarks enable row level security;

drop policy if exists "bookmarks_select_own" on public.bookmarks;
create policy "bookmarks_select_own" on public.bookmarks
  for select using (auth.uid() = user_id);

drop policy if exists "bookmarks_insert_own" on public.bookmarks;
create policy "bookmarks_insert_own" on public.bookmarks
  for insert with check (auth.uid() = user_id);

drop policy if exists "bookmarks_update_own" on public.bookmarks;
create policy "bookmarks_update_own" on public.bookmarks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmarks_delete_own" on public.bookmarks;
create policy "bookmarks_delete_own" on public.bookmarks
  for delete using (auth.uid() = user_id);

-- ── watch_records: 내 별점 ──────────────────────────────────────────────
-- 요청 스펙은 (id, user_id, tmdb_id, rating, watched_at)이지만, bookmarks 처럼
-- movie/tv 를 나중에 같이 다룰 때 tmdb_id 충돌(다른 매체가 같은 id)을 막기 위해
-- media_type 을 기본값 'movie' 로 추가했다 (지금 앱은 영화만 다뤄 동작엔 영향 없음).
create table if not exists public.watch_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tmdb_id integer not null,
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  rating smallint not null check (rating between 1 and 5),
  watched_at timestamptz not null default now(),
  unique (user_id, tmdb_id, media_type)
);

create index if not exists watch_records_user_id_idx on public.watch_records (user_id);

alter table public.watch_records enable row level security;

drop policy if exists "watch_records_select_own" on public.watch_records;
create policy "watch_records_select_own" on public.watch_records
  for select using (auth.uid() = user_id);

drop policy if exists "watch_records_insert_own" on public.watch_records;
create policy "watch_records_insert_own" on public.watch_records
  for insert with check (auth.uid() = user_id);

drop policy if exists "watch_records_update_own" on public.watch_records;
create policy "watch_records_update_own" on public.watch_records
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "watch_records_delete_own" on public.watch_records;
create policy "watch_records_delete_own" on public.watch_records
  for delete using (auth.uid() = user_id);

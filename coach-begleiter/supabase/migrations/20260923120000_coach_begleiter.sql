-- Coach-Begleiter: persönliche Termine, Challenges und Hausaufgaben einer
-- Coachin innerhalb von smile2go — NICHT für Klientinnen. "Mitglied" meint
-- hier die Coachin selbst als Teil der smile2go-Community (Workbooks,
-- Workshops, Retreats, Challenges), nicht ihre Klientinnen.
--
-- Abhängigkeit: läuft auf DERSELBEN Supabase-Datenbank wie coach-studio und
-- setzt dessen Migrationen voraus — insbesondere `coach_profile` und
-- `public.ist_zugelassene_coachin()`. Diese Datei bricht absichtlich laut ab,
-- wenn diese Voraussetzung fehlt, statt eine RLS-Policy zu bauen, die niemand
-- durchlässt.

do $$
begin
  if to_regprocedure('public.ist_zugelassene_coachin()') is null then
    raise exception
      'coach-begleiter setzt die coach-studio-Migrationen voraus (insbesondere ist_zugelassene_coachin()). Zuerst supabase/migrations aus coach-studio einspielen.';
  end if;
end
$$;

-- =========================================================================
-- 1. termine — eigene Kalendereinträge der Coachin
-- =========================================================================

create table if not exists public.termine (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references auth.users (id) on delete cascade,
  titel        text not null,
  beschreibung text,
  start_at     timestamptz not null,
  ende_at      timestamptz,
  ort          text,
  -- null = von smile2go angelegt (z. B. Mentoring-Call), sonst von der
  -- Coachin selbst.
  erstellt_von uuid references auth.users (id),
  erstellt_at  timestamptz not null default now()
);

create index if not exists termine_coach_start_idx on public.termine (coach_id, start_at);

alter table public.termine enable row level security;

drop policy if exists termine_select_own on public.termine;
create policy termine_select_own on public.termine
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists termine_insert_own on public.termine;
create policy termine_insert_own on public.termine
  for insert with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists termine_update_own on public.termine;
create policy termine_update_own on public.termine
  for update using (coach_id = auth.uid() and public.ist_zugelassene_coachin())
  with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists termine_delete_own on public.termine;
create policy termine_delete_own on public.termine
  for delete using (coach_id = auth.uid() and public.ist_zugelassene_coachin());

-- =========================================================================
-- 2. challenges — smile2go-weit, nicht pro Coachin
-- =========================================================================

create table if not exists public.challenges (
  id           uuid primary key default gen_random_uuid(),
  titel        text not null,
  beschreibung text,
  -- Freies Tag fuer Relevanz-Filterung (z. B. 'sichtbarkeit', 'akquise').
  -- Kein Fremdschluessel: die Taxonomie steht noch nicht fest.
  kategorie    text,
  start_at     timestamptz not null,
  ende_at      timestamptz not null,
  erstellt_at  timestamptz not null default now(),
  check (ende_at > start_at)
);

create index if not exists challenges_zeitraum_idx on public.challenges (start_at, ende_at);

alter table public.challenges enable row level security;

-- Lesend fuer jede zugelassene Coachin offen — Challenges sind smile2go-weit
-- sichtbar, nicht pro Coachin isoliert. Schreiben nur serverseitig
-- (Service-Role), daher keine INSERT/UPDATE/DELETE-Policy fuer `authenticated`.
drop policy if exists challenges_select_zugelassen on public.challenges;
create policy challenges_select_zugelassen on public.challenges
  for select using (public.ist_zugelassene_coachin());

-- =========================================================================
-- 3. coach_challenge_teilnahme — macht eine globale Challenge persönlich
-- =========================================================================

create table if not exists public.coach_challenge_teilnahme (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null references auth.users (id) on delete cascade,
  challenge_id   uuid not null references public.challenges (id) on delete cascade,
  beigetreten_at timestamptz not null default now(),
  erledigt_at    timestamptz,
  unique (coach_id, challenge_id)
);

create index if not exists teilnahme_coach_idx on public.coach_challenge_teilnahme (coach_id);

alter table public.coach_challenge_teilnahme enable row level security;

drop policy if exists teilnahme_select_own on public.coach_challenge_teilnahme;
create policy teilnahme_select_own on public.coach_challenge_teilnahme
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists teilnahme_insert_own on public.coach_challenge_teilnahme;
create policy teilnahme_insert_own on public.coach_challenge_teilnahme
  for insert with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists teilnahme_update_own on public.coach_challenge_teilnahme;
create policy teilnahme_update_own on public.coach_challenge_teilnahme
  for update using (coach_id = auth.uid() and public.ist_zugelassene_coachin())
  with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());

-- =========================================================================
-- 4. hausaufgaben — persönliche Aufgaben (Workbook-Einträge, Mentoring)
-- =========================================================================

create table if not exists public.hausaufgaben (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references auth.users (id) on delete cascade,
  titel        text not null,
  beschreibung text,
  faellig_am   date,
  erledigt_at  timestamptz,
  -- null = von smile2go/Mentorin gestellt, sonst von der Coachin selbst.
  erstellt_von uuid references auth.users (id),
  erstellt_at  timestamptz not null default now()
);

create index if not exists hausaufgaben_coach_faellig_idx
  on public.hausaufgaben (coach_id, faellig_am);

alter table public.hausaufgaben enable row level security;

drop policy if exists hausaufgaben_select_own on public.hausaufgaben;
create policy hausaufgaben_select_own on public.hausaufgaben
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists hausaufgaben_insert_own on public.hausaufgaben;
create policy hausaufgaben_insert_own on public.hausaufgaben
  for insert with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists hausaufgaben_update_own on public.hausaufgaben;
create policy hausaufgaben_update_own on public.hausaufgaben
  for update using (coach_id = auth.uid() and public.ist_zugelassene_coachin())
  with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists hausaufgaben_delete_own on public.hausaufgaben;
create policy hausaufgaben_delete_own on public.hausaufgaben
  for delete using (coach_id = auth.uid() and public.ist_zugelassene_coachin());

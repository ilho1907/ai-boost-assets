-- Coach-Zulassung: aus "jede angemeldete Person ist eine Coachin" wird
-- "nur eingeladene Personen sind Coachinnen".
--
-- Bisher galt ueberall coach_id = auth.uid() ohne jede weitere Pruefung —
-- jede Person mit einer beliebigen E-Mail-Adresse konnte sich per Magic Link
-- anmelden und stand sofort in einem vollstaendigen Coach-Studio, obwohl das
-- Kernversprechen "verifizierte Coachinnen" lautet. Diese Migration schliesst
-- die Luecke ueber eine Einladung, die an eine E-Mail-Adresse gebunden ist
-- (kein teilbarer Code) und ein `coach_profile`, das RLS ab jetzt voraussetzt.

-- =========================================================================
-- 1. coach_einladungen
-- =========================================================================

create table if not exists public.coach_einladungen (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  -- Zufaelliges Token fuer den Link, getrennt von der id: id ist oeffentlich
  -- referenzierbar (z. B. in Admin-Listen), das Token nicht.
  token        uuid not null default gen_random_uuid(),
  eingeladen_von uuid references auth.users (id),
  eingeladen_at timestamptz not null default now(),
  laeuft_ab_at timestamptz not null default (now() + interval '14 days'),
  eingeloest_at timestamptz,
  eingeloest_von uuid references auth.users (id)
);

comment on table public.coach_einladungen is
  'An eine E-Mail-Adresse gebundene, einmalige Einladung. Kein teilbarer Code: das Loesen prueft, dass die anmeldende Person genau diese E-Mail bestaetigt hat.';

create unique index if not exists coach_einladungen_token_idx on public.coach_einladungen (token);
create index if not exists coach_einladungen_email_idx on public.coach_einladungen (lower(email));

alter table public.coach_einladungen enable row level security;

-- Absichtlich keine SELECT/INSERT-Policy fuer normale Nutzerinnen: Einladungen
-- werden serverseitig (Service-Role, z. B. nach dem Calendly-Kostenlosgespraech)
-- angelegt. Die Loese-Funktion unten laeuft mit erhoehten Rechten, siehe dort.

-- =========================================================================
-- 2. coach_profile
-- =========================================================================

create table if not exists public.coach_profile (
  coach_id   uuid primary key references auth.users (id) on delete cascade,
  name       text,
  eingeladen_von uuid references auth.users (id),
  erstellt_at timestamptz not null default now()
);

comment on table public.coach_profile is
  'Existenz dieser Zeile = "diese Person ist eine zugelassene Coachin". Grundlage jeder RLS-Policy, die vorher nur coach_id = auth.uid() pruefte.';

alter table public.coach_profile enable row level security;

drop policy if exists coach_profile_select_own on public.coach_profile;
create policy coach_profile_select_own on public.coach_profile
  for select using (coach_id = auth.uid());
-- Kein INSERT/UPDATE/DELETE fuer Nutzerinnen: die Zeile entsteht ausschliesslich
-- durch coach_einladung_einloesen() unten.

-- =========================================================================
-- 3. Einladung einloesen
-- =========================================================================

-- security definer, weil die aufrufende Person noch KEIN coach_profile hat
-- und coach_einladungen fuer sie unsichtbar ist — die Funktion braucht
-- erhoehte Rechte, um die Einladung nachzuschlagen. Die Sicherheit kommt
-- nicht aus RLS, sondern aus der Pruefung selbst: E-Mail muss exakt zur
-- bestaetigten E-Mail der anmeldenden Person passen (auth.jwt() ->> 'email',
-- von Supabase Auth gesetzt, nicht vom Client), das Token muss existieren,
-- und darf weder abgelaufen noch bereits eingeloest sein.
create or replace function public.coach_einladung_einloesen(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_einladung public.coach_einladungen;
  v_email     text;
begin
  v_email := lower(auth.jwt() ->> 'email');
  if v_email is null then
    raise exception 'coach_einladung_einloesen: keine bestaetigte E-Mail-Adresse in der Session';
  end if;

  select * into v_einladung
  from public.coach_einladungen
  where token = p_token
  for update;

  if not found then
    raise exception 'coach_einladung_einloesen: Einladung nicht gefunden' using errcode = '42501';
  end if;

  if lower(v_einladung.email) <> v_email then
    raise exception 'coach_einladung_einloesen: Einladung gilt fuer eine andere E-Mail-Adresse' using errcode = '42501';
  end if;

  if v_einladung.eingeloest_at is not null then
    raise exception 'coach_einladung_einloesen: Einladung wurde bereits eingeloest' using errcode = '42501';
  end if;

  if v_einladung.laeuft_ab_at < now() then
    raise exception 'coach_einladung_einloesen: Einladung ist abgelaufen' using errcode = '42501';
  end if;

  update public.coach_einladungen
  set eingeloest_at = now(), eingeloest_von = auth.uid()
  where id = v_einladung.id;

  insert into public.coach_profile (coach_id, eingeladen_von)
  values (auth.uid(), v_einladung.eingeladen_von)
  on conflict (coach_id) do nothing;
end;
$$;

revoke all on function public.coach_einladung_einloesen(uuid) from public;
grant execute on function public.coach_einladung_einloesen(uuid) to authenticated;

-- =========================================================================
-- 4. Bestehende RLS-Policies verschaerfen
-- =========================================================================
-- coach_id = auth.uid() bleibt bestehen (Mandantentrennung), zusaetzlich muss
-- ein coach_profile existieren. Ohne dieses Zweite waere jede beliebige
-- angemeldete Person weiterhin ihre eigene "Coachin".

create or replace function public.ist_zugelassene_coachin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.coach_profile where coach_id = auth.uid());
$$;

revoke all on function public.ist_zugelassene_coachin() from public;
grant execute on function public.ist_zugelassene_coachin() to authenticated;

drop policy if exists leads_select_own on public.leads;
create policy leads_select_own on public.leads
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists leads_insert_own on public.leads;
create policy leads_insert_own on public.leads
  for insert with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists leads_update_own on public.leads;
create policy leads_update_own on public.leads
  for update using (coach_id = auth.uid() and public.ist_zugelassene_coachin())
  with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists leads_delete_own on public.leads;
create policy leads_delete_own on public.leads
  for delete using (coach_id = auth.uid() and public.ist_zugelassene_coachin());

drop policy if exists lead_interactions_select_own on public.lead_interactions;
create policy lead_interactions_select_own on public.lead_interactions
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists lead_interactions_insert_own on public.lead_interactions;
create policy lead_interactions_insert_own on public.lead_interactions
  for insert with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists lead_interactions_delete_own on public.lead_interactions;
create policy lead_interactions_delete_own on public.lead_interactions
  for delete using (coach_id = auth.uid() and public.ist_zugelassene_coachin());

drop policy if exists coach_ig_select_own on public.coach_instagram_konten;
create policy coach_ig_select_own on public.coach_instagram_konten
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists coach_ig_delete_own on public.coach_instagram_konten;
create policy coach_ig_delete_own on public.coach_instagram_konten
  for delete using (coach_id = auth.uid() and public.ist_zugelassene_coachin());

-- Export-View (Art. 20) bekommt dieselbe Verschaerfung ueber ihre RLS-
-- Basistabelle automatisch — kein Aenderungsbedarf, security_invoker greift.

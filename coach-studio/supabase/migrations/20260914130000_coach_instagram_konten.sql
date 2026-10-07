-- Verknuepfung des eigenen Instagram-Business-/Creator-Kontos einer Coachin.
--
-- Der Access-Token liegt hier, weil nur die Serverseite (Edge Function mit
-- Service-Role) ihn braucht. Er darf den Browser NIE erreichen: RLS allein
-- reicht dafuer nicht, denn eine Coachin darf ihre eigene Zeile ja sehen.
-- Deshalb zusaetzlich ein spaltenweiser Entzug der Leserechte auf die
-- Token-Spalten.

create table if not exists public.coach_instagram_konten (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null unique references auth.users (id) on delete cascade,
  -- ID des IG-Kontos; der Webhook nennt sie in entry[].id und wir finden
  -- darueber die zustaendige Coachin.
  ig_konto_id        text not null unique,
  ig_benutzername    text,
  access_token       text,
  token_gueltig_bis  timestamptz,
  verbunden_at       timestamptz not null default now(),
  aktualisiert_at    timestamptz not null default now()
);

comment on table public.coach_instagram_konten is
  'Verknuepftes eigenes IG-Konto je Coachin. access_token ist serverseitig und fuer die Rolle authenticated nicht lesbar.';

create index if not exists coach_instagram_konten_ig_idx
  on public.coach_instagram_konten (ig_konto_id);

alter table public.coach_instagram_konten enable row level security;

-- Die Coachin darf ihre Verknuepfung sehen und wieder loesen.
-- Kein INSERT/UPDATE per Client: Tokens setzt ausschliesslich der
-- OAuth-Callback auf der Serverseite.
drop policy if exists coach_ig_select_own on public.coach_instagram_konten;
create policy coach_ig_select_own on public.coach_instagram_konten
  for select using (coach_id = auth.uid());

drop policy if exists coach_ig_delete_own on public.coach_instagram_konten;
create policy coach_ig_delete_own on public.coach_instagram_konten
  for delete using (coach_id = auth.uid());

-- Entscheidend: Spalten-Entzug. Ohne diesen koennte eine angemeldete Coachin
-- ihren eigenen Token per PostgREST auslesen und er laege im Browser.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select (id, coach_id, ig_konto_id, ig_benutzername, token_gueltig_bis, verbunden_at, aktualisiert_at)
             on public.coach_instagram_konten to authenticated';
    execute 'revoke select (access_token) on public.coach_instagram_konten from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.coach_instagram_konten from anon';
  end if;
end
$$;

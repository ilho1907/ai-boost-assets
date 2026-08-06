-- Lead-Radar (smile2go Coach-Studio)
-- Verhaltensbasiertes Interesse-Scoring aus Interaktionen mit dem EIGENEN
-- Instagram-Konto der Coachin. Kein Fremdprofil-Zugriff, kein Scraping.
--
-- Rechtsgrundlage: Einwilligung (DSGVO Art. 6 Abs. 1 lit. a).
-- Ohne consent_tracking = true werden KEINE Interaktionen gespeichert.
--
-- Isolation: strikt pro coach_id (analog bestehendem Coach-Studio-Schema).
-- Views auf diesen Tabellen MUESSEN security_invoker = true setzen, um den
-- bekannten Cross-Tenant-Leak (security_definer default) zu vermeiden.

create extension if not exists pgcrypto;

-- =========================================================================
-- 1. leads
-- =========================================================================

create table if not exists public.leads (
  id                 uuid primary key default gen_random_uuid(),
  coach_id           uuid not null references auth.users (id) on delete cascade,
  name               text not null,
  instagram_handle   text,
  quelle             text not null default 'erstgespraech'
                       check (quelle in ('erstgespraech', 'dm', 'empfehlung', 'sonstige')),
  status             text not null default 'neu'
                       check (status in ('neu', 'kontaktiert', 'erstgespraech', 'warm', 'client', 'verloren')),
  consent_tracking   boolean not null default false,
  consent_at         timestamptz,
  notiz              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.leads is
  'Interessentinnen einer Coachin. consent_tracking gated das Schreiben in lead_interactions (Art. 6 Abs. 1 lit. a DSGVO).';

create index if not exists leads_coach_id_idx on public.leads (coach_id);
create index if not exists leads_coach_id_status_idx on public.leads (coach_id, status);
create unique index if not exists leads_coach_id_handle_idx
  on public.leads (coach_id, lower(instagram_handle))
  where instagram_handle is not null;

-- consent_at konsistent mit consent_tracking halten
create or replace function public.leads_set_consent_at()
returns trigger
language plpgsql
as $$
begin
  if new.consent_tracking = true and (old is null or old.consent_tracking = false) then
    new.consent_at := coalesce(new.consent_at, now());
  elsif new.consent_tracking = false then
    new.consent_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists leads_set_consent_at_trg on public.leads;
create trigger leads_set_consent_at_trg
  before insert or update on public.leads
  for each row execute function public.leads_set_consent_at();

alter table public.leads enable row level security;

create policy leads_select_own on public.leads
  for select using (coach_id = auth.uid());
create policy leads_insert_own on public.leads
  for insert with check (coach_id = auth.uid());
create policy leads_update_own on public.leads
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy leads_delete_own on public.leads
  for delete using (coach_id = auth.uid());

-- =========================================================================
-- 2. lead_interactions
-- =========================================================================

create table if not exists public.lead_interactions (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references auth.users (id) on delete cascade,
  lead_id      uuid not null references public.leads (id) on delete cascade,
  typ          text not null
                 check (typ in ('dm_antwort', 'story_reaktion', 'kommentar', 'like', 'save', 'erstgespraech')),
  gewicht      integer not null,
  occurred_at  timestamptz not null default now(),
  quelle       text not null default 'instagram' check (quelle in ('instagram', 'manuell')),
  -- Referenz auf das IG-Objekt (Comment-/Media-/Conversation-ID) statt Rohtext.
  -- Es werden bewusst KEINE DM-/Kommentar-Inhalte über das Notwendige hinaus gespeichert
  -- (EU AI Act: rein verhaltensbasiertes Zaehl-/Recency-Signal, keine Text-/Emotionsanalyse).
  raw_ref      text,
  created_at   timestamptz not null default now()
);

comment on table public.lead_interactions is
  'Zaehl-/Recency-Signale aus dem eigenen IG-Konto der Coachin. Nur schreibbar, wenn der Lead consent_tracking = true hat.';

create index if not exists lead_interactions_coach_id_idx on public.lead_interactions (coach_id);
create index if not exists lead_interactions_lead_id_idx on public.lead_interactions (lead_id);
create index if not exists lead_interactions_coach_occurred_idx
  on public.lead_interactions (coach_id, occurred_at desc);

-- Default-Gewichte je Interaktionstyp, falls beim Insert kein gewicht mitgegeben wird.
-- Werte gemaess Scoring-Spezifikation (siehe scoring.ts DEFAULT_GEWICHTE) und konfigurierbar
-- über zukuenftige Coach-Einstellungen; hier als DB-seitiger Fallback dupliziert.
create or replace function public.lead_interactions_default_gewicht()
returns trigger
language plpgsql
as $$
begin
  if new.gewicht is null then
    new.gewicht := case new.typ
      when 'erstgespraech'   then 40
      when 'dm_antwort'      then 15
      when 'story_reaktion'  then 8
      when 'kommentar'       then 6
      when 'save'            then 5
      when 'like'            then 2
      else 0
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_interactions_default_gewicht_trg on public.lead_interactions;
create trigger lead_interactions_default_gewicht_trg
  before insert on public.lead_interactions
  for each row execute function public.lead_interactions_default_gewicht();

-- Consent-Gate: Interaktionen duerfen nur geschrieben werden, wenn der
-- zugehoerige Lead consent_tracking = true hat. Dies ist die technische
-- Durchsetzung der DSGVO-Einwilligungspflicht (nicht nur Anwendungslogik).
create or replace function public.lead_interactions_enforce_consent()
returns trigger
language plpgsql
as $$
declare
  v_consent boolean;
  v_coach   uuid;
begin
  select consent_tracking, coach_id into v_consent, v_coach
  from public.leads
  where id = new.lead_id;

  if not found then
    raise exception 'lead_interactions: lead % existiert nicht', new.lead_id;
  end if;

  if v_coach <> new.coach_id then
    raise exception 'lead_interactions: coach_id stimmt nicht mit dem Lead ueberein';
  end if;

  if v_consent is distinct from true then
    raise exception 'lead_interactions: Lead % hat keine Einwilligung (consent_tracking = false) - Schreiben abgelehnt', new.lead_id
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists lead_interactions_enforce_consent_trg on public.lead_interactions;
create trigger lead_interactions_enforce_consent_trg
  before insert or update on public.lead_interactions
  for each row execute function public.lead_interactions_enforce_consent();

alter table public.lead_interactions enable row level security;

create policy lead_interactions_select_own on public.lead_interactions
  for select using (coach_id = auth.uid());
create policy lead_interactions_insert_own on public.lead_interactions
  for insert with check (coach_id = auth.uid());
create policy lead_interactions_delete_own on public.lead_interactions
  for delete using (coach_id = auth.uid());
-- Bewusst kein UPDATE-Policy: Interaktionen sind unveraenderliche Ereignis-Log-Eintraege.

-- =========================================================================
-- 3. lead_scores
-- =========================================================================

create table if not exists public.lead_scores (
  id                    uuid primary key default gen_random_uuid(),
  coach_id              uuid not null references auth.users (id) on delete cascade,
  lead_id               uuid not null unique references public.leads (id) on delete cascade,
  score                 integer not null default 0,
  stufe                 text not null default 'kalt' check (stufe in ('kalt', 'lauwarm', 'warm')),
  trend                 text not null default 'stabil' check (trend in ('steigend', 'stabil', 'fallend')),
  letzte_interaktion_at timestamptz,
  berechnet_at          timestamptz not null default now()
);

comment on table public.lead_scores is
  'Ausschliesslich abgeleitete Werte (kein Rohtext). Wird periodisch durch den Scoring-Job (siehe scoring.ts) neu berechnet und upserted.';

create index if not exists lead_scores_coach_id_idx on public.lead_scores (coach_id);
create index if not exists lead_scores_coach_stufe_idx on public.lead_scores (coach_id, stufe);

alter table public.lead_scores enable row level security;

create policy lead_scores_select_own on public.lead_scores
  for select using (coach_id = auth.uid());
create policy lead_scores_upsert_own on public.lead_scores
  for insert with check (coach_id = auth.uid());
create policy lead_scores_update_own on public.lead_scores
  for update using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy lead_scores_delete_own on public.lead_scores
  for delete using (coach_id = auth.uid());

-- =========================================================================
-- 4. DSGVO: Loeschung (Art. 17) & Export (Art. 20)
-- =========================================================================

-- Vollstaendige Loeschung eines Leads inkl. aller abgeleiteten Daten.
-- SECURITY INVOKER (Standard) + expliziter coach_id-Check: laeuft mit den
-- Rechten der aufrufenden Coachin, RLS greift zusaetzlich als zweite Huerde.
create or replace function public.lead_delete_cascade(p_lead_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  delete from public.leads
  where id = p_lead_id
    and coach_id = auth.uid();
  -- lead_interactions und lead_scores loeschen ueber on delete cascade automatisch mit.
end;
$$;

-- Export-View fuer eine Coachin (Art. 20): explizit security_invoker, damit
-- RLS der Basistabellen greift und kein Cross-Tenant-Leak entsteht.
create or replace view public.lead_export_v
with (security_invoker = true) as
select
  l.id                    as lead_id,
  l.name,
  l.instagram_handle,
  l.quelle,
  l.status,
  l.consent_tracking,
  l.consent_at,
  l.notiz,
  l.created_at,
  l.updated_at,
  s.score,
  s.stufe,
  s.trend,
  s.letzte_interaktion_at,
  s.berechnet_at
from public.leads l
left join public.lead_scores s on s.lead_id = l.id;

comment on view public.lead_export_v is
  'DSGVO Art. 20 Datenexport. security_invoker = true ist Pflicht, damit die RLS-Policies von leads/lead_scores greifen.';

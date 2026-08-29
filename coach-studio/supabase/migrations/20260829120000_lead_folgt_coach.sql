-- Lead-Radar: Follow-Status aus der Instagram Messaging User-Profile-API.
--
-- Quelle: GET /{igsid}?fields=...,is_user_follow_business,is_business_follow_user
-- Diese Felder liefert Meta ausschliesslich fuer Personen, die bereits eine
-- Konversation mit dem eigenen Business-Konto der Coachin eroeffnet haben
-- (erst dann existiert eine IGSID). Es ist KEIN Fremdprofil-Abruf und kein
-- Blick in eine Follower-Liste - eine solche Liste gibt die Graph API nicht her.
--
-- Abgrenzung der Consent-Pflicht in diesem Schema:
--   * Identifikatoren (instagram_handle, instagram_scoped_id) = Kontaktstammdaten,
--     nicht consent-gated - analog zu Name und Notiz.
--   * Abgeleitete Verhaltensinformationen (folgt_coach) = consent-gated,
--     wie lead_interactions.

alter table public.leads
  add column if not exists instagram_scoped_id text,
  -- true = folgt der Coachin, false = folgt nicht, null = unbekannt/nicht verfuegbar
  -- (kein Gespraech eroeffnet, daher keine IGSID -> Meta liefert das Feld nicht).
  add column if not exists folgt_coach boolean,
  add column if not exists folgt_coach_at timestamptz;

comment on column public.leads.instagram_scoped_id is
  'Instagram-Scoped ID (IGSID). Pro Business-Konto eindeutig, entsteht erst mit der ersten Konversation.';
comment on column public.leads.folgt_coach is
  'is_user_follow_business aus der Messaging User-Profile-API. null = unbekannt. Nur mit consent_tracking = true speicherbar.';

create unique index if not exists leads_coach_igsid_idx
  on public.leads (coach_id, instagram_scoped_id)
  where instagram_scoped_id is not null;

-- Consent-Gate auf Datenbankebene: ohne Einwilligung kein Follow-Status.
alter table public.leads
  drop constraint if exists leads_folgt_coach_consent_chk;
alter table public.leads
  add constraint leads_folgt_coach_consent_chk
  check (folgt_coach is null or consent_tracking = true);

-- Beim Widerruf der Einwilligung wird der abgeleitete Follow-Status mitgeloescht
-- (Datenminimierung); ohne dieses Nachziehen wuerde der CHECK oben den Widerruf
-- blockieren. Ersetzt die Funktion aus der Basis-Migration.
create or replace function public.leads_set_consent_at()
returns trigger
language plpgsql
as $$
begin
  if new.consent_tracking = true and (old is null or old.consent_tracking = false) then
    new.consent_at := coalesce(new.consent_at, now());
  elsif new.consent_tracking = false then
    new.consent_at := null;
    new.folgt_coach := null;
    new.folgt_coach_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Export-View (DSGVO Art. 20) um die neuen Felder ergaenzen.
-- security_invoker = true bleibt zwingend, sonst Cross-Tenant-Leak.
create or replace view public.lead_export_v
with (security_invoker = true) as
select
  l.id                    as lead_id,
  l.name,
  l.instagram_handle,
  l.instagram_scoped_id,
  l.quelle,
  l.status,
  l.consent_tracking,
  l.consent_at,
  l.folgt_coach,
  l.folgt_coach_at,
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

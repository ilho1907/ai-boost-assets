-- Lead-Radar: lead_scores entfernen, Klientinnen-Betreuung ermoeglichen.
--
-- 1) lead_scores wird geloescht. Die Tabelle war fuer periodisch vorberechnete
--    Werte gedacht, wurde aber nie befuellt: die Oberflaeche rechnet den Score
--    live aus lead_interactions, damit er nach einer frischen Interaktion sofort
--    stimmt. Eine leere Tabelle, die aussieht als enthielte sie die Wahrheit,
--    ist schlimmer als keine.
--
-- 2) letzte_beruehrung_at auf leads: fuer Klientinnen zaehlt nicht das
--    Interesse, sondern wann zuletzt ueberhaupt Kontakt war — in BEIDE
--    Richtungen. Der Wert wird per Trigger aus lead_interactions gepflegt,
--    damit die Betreuungsansicht auch ohne Auswertung aller Zeilen stimmt.

-- --- 1. Export-View zuerst loesen, sie haengt an lead_scores ---------------

drop view if exists public.lead_export_v;

drop table if exists public.lead_scores;

-- --- 2. Zeitpunkt der letzten Beruehrung ----------------------------------

alter table public.leads
  add column if not exists letzte_beruehrung_at timestamptz;

comment on column public.leads.letzte_beruehrung_at is
  'Zeitpunkt der juengsten Interaktion in beliebiger Richtung. Fuer Leads zaehlt der Score, fuer Klientinnen zaehlt Kontakt — auch der von der Coachin ausgehende.';

create index if not exists leads_coach_beruehrung_idx
  on public.leads (coach_id, letzte_beruehrung_at desc nulls last);

create or replace function public.leads_beruehrung_nachfuehren()
returns trigger
language plpgsql
as $$
begin
  update public.leads
  set letzte_beruehrung_at = greatest(
        coalesce(letzte_beruehrung_at, new.occurred_at),
        new.occurred_at
      )
  where id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists lead_interactions_beruehrung_trg on public.lead_interactions;
create trigger lead_interactions_beruehrung_trg
  after insert on public.lead_interactions
  for each row execute function public.leads_beruehrung_nachfuehren();

-- Bestand einmalig nachziehen, damit vorhandene Zeilen nicht leer bleiben.
update public.leads l
set letzte_beruehrung_at = q.letzte
from (
  select lead_id, max(occurred_at) as letzte
  from public.lead_interactions
  group by lead_id
) q
where q.lead_id = l.id
  and l.letzte_beruehrung_at is distinct from q.letzte;

-- --- 3. Export-View ohne lead_scores neu aufbauen --------------------------
-- security_invoker = true bleibt zwingend, sonst Cross-Tenant-Leak.

create view public.lead_export_v
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
  l.letzte_beruehrung_at,
  l.notiz,
  l.created_at,
  l.updated_at
from public.leads l;

comment on view public.lead_export_v is
  'DSGVO Art. 20 Datenexport. security_invoker = true ist Pflicht, damit die RLS-Policies von leads greifen.';

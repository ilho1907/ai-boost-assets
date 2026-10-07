-- Lead-Radar: Richtung einer Interaktion.
--
-- Der Instagram-Messaging-Webhook markiert Nachrichten, die das eigene Konto
-- GESENDET hat, mit `is_echo: true`. Ohne diese Unterscheidung laesst sich
-- "unbeantwortete DM" nur raten: bisher galt die juengste Interaktion als
-- unbeantwortet, auch wenn die Coachin laengst geantwortet hatte.
--
-- Ausgehende Nachrichten zaehlen NICHT zum Score (Gewicht 0) — der Score misst
-- das Interesse des Leads, nicht die Aktivitaet der Coachin. Sie beenden aber
-- den Zustand "wartet auf Antwort".

alter table public.lead_interactions
  add column if not exists richtung text not null default 'eingehend'
    check (richtung in ('eingehend', 'ausgehend'));

comment on column public.lead_interactions.richtung is
  'eingehend = vom Lead ausgeloest (zaehlt zum Score), ausgehend = von der Coachin gesendet (Gewicht 0, beendet nur den Wartezustand).';

create index if not exists lead_interactions_lead_richtung_idx
  on public.lead_interactions (lead_id, richtung, occurred_at desc);

-- Ausgehende Nachrichten bekommen immer Gewicht 0, egal was der Aufrufer
-- mitgibt. Ersetzt die Funktion aus der Basis-Migration.
create or replace function public.lead_interactions_default_gewicht()
returns trigger
language plpgsql
as $$
begin
  if new.richtung = 'ausgehend' then
    new.gewicht := 0;
  elsif new.gewicht is null then
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

-- Doppelte Webhook-Zustellungen sind bei Meta normal (at-least-once). Die
-- IG-Objekt-ID macht eine Interaktion eindeutig, damit ein erneut geliefertes
-- Ereignis den Score nicht ein zweites Mal erhoeht.
create unique index if not exists lead_interactions_raw_ref_idx
  on public.lead_interactions (coach_id, raw_ref)
  where raw_ref is not null;

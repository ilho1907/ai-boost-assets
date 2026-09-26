-- Coach-Begleiter: wöchentlicher Content-Themenvorschlag.
--
-- Zweite Ausbaustufe des "was steht heute für dich an"-Gedankens — aber
-- anders als termine/challenges/hausaufgaben braucht diese Funktion
-- tatsächlich ein Sprachmodell: "worüber poste ich diese Woche" ist keine
-- Datumsarithmetik. Volumen bleibt trotzdem niedrig (max. 1 Aufruf pro
-- Coachin pro Woche, siehe unique-Constraint unten) — teuer wird das nicht,
-- selbst bei täglicher Nutzung der App.
--
-- Kontext für den Vorschlag kommt ausschließlich aus den EIGENEN Challenges/
-- Hausaufgaben der Coachin (ihre eigene smile2go-Mitgliedschaft) — niemals
-- aus Lead-Radar oder Klientinnen-Daten. Es gibt hier keine Berührung mit
-- Klientinnen-Profilen, die EU-AI-Act-Grenze aus Lead-Radar betrifft dieses
-- Modul also gar nicht erst.

do $$
begin
  if to_regprocedure('public.ist_zugelassene_coachin()') is null then
    raise exception
      'content_vorschlaege setzt die coach-studio-Migrationen voraus (insbesondere ist_zugelassene_coachin()).';
  end if;
end
$$;

create table if not exists public.content_vorschlaege (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null references auth.users (id) on delete cascade,
  -- Montag der ISO-Woche (siehe montagDerWoche() in contentVorschlag.ts).
  -- Der Unique-Constraint ist die eigentliche Kostenbremse: ein zweiter Klick
  -- auf "Vorschlag anfordern" in derselben Woche löst keinen weiteren
  -- Anthropic-Aufruf aus, die Edge Function liest stattdessen die
  -- bestehende Zeile.
  woche_start date not null,
  thema       text not null,
  begruendung text not null,
  erstellt_at timestamptz not null default now(),
  unique (coach_id, woche_start)
);

create index if not exists content_vorschlaege_coach_idx
  on public.content_vorschlaege (coach_id, woche_start desc);

alter table public.content_vorschlaege enable row level security;

-- Insert läuft im Namen der Coachin selbst (die Edge Function reicht ihr
-- JWT durch, kein Service-Role-Key) — deshalb braucht es hier, anders als
-- bei coach_instagram_konten, keine Sonderbehandlung: coach_id = auth.uid()
-- reicht, dieselbe Zulassungsschranke wie überall sonst.
drop policy if exists content_vorschlaege_select_own on public.content_vorschlaege;
create policy content_vorschlaege_select_own on public.content_vorschlaege
  for select using (coach_id = auth.uid() and public.ist_zugelassene_coachin());
drop policy if exists content_vorschlaege_insert_own on public.content_vorschlaege;
create policy content_vorschlaege_insert_own on public.content_vorschlaege
  for insert with check (coach_id = auth.uid() and public.ist_zugelassene_coachin());
-- Bewusst kein UPDATE/DELETE: ein Vorschlag ist ein Log-Eintrag der Woche,
-- kein editierbares Feld.

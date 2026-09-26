# Coach-Begleiter

Persönliche Termine, Challenges und Hausaufgaben für **Coachinnen selbst** —
nicht für ihre Klientinnen. „Mitglied" meint hier eine Coachin als Teil der
smile2go-Community (Workbooks, Workshops, Retreats, Mentoring), analog zur
`ilhova`-Landingpage im Repo-Wurzelverzeichnis.

## Architekturentscheidung

Bewusst eine **eigenständige App**, getrennt von `../coach-studio`, mit der
Option, beide später unter einem gemeinsamen Dach zu vereinen — so
entschieden, weil Coach-Studio als CRM/Triage-Werkzeug einen anderen Ton
braucht als ein Begleiter für die eigene Weiterbildung.

Damit „später vereinen" später wirklich nur Routing ist und keine
Datenmigration, teilt sich Coach-Begleiter **von Anfang an dieselbe
Supabase-Datenbank** mit Coach-Studio:

- Dieselbe `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` wie Coach-Studio.
- Auth über dieselbe `auth.users`-Tabelle, dieselbe `coach_profile`-Zulassung.
- **Keine eigene Einladungs-Oberfläche.** Wer noch nicht zugelassen ist, wird
  auf Coach-Studio verwiesen (`AuthGate.tsx`) statt eine zweite
  Zulassungslogik zu duplizieren.
- Die Migration `20260923120000_coach_begleiter.sql` setzt
  `public.ist_zugelassene_coachin()` aus coach-studio voraus und **bricht
  laut ab**, wenn sie fehlt, statt eine RLS-Policy zu bauen, die niemand
  durchlässt.

## Was das NICHT ist

Keine Klienten-App. Die im ursprünglichen Auftrag genannten „personalisierten
Erinnerungen" bezogen sich zunächst missverständlich auf Klientinnen — nach
Rücksprache gilt: **für Coachinnen**, im Rahmen ihrer eigenen
smile2go-Mitgliedschaft. Eine Klienten-Ansicht ist ein eigenes,
unentschiedenes Thema.

## Bewusst ohne LLM — bis auf eine Ausnahme

„Was steht heute für dich an?" ist reine Datumsarithmetik
(`src/lib/erinnerungen.ts`) — ob ein Termin morgen ist oder eine Hausaufgabe
überfällig, entscheidet ein Datumsvergleich, kein Modell-Aufruf. Das ist
schneller, günstiger und zuverlässiger als ein LLM dafür zu befragen.
„Persönlich" entsteht daraus, dass jede Coachin ausschließlich ihre eigenen
Termine/Hausaufgaben sieht und nur die Challenges, denen sie beigetreten ist
— nicht daraus, dass etwas für sie mitdenkt.

**Ausnahme: der wöchentliche Content-Themenvorschlag** — „worüber poste ich
diese Woche" ist keine Datumsarithmetik, dafür braucht es tatsächlich ein
Sprachmodell. Umgesetzt in `supabase/functions/content-vorschlag/` (Claude
Opus 5, strukturierte Ausgabe via Zod-Schema). Kontext kommt ausschließlich
aus den **eigenen** Challenges/Hausaufgaben der Coachin — niemals aus
Lead-Radar oder Klientinnen-Daten; dieses Modul berührt Klientinnen-Profile
gar nicht erst, die EU-AI-Act-Grenze aus Lead-Radar betrifft es also nicht.

Kostenbremse gegen „täglich genutzt, explodiert das nicht": ein
Unique-Constraint (`coach_id`, `woche_start`) erlaubt höchstens einen
Vorschlag pro Coachin und Woche. Die Edge Function prüft vor jedem
Anthropic-Aufruf zuerst, ob diese Woche schon eine Zeile existiert, und der
Constraint fängt den seltenen Gleichzeitigkeits-Fall zusätzlich ab (Upsert
mit `ignoreDuplicates`). Selbst bei täglicher Nutzung der App bleibt es bei
maximal einem Aufruf pro Coachin pro Woche.

Der API-Key verlässt nie den Server: Der Browser ruft nur
`supabase.functions.invoke('content-vorschlag')` auf, die Edge Function hält
`ANTHROPIC_API_KEY` als Secret. Anders als `instagram-webhook` in
coach-studio läuft diese Funktion **im Namen der Coachin selbst** (ihr JWT
wird durchgereicht, kein Service-Role-Key) — jede Abfrage respektiert damit
automatisch RLS, keine manuelle `coach_id`-Prüfung nötig.

```bash
supabase functions deploy content-vorschlag
supabase secrets set ANTHROPIC_API_KEY=...
```

## Datenmodell

| Tabelle | Sichtbarkeit | Schreibrecht der Coachin |
|---|---|---|
| `termine` | nur eigene | anlegen/ändern/löschen eigene |
| `challenges` | smile2go-weit (alle zugelassenen Coachinnen) | keins — nur serverseitig (Service-Role) |
| `coach_challenge_teilnahme` | nur eigene | beitreten, als erledigt markieren |
| `hausaufgaben` | nur eigene | anlegen/ändern/löschen eigene |
| `content_vorschlaege` | nur eigene | anlegen (höchstens 1× pro Woche) — nie ändern/löschen |

`termine` und `hausaufgaben` haben ein `erstellt_von`-Feld: `null` bedeutet
von smile2go/einer Mentorin gestellt, sonst von der Coachin selbst
eingetragen — beides landet in derselben Tabelle, RLS unterscheidet nicht
danach.

## Setup

```bash
cd coach-begleiter
npm install
cp .env.example .env.local   # dieselben Werte wie coach-studio/.env.local
npm run dev
```

```bash
npm run build       # Typecheck (tsc -b) + Vite-Produktionsbuild
npm run test        # Vitest, einmalig — 26 Fälle (erinnerungen + contentVorschlag)
npm run test:watch  # Vitest im Watch-Modus
```

### Datenbank


```bash
./supabase/tests/run.sh
```

Spielt zuerst **alle** Migrationen aus `../coach-studio/supabase/migrations`
ein (Abhängigkeit), dann die eigenen, dann 11 Zusicherungen: RLS-Isolation auf
`termine`/`hausaufgaben`/`coach_challenge_teilnahme`/`content_vorschlaege`,
dass `challenges` smile2go-weit lesbar aber nicht von Coachinnen beschreibbar
ist, dass eine Teilnahme die Challenge persönlich macht, dass eine Person
ohne `coach_profile` dieselbe Zulassungsschranke wie in Coach-Studio trifft,
und dass der Unique-Constraint einen zweiten Vorschlag pro Woche verhindert.
Läuft bewusst als Nicht-Superuser (Superuser umgehen RLS).

Für ein echtes Supabase-Projekt: zuerst `coach-studio`s Migrationen
einspielen, danach diese hier — in genau dieser Reihenfolge, sonst schlägt
die Prüfung am Anfang der Migration laut fehl.

## Struktur

```
coach-begleiter/
  supabase/migrations/            Eigene Tabellen (setzt coach-studio voraus)
  supabase/tests/run.sh           Verifikation inkl. coach-studio-Migrationen
  supabase/functions/
    content-vorschlag/            Edge Function (Claude Opus 5, im Namen der Coachin)
    _shared/contentVorschlag.ts   Symlink auf src/lib/contentVorschlag.ts
    deno.json                     Import-Map (zod) für die Edge Function
  src/lib/erinnerungen.ts         Datumsarithmetik "was steht heute an" (rein)
  src/lib/contentVorschlag.ts     Wochenberechnung, Prompt-Aufbau, Zod-Schema (rein)
  src/components/
    AuthGate.tsx                  Prüft Zulassung, vergibt sie nicht
    HeuteAnsicht.tsx               Die eigentliche Ansicht
    ContentVorschlagKarte.tsx     Zeigt/fordert den Wochenvorschlag an
  src/styles/theme.css            Eigenes Sage/Rose-Theme, bewusst kein Plum
```


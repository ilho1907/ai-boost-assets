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

## Bewusst ohne LLM

„Was steht heute für dich an?" ist reine Datumsarithmetik
(`src/lib/erinnerungen.ts`) — ob ein Termin morgen ist oder eine Hausaufgabe
überfällig, entscheidet ein Datumsvergleich, kein Modell-Aufruf. Das ist
schneller, günstiger und zuverlässiger als ein LLM dafür zu befragen.
„Persönlich" entsteht daraus, dass jede Coachin ausschließlich ihre eigenen
Termine/Hausaufgaben sieht und nur die Challenges, denen sie beigetreten ist
— nicht daraus, dass etwas für sie mitdenkt.

**Zweite Ausbaustufe, noch nicht gebaut:** ein wöchentlicher
Content-Themenvorschlag für Coachinnen („diese Woche empfehle ich dir Thema
X") — das ist der Teil, der tatsächlich einen LLM-Aufruf braucht (niedriges
Volumen: einmal pro Coachin pro Woche, damit unkritisch bei den Kosten).

## Datenmodell

| Tabelle | Sichtbarkeit | Schreibrecht der Coachin |
|---|---|---|
| `termine` | nur eigene | anlegen/ändern/löschen eigene |
| `challenges` | smile2go-weit (alle zugelassenen Coachinnen) | keins — nur serverseitig (Service-Role) |
| `coach_challenge_teilnahme` | nur eigene | beitreten, als erledigt markieren |
| `hausaufgaben` | nur eigene | anlegen/ändern/löschen eigene |

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
npm run test        # Vitest, einmalig — 13 Fälle für erinnerungen.ts
npm run test:watch  # Vitest im Watch-Modus
```

### Datenbank

```bash
./supabase/tests/run.sh
```

Spielt zuerst **alle** Migrationen aus `../coach-studio/supabase/migrations`
ein (Abhängigkeit), dann die eigenen, dann 8 Zusicherungen: RLS-Isolation auf
`termine`/`hausaufgaben`/`coach_challenge_teilnahme`, dass `challenges`
smile2go-weit lesbar aber nicht von Coachinnen beschreibbar ist, dass eine
Teilnahme die Challenge persönlich macht, und dass eine Person ohne
`coach_profile` dieselbe Zulassungsschranke wie in Coach-Studio trifft. Läuft
bewusst als Nicht-Superuser (Superuser umgehen RLS).

Für ein echtes Supabase-Projekt: zuerst `coach-studio`s Migrationen
einspielen, danach diese hier — in genau dieser Reihenfolge, sonst schlägt
die Prüfung am Anfang der Migration laut fehl.

## Struktur

```
coach-begleiter/
  supabase/migrations/            Eigene Tabellen (setzt coach-studio voraus)
  supabase/tests/run.sh           Verifikation inkl. coach-studio-Migrationen
  src/lib/erinnerungen.ts         Datumsarithmetik "was steht heute an" (rein)
  src/components/
    AuthGate.tsx                  Prüft Zulassung, vergibt sie nicht
    HeuteAnsicht.tsx               Die eigentliche Ansicht
  src/styles/theme.css            Eigenes Sage/Rose-Theme, bewusst kein Plum
```

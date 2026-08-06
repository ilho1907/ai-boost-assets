# Coach-Studio · Lead-Radar

Verhaltensbasiertes Interesse-Scoring für Coachinnen: "Wer ist warm, wem
schreibe ich heute?" — abgeleitet ausschließlich aus Interaktionen, die ein
Lead mit dem **eigenen** Instagram-Konto der Coachin erzeugt.

## ⚠️ Wichtiger Hinweis zum Kontext dieses Moduls

Das Master-Prompt für dieses Feature ging von einem bereits bestehenden
React+Vite/Supabase-„Coach-Studio"-ERP mit Modulen wie Übersicht, CRM,
Wochenüberblick, Terminen, Inhalten, Produkten und Zahlungen aus. Im Repo
`ai-boost-assets` existiert dieses ERP jedoch nicht — es enthält bislang nur
die statische `ilhova`-Landingpage (`index.html` / `css` / `js`, Creme-Beige-
Gold-Design, kein Backend). Dieses Verzeichnis (`/coach-studio`) ist daher
ein **eigenständiges, neues Modul** und der Grundstein für das im
Master-Prompt beschriebene Coach-Studio — nicht die Integration in ein
bestehendes System, weil keines vorhanden war.

**Offene Annahmen, die dabei getroffen wurden** (bitte vor Produktivbetrieb
gegenprüfen):

- **Design-System:** Es wurde ein eigenes Plum/Rose/Sage/Fraunces-Theme
  (`src/styles/theme.css`) angelegt, unabhängig vom Creme/Beige/Gold-Look der
  bestehenden Landingpage — wie im Master-Prompt gefordert, aber im
  Widerspruch zur aktuellen Optik der Website.
- **Auth-Modell:** `coach_id` wird mit `auth.uid()` gleichgesetzt (eine
  Coachin = ein Supabase-Auth-User). Falls das künftige Coach-Studio ein
  anderes Rollenmodell (z. B. eine separate `coaches`-Tabelle mit eigener
  ID) nutzt, müssen die RLS-Policies in der Migration entsprechend angepasst
  werden.
- **Score-Persistenz:** `lead_scores` wird als Tabelle für periodisch
  vorberechnete Werte modelliert (z. B. durch einen Cron-/Edge-Function-Job),
  die UI in `LeadRadar.tsx` berechnet den Score aber zusätzlich **live**
  client-seitig aus `lead_interactions` (über die reine Funktion
  `berechneScore`), damit die Ansicht nach einer frischen Interaktion sofort
  aktuell ist. Ein separater Scoring-Job, der `lead_scores` befüllt, ist
  hier **nicht** enthalten (kein Server-/Edge-Function-Runtime im Repo
  vorhanden) und müsste ergänzt werden, sobald ein Deployment-Ziel feststeht.
- **"Aktion ausführen"-Button:** Vereinfachte MVP-Interpretation — setzt den
  Lead-Status auf `kontaktiert` und protokolliert eine manuelle
  Dummy-Interaktion. Die tatsächliche Nachricht wird nicht in-app verschickt
  (kein Instagram-Send-Flow im Scope dieses Master-Prompts).
- **Kein bestehendes Wochenüberblick-Modul zum Referenzieren vorhanden** —
  der Signal-Triage-Look (kritisch/warnung/aktiv/neu) wurde daher aus der
  Beschreibung im Master-Prompt sinngemäß auf warm/lauwarm/kalt übertragen,
  nicht von echtem Bestandscode übernommen.

Falls eines dieser Constraints nicht zum tatsächlichen Zielsystem passt,
bitte vor dem produktiven Einsatz Rücksprache halten.

---

## Setup

```bash
cd coach-studio
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY eintragen
npm run dev
```

Weitere Skripte:

```bash
npm run build       # Typecheck (tsc -b) + Vite-Produktionsbuild
npm run test        # Vitest, einmalig
npm run test:watch  # Vitest im Watch-Modus
```

### Datenbank

Die Migration liegt unter `supabase/migrations/20260806120000_lead_radar.sql`.
Einspielen z. B. via Supabase CLI:

```bash
supabase db push
```

oder Inhalt direkt im SQL-Editor des Supabase-Dashboards ausführen. Die
Migration ist idempotent (`create table if not exists`, `create or replace
function`, `drop trigger if exists … create trigger …`) und kann gefahrlos
mehrfach angewendet werden.

**Supabase-Region:** Für EU-Datenresidenz ein Projekt in einer EU-Region
(z. B. `eu-central-1`) anlegen.

---

## Instagram Graph API — Anbindung & Scopes

Lead-Radar liest **ausschließlich** Daten aus dem eigenen Business/Creator-
Konto der Coachin über die offizielle Instagram Graph API. Es gibt **keinen**
Code-Pfad, der ein fremdes Lead-Profil ausliest (keine Following-Listen,
keine fremden Posts/Stories, kein Scraping, keine inoffiziellen Endpunkte).

### OAuth-Flow (skizziert)

1. Coachin verbindet ihr Instagram-Business-/Creator-Konto über
   **Facebook-Login für Business** (Instagram-Konten hängen an einer
   Facebook-Seite).
2. Angefragte Scopes (Meta Graph API, Stand aktueller Instagram-Platform-
   Dokumentation — vor Go-Live gegen die aktuelle Meta-Doku prüfen, da sich
   Scope-Namen ändern können):
   - `instagram_basic` — Zugriff auf das eigene IG-Business-Konto
   - `instagram_manage_comments` — eigene Kommentare/Mentions lesen
   - `instagram_manage_insights` — Insights zu eigenen Media-Objekten
   - `pages_show_list`, `pages_read_engagement` — verknüpfte Facebook-Seite
     auflösen
   - `instagram_manage_messages` (Messaging-API) — Konversationen/DM-Antworten
     auf das eigene Konto lesen
3. Das erhaltene Access-Token wird serverseitig gespeichert (nicht im
   Client), inkl. Refresh-Handling gemäß Meta-Token-Lebensdauer.

### Ingestion (Webhook/Poll-Job, außerhalb dieses Repos zu deployen)

Ein Server-Job (z. B. Supabase Edge Function) mappt eingehende Ereignisse auf
`lead_interactions`:

| Instagram-Quelle | `typ` | Bedingung |
|---|---|---|
| Comment auf eigenem Media | `kommentar` | Absender-Handle == `leads.instagram_handle` eines Leads mit `consent_tracking = true` |
| Mention/Story-Reply auf eigenem Media | `story_reaktion` | s.o. |
| Conversation-Message (Messaging-API), Coachin antwortet | `dm_antwort` | s.o. |
| Media-Insights (Likes/Saves auf eigene Posts, aggregiert) | `like` / `save` | Nur wenn IG pro-Nutzer-Zuordnung liefert; sonst siehe unten |

**Grenzen der Graph API:** Für Likes/Saves liefert die Instagram Graph API in
der Regel nur **aggregierte** Insights auf eigene Media-Objekte, keine
Liste einzelner Nutzer:innen. Wo eine nutzerscharfe Zuordnung technisch nicht
verfügbar ist, wird das sauber als „nicht verfügbar" behandelt (kein
`lead_interactions`-Eintrag) — es wird **nicht** versucht, das über
inoffizielle Wege zu umgehen.

Vor jedem Insert prüft der DB-Trigger `lead_interactions_enforce_consent`
zusätzlich serverseitig, dass der Lead `consent_tracking = true` hat — das
Consent-Gating ist damit nicht nur Anwendungslogik, sondern in der Datenbank
erzwungen.

---

## DSGVO: Consent, Löschung (Art. 17), Export (Art. 20)

- **Rechtsgrundlage:** Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Jeder Lead
  hat `consent_tracking` (bool) + `consent_at` (Zeitstempel, automatisch
  durch Trigger gesetzt/gelöscht beim Umschalten). Ohne aktive Einwilligung
  werden **keine** Interaktionen gespeichert — Kontaktstammdaten
  (Name, Notiz, Status) bleiben davon unberührt.
- **Widerruf:** Schalter in `LeadVerknuepfen` erneut auf „aus" stellen →
  `consent_at` wird geleert, künftige Interaktions-Inserts werden vom
  DB-Trigger abgelehnt. Bereits gespeicherte Interaktionen bleiben bestehen,
  bis explizit gelöscht wird (siehe Art. 17 unten) — je nach Auslegung ggf.
  ergänzend automatisiert löschen.
- **Löschung (Art. 17):** `select public.lead_delete_cascade('<lead_id>');`
  löscht den Lead und kaskadiert automatisch auf `lead_interactions` und
  `lead_scores` (`on delete cascade`). Läuft mit den Rechten der aufrufenden
  Coachin (`security invoker`) und ist zusätzlich durch RLS abgesichert.
- **Export (Art. 20):** View `public.lead_export_v` liefert alle Stamm- und
  Scoring-Daten eines Leads in einer Zeile (`security_invoker = true`, damit
  RLS der Basistabellen greift — bewusst **kein** `security_definer`, um den
  bekannten Cross-Tenant-Leak-Vektor zu vermeiden). Abfrage z. B.:
  `select * from public.lead_export_v where lead_id = '<id>';`

## EU AI Act — Scope-Begrenzung

`scoring.ts` verarbeitet ausschließlich Zähl-/Recency-Signale (Interaktions-
typ + Zeitstempel + Gewicht). Es findet **keine** Text-, Emotions- oder
Persönlichkeitsanalyse statt; `raw_ref` speichert nur eine IG-Objekt-ID zur
Nachverfolgbarkeit, keine Rohtexte von DMs/Kommentaren.

## Struktur

```
coach-studio/
  supabase/migrations/   SQL-Migration (Tabellen, RLS, Consent-Trigger)
  src/lib/scoring.ts      reine Scoring- + Nächste-Aktion-Funktionen
  src/lib/scoring.test.ts Vitest-Suite
  src/lib/supabaseClient.ts
  src/components/         LeadRadar, LeadKarte, LeadVerknuepfen
  src/types/leadRadar.ts  Typen passend zum DB-Schema
  src/styles/theme.css    Plum/Rose/Sage, Fraunces
```

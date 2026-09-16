# Coach-Studio · Lead-Radar

Verhaltensbasiertes Interesse-Scoring für Coachinnen: „Wer ist warm, wem
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
  ID) nutzt, müssen die RLS-Policies entsprechend angepasst werden.
- **Score-Persistenz:** Der Score wird live aus `lead_interactions` berechnet,
  nicht vorgehalten. Die ursprünglich vorgesehene Tabelle `lead_scores` wurde
  wieder entfernt: sie wurde nie befüllt, und eine leere Tabelle, die aussieht
  als enthielte sie die Wahrheit, ist schlimmer als keine.
- **Kein bestehendes Wochenüberblick-Modul zum Referenzieren vorhanden** —
  der Signal-Triage-Look wurde sinngemäß auf warm/lauwarm/kalt übertragen.

Falls eines dieser Constraints nicht zum tatsächlichen Zielsystem passt,
bitte vor dem produktiven Einsatz Rücksprache halten.

## Was fehlt noch zum Produktivbetrieb

- **OAuth-Callback**, der das IG-Konto verknüpft und den Access-Token
  schreibt. Braucht eine registrierte Meta-App (App ID/Secret) und eine
  öffentliche Redirect-URL; bis dahin lässt sich eine Verknüpfung nur manuell
  in `coach_instagram_konten` eintragen.
- **Meta App Review** für die Messaging- und Comment-Scopes (dauert Wochen).
- **Kalibrierung der Gewichte** an echten Daten: die Werte (40/15/8/6/5/2),
  Schwellen (20/50) und die Halbwertszeit (14 Tage) sind begründete
  Vorschläge, aber nicht empirisch validiert.

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

Die Migrationen liegen unter `supabase/migrations/`. Einspielen via Supabase
CLI (`supabase db push`) oder direkt im SQL-Editor des Dashboards. Sie sind
idempotent und können gefahrlos mehrfach angewendet werden.

**Schema lokal verifizieren** — ohne Supabase-Projekt, gegen ein echtes
PostgreSQL 16:

```bash
./supabase/tests/run.sh
```

Das Skript startet eine Wegwerf-Datenbank, bildet nach, was Supabase
bereitstellt (`auth`-Schema, `auth.uid()`, Rolle `authenticated`), spielt alle
Migrationen ein und prüft 16 Zusicherungen: Mandantentrennung über RLS
(inklusive Export-View), das Consent-Gate, das Abräumen abgeleiteter Daten beim
Widerruf, Default-Gewichte, Deduplizierung wiederholter Webhook-Zustellungen,
die Unlesbarkeit des Access-Tokens für angemeldete Nutzerinnen, das Nachführen
der letzten Berührung und die Kaskadenlöschung nach Art. 17.

Die Tests laufen bewusst als **Nicht-Superuser** — Superuser umgehen RLS, ein
Test als `postgres` würde also nichts beweisen. Das Skript darf daher nicht als
`root` gestartet werden.

**Supabase-Region:** Für EU-Datenresidenz ein Projekt in einer EU-Region
(z. B. `eu-central-1`) anlegen.

### Anmeldung

Passwortlos per Magic Link (`signInWithOtp`). Ohne angemeldete Coachin ist
`auth.uid()` null und die RLS-Policies geben keine Zeile heraus — deshalb steht
`AuthGate` zwingend vor dem Lead-Radar. Fehlen die Supabase-Zugangsdaten ganz,
erklärt die Oberfläche das, statt leer zu bleiben.

In den Supabase-Einstellungen muss die Domain der App als Redirect-URL
hinterlegt sein, sonst führt der Link ins Leere.

---

## Klientinnen: Betreuung statt Score

Wer bereits gebucht hat, lässt sich nicht sinnvoll danach sortieren, wie
interessiert sie wirkt — sie hat sich längst entschieden. Leads mit
`status = 'client'` stehen deshalb nicht in der warm/lauwarm/kalt-Triage,
sondern in einem eigenen Bereich mit einer anderen Leitfrage: **wann war
zuletzt Kontakt?**

| Stufe | Bedingung | Empfehlung |
|---|---|---|
| Im Fluss | Kontakt in den letzten 14 Tagen | „Alles im Fluss" (Prio 3) |
| Check-in fällig | 14–29 Tage | „Kurzes Check-in" (Prio 2) |
| Lange still | ab 30 Tagen | „Persönlich nachfragen" (Prio 1) |
| — | noch kein Kontakt | „Ankommen begleiten" (Prio 2) |

Der entscheidende Unterschied zum Lead-Scoring: hier zählt **jeder** Kontakt,
auch der von der Coachin ausgehende. Beim Lead misst der Score das Interesse
des Leads, eine eigene Nachricht darf ihn also nicht heben. Bei einer Klientin
ist eine Nachricht der Coachin sehr wohl Kontakt. Gepflegt wird der Wert in
`leads.letzte_beruehrung_at` durch einen Trigger auf `lead_interactions`,
damit die Ansicht ohne Auswertung aller Zeilen stimmt.

Klientinnen erscheinen gleichberechtigt in der „Heute zu tun"-Leiste: eine
Begleitung, die einschläft, wiegt schwerer als ein lauwarmer Lead.

---

## Instagram Graph API — Anbindung & Scopes

Lead-Radar liest **ausschließlich** Daten aus dem eigenen Business/Creator-
Konto der Coachin über die offizielle Instagram Graph API. Es gibt **keinen**
Code-Pfad, der ein fremdes Lead-Profil ausliest (keine Following-Listen,
keine fremden Posts/Stories, kein Scraping, keine inoffiziellen Endpunkte).

### OAuth-Flow (skizziert, noch nicht implementiert)

1. Coachin verbindet ihr Instagram-Business-/Creator-Konto über
   **Facebook-Login für Business** (Instagram-Konten hängen an einer
   Facebook-Seite).
2. Angefragte Scopes (vor Go-Live gegen die aktuelle Meta-Doku prüfen, da sich
   Scope-Namen regelmäßig ändern):
   - `instagram_basic` — Zugriff auf das eigene IG-Business-Konto
   - `instagram_manage_comments` — eigene Kommentare/Mentions lesen
   - `instagram_manage_insights` — Insights zu eigenen Media-Objekten
   - `instagram_manage_messages` — eigene Konversationen lesen
   - `pages_show_list`, `pages_read_engagement` — verknüpfte Facebook-Seite
3. Der Access-Token wird **serverseitig** in `coach_instagram_konten`
   gespeichert, inkl. Refresh gemäß Meta-Token-Lebensdauer.

### Ingestion (Instagram-Webhook)

Die Edge Function unter `supabase/functions/instagram-webhook/` nimmt die
Ereignisse entgegen:

```bash
supabase functions deploy instagram-webhook --no-verify-jwt
supabase secrets set IG_APP_SECRET=... IG_VERIFY_TOKEN=...
```

`--no-verify-jwt` ist nötig, weil Meta kein Supabase-JWT mitschickt. Die
Authentizität kommt stattdessen aus der **HMAC-Signatur**: jede POST-Anfrage
wird gegen `X-Hub-Signature-256` geprüft (HMAC-SHA256 über den rohen Body mit
dem App Secret), der Vergleich läuft in konstanter Zeit. Ohne gültige Signatur:
401.

Die Zuordnungslogik liegt in `src/lib/instagramIngest.ts` — rein und ohne
Netzwerk testbar. `supabase/functions/_shared/instagramIngest.ts` ist ein
Symlink darauf, damit Browser und Deno dieselbe Quelle benutzen; ein Typ-Test
schlägt fehl, falls die Interaktionstypen je auseinanderlaufen.

| Instagram-Ereignis | wird zu | Bedingung |
|---|---|---|
| Nachricht vom Lead | `dm_antwort`, eingehend | Absender ist einem Lead zugeordnet |
| Nachricht mit `reply_to.story` | `story_reaktion`, eingehend | dito |
| Nachricht mit `is_echo` | `dm_antwort`, **ausgehend** | von der Coachin gesendet |
| Kommentar auf eigenem Medium | `kommentar`, eingehend | nicht vom eigenen Konto |
| Mention | `story_reaktion`, eingehend | — |

Zuordnung zuerst über die gespeicherte IGSID, ersatzweise über den manuell
hinterlegten Handle; beim ersten Treffer wird die IGSID nachgetragen, damit die
Zuordnung stabil bleibt (Handles sind änderbar). Ohne Treffer oder ohne
Einwilligung wird nichts geschrieben — das ist der Normalfall für alle, die
nicht im Lead-Radar geführt werden, kein Fehler.

Meta stellt Webhooks **mindestens einmal** zu, oft mehrfach. Ein Unique-Index
auf `(coach_id, raw_ref)` plus Upsert verhindert, dass eine wiederholte
Zustellung den Score ein zweites Mal anhebt.

**Richtung.** Ohne `is_echo` ließe sich „unbeantwortete DM" nur raten. Mit der
Spalte `richtung` zählt der Score ausschließlich eingehende Signale — er misst
das Interesse des Leads, nicht die Aktivität der Coachin —, während ausgehende
Nachrichten den Wartezustand beenden. Erst dadurch verschwindet die Empfehlung
„Antworten", sobald wirklich geantwortet wurde.

**Access-Token.** Er liegt in `coach_instagram_konten` und wird der Rolle
`authenticated` spaltenweise entzogen. RLS allein genügt hier nicht: eine
Coachin darf ihre eigene Zeile ja sehen — ohne den Entzug läge ihr Token im
Browser.

### Grenzen der Graph API

Für Likes/Saves liefert die Instagram Graph API in der Regel nur
**aggregierte** Insights auf eigene Media-Objekte, keine Liste einzelner
Nutzer:innen. Wo eine nutzerscharfe Zuordnung technisch nicht verfügbar ist,
wird das sauber als „nicht verfügbar" behandelt (kein Eintrag) — es wird
**nicht** versucht, das über inoffizielle Wege zu umgehen.

### Follow-Status („Folgt sie dir?")

Eine **Follower-Liste gibt die Graph API grundsätzlich nicht her** — weder für
fremde noch für das eigene Konto; verfügbar ist nur `followers_count` sowie
aggregierte Demografie. Es gibt jedoch genau eine offizielle Stelle, an der
der Follow-Status pro Person auftaucht: die **Messaging User-Profile-API**
liefert zu einer IGSID unter anderem `is_user_follow_business` und
`is_business_follow_user`.

Voraussetzung ist eine **bestehende Konversation** — eine IGSID entsteht erst,
wenn die Person das Konto der Coachin selbst angeschrieben hat. Beliebige
Profile lassen sich damit nicht abfragen, und genau deshalb passt dieses
Signal in die Feature-Grenze: es entsteht durch die Interaktion des Leads mit
der Coachin.

Umsetzung im Code:

- `src/lib/instagramProfil.ts` — reine, testbare Auswertung der API-Antwort.
- Fehlt das Feld in der Antwort, bleibt der Status bewusst `null`
  („unbekannt") statt auf `false` geraten zu werden.
- Gespeichert in `leads.folgt_coach`, abgesichert durch den CHECK-Constraint
  `leads_folgt_coach_consent_chk`: **ohne Einwilligung kein Follow-Status**.
  Beim Widerruf wird der Wert automatisch mitgelöscht (Datenminimierung).
- Der Status fließt **nicht** in den Score ein — der bleibt rein
  ereignisbasiert mit Decay, während „folgt" ein Dauerzustand ist. Er
  verfeinert nur die Empfehlung: ein stiller Lead, der weiterhin folgt, wird
  „sanft angeknüpft" statt archiviert.

⚠️ Feldnamen und Scopes vor dem Produktivgang gegen die aktuelle
Meta-Dokumentation prüfen.

### TikTok — bewusst nicht unterstützt

TikTok besitzt zwar einen Follower-Endpunkt
(`v2/research/user/followers/`), dieser gehört jedoch zur **Research API**,
die ausschließlich qualifizierten akademischen und gemeinnützigen
Einrichtungen offensteht und **kommerzielle Nutzung ausdrücklich untersagt**.
Die kommerziell nutzbare Display API bietet lediglich `user.info.basic` und
`video.list` — keine Follower-Liste und keinen Follow-Status. Eine
TikTok-Anbindung ist damit für dieses Produkt nicht umsetzbar; Anbieter, die
solche Daten dennoch verkaufen, sind Scraper und durch die Projekt-Constraints
ausgeschlossen.

---

## DSGVO: Consent, Löschung (Art. 17), Export (Art. 20)

- **Rechtsgrundlage:** Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Jeder Lead
  hat `consent_tracking` + `consent_at` (automatisch durch Trigger gesetzt
  bzw. geleert). Ohne aktive Einwilligung werden **keine** Interaktionen
  gespeichert — Kontaktstammdaten (Name, Notiz, Status) bleiben unberührt.
- **Widerruf:** Schalter in `LeadVerknuepfen` auf „aus" → `consent_at` und
  `folgt_coach` werden geleert, künftige Interaktions-Inserts lehnt der
  DB-Trigger ab. Bereits gespeicherte Interaktionen bleiben bestehen, bis
  explizit gelöscht wird — je nach Auslegung ggf. ergänzend automatisiert
  löschen.
- **Löschung (Art. 17):** `select public.lead_delete_cascade('<lead_id>');`
  löscht den Lead und kaskadiert auf `lead_interactions`.
  Läuft mit den Rechten der aufrufenden Coachin (`security invoker`) und ist
  zusätzlich durch RLS abgesichert. Im Test verifiziert.
- **Export (Art. 20):** View `public.lead_export_v` liefert alle Stamm- und
  Scoring-Daten eines Leads in einer Zeile (`security_invoker = true`, damit
  RLS der Basistabellen greift — bewusst **kein** `security_definer`, um den
  bekannten Cross-Tenant-Leak-Vektor zu vermeiden).

## EU AI Act — Scope-Begrenzung

`scoring.ts` verarbeitet ausschließlich Zähl-/Recency-Signale (Interaktions-
typ + Zeitstempel + Gewicht). Es findet **keine** Text-, Emotions- oder
Persönlichkeitsanalyse statt; `raw_ref` speichert nur eine IG-Objekt-ID zur
Deduplizierung, keine Rohtexte von DMs oder Kommentaren. Ein Test stellt
sicher, dass Nachrichtentext den Mapper nicht verlässt.

## Struktur

```
coach-studio/
  supabase/migrations/            SQL-Migrationen (Tabellen, RLS, Trigger)
  supabase/tests/run.sh           Schema-Verifikation gegen echtes Postgres 16
  supabase/functions/
    instagram-webhook/            Edge Function (HMAC-Prüfung, Ingestion)
    _shared/instagramIngest.ts    Symlink auf src/lib/instagramIngest.ts
  src/lib/scoring.ts              Scoring- + Nächste-Aktion-Funktionen (rein)
  src/lib/instagramIngest.ts      Webhook → lead_interactions (rein)
  src/lib/instagramProfil.ts      Follow-Status aus der User-Profile-API (rein)
  src/components/                 AuthGate, Anmeldung, LeadRadar, LeadKarte,
                                  LeadVerknuepfen, LeadAnlegen, KlientinKarte
  src/types/leadRadar.ts          Typen passend zum DB-Schema
  src/styles/theme.css            Plum/Rose/Sage, Fraunces
```

## Tests

```bash
npm run test              # 78 Vitest-Fälle (Logik + Komponenten)
./supabase/tests/run.sh   # 16 Schema-Zusicherungen gegen PostgreSQL 16
```

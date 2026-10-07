/**
 * Instagram-Webhook → lead_interactions.
 *
 * Verarbeitet ausschliesslich Ereignisse auf dem EIGENEN Business-/Creator-
 * Konto der Coachin: Kommentare und Mentions auf eigenen Medien sowie
 * Nachrichten in eigenen Konversationen. Es werden keine Fremdprofile
 * abgefragt und keine inoffiziellen Endpunkte benutzt.
 *
 * Bewusst KEINE Textspeicherung: von Kommentaren und DMs wandert nur die
 * IG-Objekt-ID (`raw_ref`) in die Datenbank, nie der Inhalt. Der Score misst
 * Haeufigkeit und Aktualitaet, nicht Bedeutung (EU AI Act).
 *
 * Alles hier ist rein und ohne Netzwerk testbar; der Aufrufer (Edge Function)
 * reicht die bereits empfangene Payload herein.
 */

/**
 * Interaktionstypen. Bewusst hier lokal deklariert statt aus scoring.ts
 * importiert: dieses Modul laeuft auch in der Deno-Edge-Function, wo
 * erweiterungslose Importe nicht aufloesen. Ein Typ-Test in
 * instagramIngest.test.ts schlaegt fehl, sollten die beiden Listen je
 * auseinanderlaufen.
 */
export type InteraktionsTyp =
  | 'erstgespraech'
  | 'dm_antwort'
  | 'story_reaktion'
  | 'kommentar'
  | 'save'
  | 'like';

export type Richtung = 'eingehend' | 'ausgehend';

/** Eine aus dem Webhook abgeleitete, noch nicht zugeordnete Interaktion. */
export interface InteraktionsKandidat {
  /** IGSID der Gegenseite — der Schluessel, über den ein Lead zugeordnet wird. */
  igsid: string | null;
  /** Username, falls der Webhook ihn mitliefert (Kommentare tun das, DMs nicht). */
  username: string | null;
  typ: InteraktionsTyp;
  richtung: Richtung;
  occurredAt: Date;
  /** IG-Objekt-ID zur Deduplizierung wiederholter Zustellungen. */
  rawRef: string | null;
}

// --- Rohformen der Meta-Payload, soweit ausgewertet -----------------------

interface WebhookAbsender {
  id?: string;
  username?: string;
}

interface WebhookNachricht {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  /** Gesetzt, wenn die Nachricht eine Antwort auf eine Story ist. */
  reply_to?: { story?: { id?: string } };
}

interface WebhookMessagingEintrag {
  sender?: WebhookAbsender;
  recipient?: WebhookAbsender;
  timestamp?: number;
  message?: WebhookNachricht;
}

interface WebhookAenderung {
  field?: string;
  value?: {
    id?: string;
    comment_id?: string;
    media_id?: string;
    from?: WebhookAbsender;
    media?: { id?: string };
  };
}

interface WebhookEintrag {
  id?: string;
  time?: number;
  changes?: WebhookAenderung[];
  messaging?: WebhookMessagingEintrag[];
}

export interface WebhookPayload {
  object?: string;
  entry?: WebhookEintrag[];
}

// -------------------------------------------------------------------------

/** Meta liefert Sekunden, teils Millisekunden — beides robust umwandeln. */
function zuDatum(zeit: number | undefined, ersatz: Date): Date {
  if (typeof zeit !== 'number' || !Number.isFinite(zeit)) return ersatz;
  const ms = zeit > 1e11 ? zeit : zeit * 1000;
  const datum = new Date(ms);
  return Number.isNaN(datum.getTime()) ? ersatz : datum;
}

/**
 * Zerlegt eine Webhook-Payload in Interaktions-Kandidaten.
 *
 * @param igKontoId  Die IG-Konto-ID der Coachin. Nachrichten, die von diesem
 *                   Konto stammen, sind ausgehend — auch ohne `is_echo`.
 */
export function mappeWebhook(
  payload: WebhookPayload,
  igKontoId: string,
  jetzt: Date = new Date()
): InteraktionsKandidat[] {
  if (payload?.object !== 'instagram' || !Array.isArray(payload.entry)) return [];

  const kandidaten: InteraktionsKandidat[] = [];

  for (const eintrag of payload.entry) {
    const eintragsZeit = zuDatum(eintrag?.time, jetzt);

    // --- Nachrichten (DMs und Story-Antworten) ---
    for (const nachricht of eintrag?.messaging ?? []) {
      const inhalt = nachricht?.message;
      if (!inhalt) continue;

      const absenderId = nachricht.sender?.id ?? null;
      const istEcho = inhalt.is_echo === true || absenderId === igKontoId;

      // Bei ausgehenden Nachrichten ist die Gegenseite der Empfaenger.
      const gegenseite = istEcho ? nachricht.recipient?.id ?? null : absenderId;
      if (!gegenseite || gegenseite === igKontoId) continue;

      const istStoryAntwort = Boolean(inhalt.reply_to?.story);

      kandidaten.push({
        igsid: gegenseite,
        username: null, // Die Messaging-Payload enthaelt keinen Username.
        typ: istStoryAntwort ? 'story_reaktion' : 'dm_antwort',
        richtung: istEcho ? 'ausgehend' : 'eingehend',
        occurredAt: zuDatum(nachricht.timestamp, eintragsZeit),
        rawRef: inhalt.mid ?? null,
      });
    }

    // --- Kommentare und Mentions auf eigenen Medien ---
    for (const aenderung of eintrag?.changes ?? []) {
      const wert = aenderung?.value;
      if (!wert) continue;

      if (aenderung.field === 'comments') {
        const absenderId = wert.from?.id ?? null;
        // Eigene Kommentare unter eigenen Beitraegen sind kein Lead-Signal.
        if (absenderId && absenderId === igKontoId) continue;

        kandidaten.push({
          igsid: absenderId,
          username: wert.from?.username ?? null,
          typ: 'kommentar',
          richtung: 'eingehend',
          occurredAt: eintragsZeit,
          rawRef: wert.id ?? null,
        });
        continue;
      }

      if (aenderung.field === 'mentions') {
        kandidaten.push({
          igsid: wert.from?.id ?? null,
          username: wert.from?.username ?? null,
          typ: 'story_reaktion',
          richtung: 'eingehend',
          occurredAt: eintragsZeit,
          rawRef: wert.comment_id ?? wert.media_id ?? null,
        });
      }
      // Andere Felder (z. B. Insights-Aggregate) liefern keine
      // nutzerscharfe Zuordnung — sie werden bewusst ignoriert statt geraten.
    }
  }

  return kandidaten;
}

/** Minimale Lead-Sicht, die für die Zuordnung gebraucht wird. */
export interface ZuordenbarerLead {
  id: string;
  instagram_handle: string | null;
  instagram_scoped_id: string | null;
  consent_tracking: boolean;
}

export interface ZuordnungsErgebnis {
  /** Schreibfertige Zeilen für lead_interactions. */
  zeilen: {
    coach_id: string;
    lead_id: string;
    typ: InteraktionsTyp;
    richtung: Richtung;
    occurred_at: string;
    quelle: 'instagram';
    raw_ref: string | null;
  }[];
  /** IGSIDs, die zu einem Lead per Handle passen, aber noch keine ID gespeichert haben. */
  igsidNachzutragen: { leadId: string; igsid: string }[];
  /** Wie viele Kandidaten verworfen wurden — für Logging, nicht für Scoring. */
  verworfenOhneLead: number;
  verworfenOhneConsent: number;
}

/**
 * Ordnet Kandidaten den Leads einer Coachin zu.
 *
 * Zuordnung zuerst über die gespeicherte IGSID, ersatzweise über den
 * Instagram-Handle (den die Coachin manuell hinterlegt hat). Ohne Treffer
 * oder ohne Einwilligung wird nichts geschrieben — das ist kein Fehler,
 * sondern der Normalfall für alle, die nicht im Lead-Radar geführt werden.
 */
export function ordneZu(
  kandidaten: InteraktionsKandidat[],
  leads: ZuordenbarerLead[],
  coachId: string
): ZuordnungsErgebnis {
  const perIgsid = new Map<string, ZuordenbarerLead>();
  const perHandle = new Map<string, ZuordenbarerLead>();

  for (const lead of leads) {
    if (lead.instagram_scoped_id) perIgsid.set(lead.instagram_scoped_id, lead);
    if (lead.instagram_handle) perHandle.set(lead.instagram_handle.toLowerCase(), lead);
  }

  const ergebnis: ZuordnungsErgebnis = {
    zeilen: [],
    igsidNachzutragen: [],
    verworfenOhneLead: 0,
    verworfenOhneConsent: 0,
  };
  const bereitsNachgetragen = new Set<string>();

  for (const kandidat of kandidaten) {
    let lead: ZuordenbarerLead | undefined;

    if (kandidat.igsid) lead = perIgsid.get(kandidat.igsid);
    if (!lead && kandidat.username) lead = perHandle.get(kandidat.username.toLowerCase());

    if (!lead) {
      ergebnis.verworfenOhneLead += 1;
      continue;
    }
    if (!lead.consent_tracking) {
      ergebnis.verworfenOhneConsent += 1;
      continue;
    }

    // Beim ersten Treffer über den Handle die IGSID nachtragen, damit die
    // Zuordnung danach stabil über die ID läuft (Handles sind änderbar).
    if (kandidat.igsid && !lead.instagram_scoped_id && !bereitsNachgetragen.has(lead.id)) {
      ergebnis.igsidNachzutragen.push({ leadId: lead.id, igsid: kandidat.igsid });
      bereitsNachgetragen.add(lead.id);
    }

    ergebnis.zeilen.push({
      coach_id: coachId,
      lead_id: lead.id,
      typ: kandidat.typ,
      richtung: kandidat.richtung,
      occurred_at: kandidat.occurredAt.toISOString(),
      quelle: 'instagram',
      raw_ref: kandidat.rawRef,
    });
  }

  return ergebnis;
}

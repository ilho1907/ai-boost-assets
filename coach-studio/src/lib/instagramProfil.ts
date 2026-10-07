/**
 * Instagram Messaging User-Profile-API → Follow-Status eines Leads.
 *
 * Meta liefert `is_user_follow_business` nur fuer Personen, die bereits eine
 * Konversation mit dem eigenen Business-/Creator-Konto der Coachin eroeffnet
 * haben — erst dann existiert eine IGSID (Instagram-Scoped ID). Ein Abruf
 * beliebiger Fremdprofile ist damit ausgeschlossen, und eine Follower-Liste
 * gibt die Graph API generell nicht her.
 *
 * Die Zuordnungslogik hier ist rein und ohne Netzwerkzugriff testbar; der
 * Aufrufer reicht die bereits geholte API-Antwort herein.
 *
 * ⚠️ Feldnamen und Scopes gegen die aktuelle Meta-Dokumentation pruefen, bevor
 * das produktiv geht — Meta benennt Scopes regelmaessig um.
 */

/** Rohantwort der User-Profile-API, soweit wir sie auswerten. */
export interface IgUserProfileAntwort {
  name?: string;
  username?: string;
  follower_count?: number;
  is_verified_user?: boolean;
  /** Folgt die Person dem Konto der Coachin? */
  is_user_follow_business?: boolean;
  /** Folgt die Coachin der Person? */
  is_business_follow_user?: boolean;
}

/** true = folgt, false = folgt nicht, null = unbekannt / von Meta nicht geliefert. */
export type FolgtStatus = boolean | null;

export interface FollowStatusErgebnis {
  folgtCoach: FolgtStatus;
  /** Zeitpunkt der Ermittlung, wird als leads.folgt_coach_at gespeichert. */
  ermitteltAt: Date;
}

/**
 * Liest den Follow-Status aus einer API-Antwort. Fehlt das Feld — etwa weil
 * Meta es fuer diese Konversation nicht ausliefert — bleibt der Status
 * bewusst `null` ("unbekannt") statt auf `false` geraten zu werden.
 */
export function leseFollowStatus(
  antwort: IgUserProfileAntwort | null | undefined,
  jetzt: Date = new Date()
): FollowStatusErgebnis {
  const wert = antwort?.is_user_follow_business;
  return {
    folgtCoach: typeof wert === 'boolean' ? wert : null,
    ermitteltAt: jetzt,
  };
}

/**
 * Baut das Update-Objekt fuer die `leads`-Zeile. Ohne Einwilligung wird der
 * Follow-Status verworfen — dieselbe Regel erzwingt zusaetzlich der
 * CHECK-Constraint `leads_folgt_coach_consent_chk` in der Datenbank.
 */
export function baueFollowStatusUpdate(
  ergebnis: FollowStatusErgebnis,
  consentTracking: boolean
): { folgt_coach: boolean | null; folgt_coach_at: string | null } | null {
  if (!consentTracking) return null;
  if (ergebnis.folgtCoach === null) return null;
  return {
    folgt_coach: ergebnis.folgtCoach,
    folgt_coach_at: ergebnis.ermitteltAt.toISOString(),
  };
}

/** Beschriftung fuer die LeadKarte. */
export function folgtStatusLabel(status: FolgtStatus): string {
  if (status === true) return 'Folgt dir';
  if (status === false) return 'Folgt dir nicht';
  return 'Folgt-Status unbekannt';
}

/**
 * URL fuer den Profilabruf. Wird vom serverseitigen Ingestion-Job verwendet —
 * das Access-Token darf niemals in den Client gelangen.
 */
export function profilAbrufUrl(igsid: string, apiVersion = 'v23.0'): string {
  const felder = [
    'name',
    'username',
    'follower_count',
    'is_verified_user',
    'is_user_follow_business',
    'is_business_follow_user',
  ].join(',');
  return `https://graph.instagram.com/${apiVersion}/${encodeURIComponent(igsid)}?fields=${felder}`;
}

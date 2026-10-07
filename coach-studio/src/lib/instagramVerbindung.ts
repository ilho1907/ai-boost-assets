/**
 * Zustand der Instagram-Verbindung einer Coachin.
 *
 * Metas langlebige Access-Tokens laufen nach rund 60 Tagen ab. Ohne sichtbare
 * Warnung ist das ein stiller Ausfall: der Webhook liefert nichts mehr, es
 * erscheint keine Fehlermeldung, und die Oberfläche sieht weiter normal aus —
 * nur die Scores altern langsam vor sich hin. Genau diese Stille ist das
 * Problem, nicht der Ablauf selbst.
 *
 * Rein und ohne Netzwerk testbar; der Aufrufer reicht die gelesene Zeile herein.
 */

export type VerbindungsStufe =
  | 'nicht_verbunden'
  | 'aktiv'
  | 'laeuft_bald_ab'
  | 'abgelaufen';

export interface VerbindungsZustand {
  stufe: VerbindungsStufe;
  /** Volle Tage bis zum Ablauf; negativ, wenn bereits abgelaufen. null, wenn unbekannt. */
  tageBisAblauf: number | null;
  /** Kurztext für das Hinweisband. Leer, wenn nichts zu tun ist. */
  hinweis: string;
  /** Braucht es eine Handlung der Coachin? Steuert, ob das Band erscheint. */
  handlungNoetig: boolean;
}

/** Verknüpfungszeile, soweit hier gebraucht. Der Token selbst bleibt serverseitig. */
export interface VerbindungsZeile {
  ig_benutzername: string | null;
  token_gueltig_bis: string | null;
}

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

/** Ab hier wird gewarnt — früh genug, um die Verlängerung in Ruhe zu erledigen. */
const WARNUNG_AB_TAGEN = 7;

export function pruefeVerbindung(
  zeile: VerbindungsZeile | null | undefined,
  jetzt: Date = new Date()
): VerbindungsZustand {
  if (!zeile) {
    return {
      stufe: 'nicht_verbunden',
      tageBisAblauf: null,
      hinweis:
        'Noch kein Instagram-Konto verbunden — Interaktionen werden derzeit nicht automatisch erfasst.',
      handlungNoetig: true,
    };
  }

  const konto = zeile.ig_benutzername ? `@${zeile.ig_benutzername}` : 'Dein Instagram-Konto';

  // Kein Ablaufdatum hinterlegt: nicht als "alles gut" ausgeben, sondern als
  // unbekannt kennzeichnen — geraten wird hier nichts.
  if (!zeile.token_gueltig_bis) {
    return {
      stufe: 'aktiv',
      tageBisAblauf: null,
      hinweis: '',
      handlungNoetig: false,
    };
  }

  const ablauf = new Date(zeile.token_gueltig_bis);
  if (Number.isNaN(ablauf.getTime())) {
    return { stufe: 'aktiv', tageBisAblauf: null, hinweis: '', handlungNoetig: false };
  }

  const tage = Math.floor((ablauf.getTime() - jetzt.getTime()) / MS_PRO_TAG);

  if (tage < 0) {
    return {
      stufe: 'abgelaufen',
      tageBisAblauf: tage,
      hinweis: `Die Verbindung zu ${konto} ist abgelaufen. Seitdem kommen keine neuen Interaktionen an — bitte neu verbinden.`,
      handlungNoetig: true,
    };
  }

  if (tage <= WARNUNG_AB_TAGEN) {
    const wann = tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`;
    return {
      stufe: 'laeuft_bald_ab',
      tageBisAblauf: tage,
      hinweis: `Die Verbindung zu ${konto} läuft ${wann} ab. Danach kommen keine neuen Interaktionen mehr an.`,
      handlungNoetig: true,
    };
  }

  return { stufe: 'aktiv', tageBisAblauf: tage, hinweis: '', handlungNoetig: false };
}

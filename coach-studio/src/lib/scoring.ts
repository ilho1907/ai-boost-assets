/**
 * Lead-Radar Scoring-Engine.
 *
 * Rein verhaltensbasiert: zaehlt und gewichtet Interaktionen, die ein Lead
 * mit dem EIGENEN Instagram-Konto der Coachin erzeugt hat, und laesst sie
 * mit der Zeit abklingen (Recency-Decay). Es findet KEINE Text-, Emotions-
 * oder Persoenlichkeitsanalyse statt (EU AI Act: kein Profiling von
 * besonderen Merkmalen, nur Zaehl-/Recency-Signale).
 *
 * Alle Funktionen hier sind rein (keine I/O, kein Datum.now() im Inneren)
 * und damit ohne Mocking unit-testbar.
 */

export type InteraktionsTyp =
  | 'erstgespraech'
  | 'dm_antwort'
  | 'story_reaktion'
  | 'kommentar'
  | 'save'
  | 'like';

export type Stufe = 'kalt' | 'lauwarm' | 'warm';

export type Trend = 'steigend' | 'stabil' | 'fallend';

export interface LeadInteraktion {
  id: string;
  typ: InteraktionsTyp;
  /** Gewicht, wie in lead_interactions.gewicht gespeichert (siehe DEFAULT_GEWICHTE). */
  gewicht: number;
  /** Zeitpunkt der Interaktion (ISO-String oder Date). */
  occurredAt: string | Date;
}

export interface ScoreSignal {
  typ: InteraktionsTyp;
  /** Summierter, bereits verfallsgewichteter Beitrag dieses Typs zum Gesamtscore. */
  beitrag: number;
  /** Jüngste Interaktion dieses Typs. */
  letzteOccurredAt: Date;
  anzahl: number;
}

export interface ScoreErgebnis {
  score: number;
  stufe: Stufe;
  trend: Trend;
  letzteInteraktionAt: Date | null;
  /** Die 2–3 staerksten beitragenden Signale, für die Begründung in der UI ("warum warm"). */
  topSignale: ScoreSignal[];
}

export interface Empfehlung {
  titel: string;
  begruendung: string;
  /** 1 = höchste Priorität. */
  prioritaet: 1 | 2 | 3;
}

/**
 * Default-Gewichte je Interaktionstyp. Konfigurierbar (z. B. über künftige
 * Coach-Einstellungen); dient hier als Fallback, falls eine Interaktion ohne
 * explizites Gewicht übergeben wird. Muss mit der DB-Trigger-Funktion
 * `lead_interactions_default_gewicht` in der SQL-Migration synchron bleiben.
 */
export const DEFAULT_GEWICHTE: Record<InteraktionsTyp, number> = {
  erstgespraech: 40,
  dm_antwort: 15,
  story_reaktion: 8,
  kommentar: 6,
  save: 5,
  like: 2,
};

const HALBWERTSZEIT_TAGE = 14;
const MS_PRO_TAG = 24 * 60 * 60 * 1000;

const SCHWELLE_LAUWARM = 20;
const SCHWELLE_WARM = 50;

const TREND_FENSTER_TAGE = 7;
/** Relative Abweichung, ab der ein Trend als "steigend"/"fallend" statt "stabil" gilt. */
const TREND_SCHWELLE = 0.1;

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Exponentieller Zerfallsfaktor: 0.5 nach genau einer Halbwertszeit. */
function decayFaktor(alterTage: number): number {
  if (alterTage <= 0) return 1;
  return Math.pow(0.5, alterTage / HALBWERTSZEIT_TAGE);
}

function beitragVon(interaktion: LeadInteraktion, jetzt: Date): number {
  const alterMs = jetzt.getTime() - toDate(interaktion.occurredAt).getTime();
  const alterTage = alterMs / MS_PRO_TAG;
  if (alterTage < 0) return 0; // Interaktionen in der Zukunft zählen nicht.
  return interaktion.gewicht * decayFaktor(alterTage);
}

function stufeVonScore(score: number): Stufe {
  if (score >= SCHWELLE_WARM) return 'warm';
  if (score >= SCHWELLE_LAUWARM) return 'lauwarm';
  return 'kalt';
}

function berechneTrend(interaktionen: LeadInteraktion[], jetzt: Date): Trend {
  let aktuellesFenster = 0;
  let vorherigesFenster = 0;

  for (const interaktion of interaktionen) {
    const alterTage =
      (jetzt.getTime() - toDate(interaktion.occurredAt).getTime()) / MS_PRO_TAG;
    if (alterTage < 0) continue;
    const beitrag = interaktion.gewicht * decayFaktor(alterTage);

    if (alterTage <= TREND_FENSTER_TAGE) {
      aktuellesFenster += beitrag;
    } else if (alterTage <= TREND_FENSTER_TAGE * 2) {
      vorherigesFenster += beitrag;
    }
  }

  if (aktuellesFenster === 0 && vorherigesFenster === 0) return 'stabil';
  if (vorherigesFenster === 0) return aktuellesFenster > 0 ? 'steigend' : 'stabil';

  const veraenderung = (aktuellesFenster - vorherigesFenster) / vorherigesFenster;
  if (veraenderung > TREND_SCHWELLE) return 'steigend';
  if (veraenderung < -TREND_SCHWELLE) return 'fallend';
  return 'stabil';
}

function ermittleTopSignale(
  interaktionen: LeadInteraktion[],
  jetzt: Date,
  maxAnzahl = 3
): ScoreSignal[] {
  const proTyp = new Map<InteraktionsTyp, ScoreSignal>();

  for (const interaktion of interaktionen) {
    const beitrag = beitragVon(interaktion, jetzt);
    if (beitrag <= 0) continue;

    const occurredAt = toDate(interaktion.occurredAt);
    const bestehend = proTyp.get(interaktion.typ);
    if (!bestehend) {
      proTyp.set(interaktion.typ, {
        typ: interaktion.typ,
        beitrag,
        letzteOccurredAt: occurredAt,
        anzahl: 1,
      });
    } else {
      bestehend.beitrag += beitrag;
      bestehend.anzahl += 1;
      if (occurredAt > bestehend.letzteOccurredAt) {
        bestehend.letzteOccurredAt = occurredAt;
      }
    }
  }

  return Array.from(proTyp.values())
    .sort((a, b) => b.beitrag - a.beitrag)
    .slice(0, maxAnzahl);
}

/**
 * Berechnet Score, Stufe, Trend und die stärksten Signale für einen Lead
 * aus seinen bisherigen Interaktionen.
 */
export function berechneScore(
  interaktionen: LeadInteraktion[],
  jetzt: Date = new Date()
): ScoreErgebnis {
  let scoreRoh = 0;
  let letzteInteraktionAt: Date | null = null;

  for (const interaktion of interaktionen) {
    scoreRoh += beitragVon(interaktion, jetzt);
    const occurredAt = toDate(interaktion.occurredAt);
    if (!letzteInteraktionAt || occurredAt > letzteInteraktionAt) {
      letzteInteraktionAt = occurredAt;
    }
  }

  const score = Math.round(scoreRoh);

  return {
    score,
    stufe: stufeVonScore(score),
    trend: berechneTrend(interaktionen, jetzt),
    letzteInteraktionAt,
    topSignale: ermittleTopSignale(interaktionen, jetzt),
  };
}

const TYP_LABEL: Record<InteraktionsTyp, string> = {
  erstgespraech: 'Erstgespräch',
  dm_antwort: 'DM-Antwort',
  story_reaktion: 'Story-Reaktion',
  kommentar: 'Kommentar',
  save: 'Gespeicherter Beitrag',
  like: 'Like',
};

/** Menschenlesbare Begründung für ein Signal, z. B. für die LeadKarte. */
export function formatiereSignal(signal: ScoreSignal, jetzt: Date = new Date()): string {
  const alterTage = Math.floor(
    (jetzt.getTime() - signal.letzteOccurredAt.getTime()) / MS_PRO_TAG
  );
  const zeitangabe =
    alterTage <= 0 ? 'heute' : alterTage === 1 ? 'vor 1 Tag' : `vor ${alterTage} Tagen`;
  const anzahlSuffix = signal.anzahl > 1 ? ` (${signal.anzahl}×)` : '';
  return `${TYP_LABEL[signal.typ]}${anzahlSuffix} · ${zeitangabe}`;
}

// ---------------------------------------------------------------------------
// Nächste-Aktion-Engine
// ---------------------------------------------------------------------------

export interface NaechsteAktionInput {
  stufe: Stufe;
  trend: Trend;
  letzteInteraktionAt: Date | null;
  /** Typ der jüngsten Interaktion, falls vorhanden – für die "heute reagieren"-Regeln. */
  letzterInteraktionsTyp: InteraktionsTyp | null;
  /**
   * Folgt der Lead dem Konto der Coachin? `null` = unbekannt.
   * Stammt aus `is_user_follow_business` (Messaging User-Profile-API) und ist
   * bewusst kein Score-Faktor: der Score bleibt rein ereignisbasiert mit
   * Decay, während der Follow-Status ein Dauerzustand ist. Er verfeinert
   * daher nur die Empfehlung.
   */
  folgtCoach?: boolean | null;
  jetzt: Date;
}

function tageSeit(datum: Date | null, jetzt: Date): number | null {
  if (!datum) return null;
  return (jetzt.getTime() - datum.getTime()) / MS_PRO_TAG;
}

/**
 * Regelbasierte "Was tue ich heute?"-Empfehlung. Regeln werden in
 * Prioritätsreihenfolge geprüft; die erste zutreffende Regel gewinnt.
 */
export function ermittleNaechsteAktion(input: NaechsteAktionInput): Empfehlung {
  const {
    stufe,
    trend,
    letzteInteraktionAt,
    letzterInteraktionsTyp,
    folgtCoach = null,
    jetzt,
  } = input;
  const tageSeitLetzterInteraktion = tageSeit(letzteInteraktionAt, jetzt);

  // 1. Unbeantwortete DM > 24h → höchste Priorität.
  if (
    letzterInteraktionsTyp === 'dm_antwort' &&
    tageSeitLetzterInteraktion !== null &&
    tageSeitLetzterInteraktion > 1
  ) {
    return {
      titel: 'Antworten',
      begruendung: 'Ihre DM-Antwort wartet seit über 24 Stunden auf eine Rückmeldung.',
      prioritaet: 1,
    };
  }

  // 2. Warm, aber seit 5+ Tagen kein Kontakt.
  if (stufe === 'warm' && tageSeitLetzterInteraktion !== null && tageSeitLetzterInteraktion >= 5) {
    return {
      titel: 'Persönliche Nachricht senden',
      begruendung: 'Warmer Lead, seit 5+ Tagen ohne Austausch – jetzt persönlich melden.',
      prioritaet: 1,
    };
  }

  // 3. Frische Story-Reaktion heute → Gespräch öffnen.
  if (
    letzterInteraktionsTyp === 'story_reaktion' &&
    tageSeitLetzterInteraktion !== null &&
    tageSeitLetzterInteraktion < 1
  ) {
    return {
      titel: 'Story-Reply nutzen',
      begruendung: 'Heutige Story-Reaktion – guter, natürlicher Gesprächseinstieg.',
      prioritaet: 2,
    };
  }

  // 4. Still geworden, folgt dir aber weiterhin → erreichbar, sanft anknüpfen.
  //    Steht bewusst VOR der Archivieren-Regel: wer noch folgt, ist nicht kalt
  //    im Sinne von "weg", sondern nur gerade still.
  if (
    stufe !== 'warm' &&
    folgtCoach === true &&
    tageSeitLetzterInteraktion !== null &&
    tageSeitLetzterInteraktion > 10
  ) {
    return {
      titel: 'Sanft anknüpfen',
      begruendung: 'Seit über 10 Tagen still, folgt dir aber weiterhin – sie ist erreichbar.',
      prioritaet: 2,
    };
  }

  // 5. Kalt, fallend, lange still → archivieren oder letzter Impuls.
  if (
    stufe === 'kalt' &&
    trend === 'fallend' &&
    tageSeitLetzterInteraktion !== null &&
    tageSeitLetzterInteraktion > 21
  ) {
    return {
      titel: 'Archivieren oder letzter Impuls',
      begruendung: 'Über 21 Tage keine Reaktion, Interesse nimmt weiter ab.',
      prioritaet: 3,
    };
  }

  // Fallback je Stufe, wenn keine Regel greift.
  if (stufe === 'warm') {
    return {
      titel: 'Beziehung pflegen',
      begruendung: 'Warmer Lead mit stabilem Kontakt – dranbleiben.',
      prioritaet: 2,
    };
  }
  if (stufe === 'lauwarm') {
    return {
      titel: 'Beobachten',
      begruendung: 'Interesse vorhanden, aber noch kein akuter Impuls nötig.',
      prioritaet: 3,
    };
  }
  return {
    titel: 'Kein akuter Handlungsbedarf',
    begruendung: 'Noch keine oder nur schwache Signale.',
    prioritaet: 3,
  };
}

/**
 * Sortiert eine Liste von (Lead-Id, Empfehlung)-Paaren für die
 * "Heute zu tun"-Leiste: höchste Priorität zuerst, bei Gleichstand höherer Score zuerst.
 */
export function topAktionen<T extends { empfehlung: Empfehlung; score: number }>(
  eintraege: T[],
  anzahl = 3
): T[] {
  return [...eintraege]
    .sort((a, b) => {
      if (a.empfehlung.prioritaet !== b.empfehlung.prioritaet) {
        return a.empfehlung.prioritaet - b.empfehlung.prioritaet;
      }
      return b.score - a.score;
    })
    .slice(0, anzahl);
}

/**
 * Coach-Begleiter: "Was steht heute für mich an?"
 *
 * Bewusst ohne LLM-Aufruf. Ob ein Termin heute ist, eine Challenge in zwei
 * Tagen endet oder eine Hausaufgabe fällig wird, ist reine Datumsarithmetik —
 * ein Modell dafür zu befragen wäre teuer, langsamer und weniger
 * zuverlässig als ein Datumsvergleich. "Persönlich" entsteht hier daraus,
 * DASS jede Coachin nur ihre eigenen Termine/Hausaufgaben und nur die
 * Challenges sieht, denen sie beigetreten ist — nicht daraus, dass ein
 * Modell für sie mitdenkt.
 */

export type ErinnerungsTyp = 'termin' | 'challenge' | 'hausaufgabe';

export interface Erinnerung {
  id: string;
  typ: ErinnerungsTyp;
  titel: string;
  hinweis: string;
  faelligkeit: Date | null;
  prioritaet: 1 | 2 | 3;
}

export interface TerminZeile {
  id: string;
  titel: string;
  start_at: string;
  ort: string | null;
}

export interface ChallengeMitTeilnahme {
  id: string;
  titel: string;
  start_at: string;
  ende_at: string;
  /** null = noch nicht beigetreten — taucht dann nicht in den Erinnerungen auf. */
  beigetreten_at: string | null;
  erledigt_at: string | null;
}

export interface HausaufgabeZeile {
  id: string;
  titel: string;
  faellig_am: string | null;
  erledigt_at: string | null;
}

const MS_PRO_TAG = 24 * 60 * 60 * 1000;

function tageBis(datum: Date, jetzt: Date): number {
  // Kalendertage, nicht volle 24h-Blöcke: "morgen frueh" soll als 1 zaehlen,
  // nicht als 0, nur weil seit Mitternacht noch keine 24h vergangen sind.
  const heuteMitternacht = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
  const zielMitternacht = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
  return Math.round((zielMitternacht.getTime() - heuteMitternacht.getTime()) / MS_PRO_TAG);
}

function terminErinnerung(zeile: TerminZeile, jetzt: Date): Erinnerung | null {
  const start = new Date(zeile.start_at);
  const tage = tageBis(start, jetzt);
  if (tage < 0 || tage > 7) return null;

  const ortHinweis = zeile.ort ? ` · ${zeile.ort}` : '';
  const zeitHinweis =
    tage === 0 ? 'heute' : tage === 1 ? 'morgen' : `in ${tage} Tagen`;

  return {
    id: zeile.id,
    typ: 'termin',
    titel: zeile.titel,
    hinweis: `Termin ${zeitHinweis}${ortHinweis}`,
    faelligkeit: start,
    prioritaet: tage <= 1 ? 1 : 3,
  };
}

function challengeErinnerung(zeile: ChallengeMitTeilnahme, jetzt: Date): Erinnerung | null {
  if (!zeile.beigetreten_at || zeile.erledigt_at) return null;

  const ende = new Date(zeile.ende_at);
  const start = new Date(zeile.start_at);
  if (jetzt < start || jetzt > ende) return null; // nicht aktiv

  const restTage = tageBis(ende, jetzt);
  const prioritaet: 1 | 2 | 3 = restTage <= 1 ? 1 : restTage <= 3 ? 2 : 3;
  const zeitHinweis =
    restTage <= 0 ? 'endet heute' : restTage === 1 ? 'endet morgen' : `noch ${restTage} Tage`;

  return {
    id: zeile.id,
    typ: 'challenge',
    titel: zeile.titel,
    hinweis: `Challenge ${zeitHinweis}`,
    faelligkeit: ende,
    prioritaet,
  };
}

function hausaufgabeErinnerung(zeile: HausaufgabeZeile, jetzt: Date): Erinnerung | null {
  if (zeile.erledigt_at || !zeile.faellig_am) return null;

  const faellig = new Date(`${zeile.faellig_am}T23:59:59`);
  const tage = tageBis(faellig, jetzt);
  if (tage > 7) return null; // noch zu weit weg, um heute zu erscheinen

  const zeitHinweis =
    tage < 0
      ? `seit ${Math.abs(tage)} Tag${Math.abs(tage) === 1 ? '' : 'en'} überfällig`
      : tage === 0
        ? 'heute fällig'
        : tage === 1
          ? 'morgen fällig'
          : `in ${tage} Tagen fällig`;

  return {
    id: zeile.id,
    typ: 'hausaufgabe',
    titel: zeile.titel,
    hinweis: `Hausaufgabe ${zeitHinweis}`,
    faelligkeit: faellig,
    // überfällig oder morgen -> dringend; binnen 3 Tagen -> bald; sonst Vorschau.
    prioritaet: tage <= 1 ? 1 : tage <= 3 ? 2 : 3,
  };
}

/**
 * Baut die persönliche "Heute"-Liste einer Coachin aus ihren eigenen
 * Terminen/Hausaufgaben und den Challenges, denen sie beigetreten ist.
 * Sortiert nach Dringlichkeit, dann nach Fälligkeit.
 */
export function ermittleErinnerungen(input: {
  termine: TerminZeile[];
  challenges: ChallengeMitTeilnahme[];
  hausaufgaben: HausaufgabeZeile[];
  jetzt: Date;
}): Erinnerung[] {
  const { termine, challenges, hausaufgaben, jetzt } = input;

  const erinnerungen: Erinnerung[] = [
    ...termine.map((z) => terminErinnerung(z, jetzt)),
    ...challenges.map((z) => challengeErinnerung(z, jetzt)),
    ...hausaufgaben.map((z) => hausaufgabeErinnerung(z, jetzt)),
  ].filter((e): e is Erinnerung => e !== null);

  return erinnerungen.sort((a, b) => {
    if (a.prioritaet !== b.prioritaet) return a.prioritaet - b.prioritaet;
    const aZeit = a.faelligkeit?.getTime() ?? Infinity;
    const bZeit = b.faelligkeit?.getTime() ?? Infinity;
    return aZeit - bZeit;
  });
}

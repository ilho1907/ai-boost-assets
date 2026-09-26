/**
 * Wöchentlicher Content-Themenvorschlag für Coachinnen.
 *
 * "Worüber poste ich diese Woche" ist — anders als alles in erinnerungen.ts —
 * keine Datumsarithmetik, sondern braucht tatsächlich ein Sprachmodell. Was
 * hier trotzdem rein bleibt: Wochenberechnung, Prompt-Aufbau und die
 * Validierung der Antwort. Der eigentliche Claude-Aufruf passiert
 * ausschließlich in der Edge Function (supabase/functions/content-vorschlag),
 * nie im Browser — dort würde der API-Key offenliegen.
 *
 * Kontext kommt ausschließlich aus den EIGENEN Challenges/Hausaufgaben der
 * Coachin, nie aus Lead-Radar oder Klientinnen-Daten.
 */

import { z } from 'zod';

export interface KontextChallenge {
  titel: string;
  kategorie: string | null;
}

export interface KontextHausaufgabe {
  titel: string;
}

export interface VorschlagsKontext {
  aktiveChallenges: KontextChallenge[];
  offeneHausaufgaben: KontextHausaufgabe[];
}

/**
 * Montag der ISO-Woche eines Datums, als YYYY-MM-DD. Sonntag zählt zur
 * vorherigen Woche (ISO-Konvention), nicht zur nächsten.
 */
export function montagDerWoche(datum: Date): string {
  const wochentag = datum.getDay(); // 0 = Sonntag, 1 = Montag, ...
  const differenzTage = wochentag === 0 ? -6 : 1 - wochentag;

  const montag = new Date(datum.getFullYear(), datum.getMonth(), datum.getDate());
  montag.setDate(montag.getDate() + differenzTage);

  const jahr = montag.getFullYear();
  const monat = String(montag.getMonth() + 1).padStart(2, '0');
  const tag = String(montag.getDate()).padStart(2, '0');
  return `${jahr}-${monat}-${tag}`;
}

export function baueSystemPrompt(): string {
  return [
    'Du hilfst einer Life-Coachin bei smile2go, einer Plattform für die neue',
    'Generation von Coaches, dabei, ein Thema für einen Social-Media-Beitrag',
    'dieser Woche zu finden.',
    '',
    'Schlage GENAU EIN konkretes, umsetzbares Thema vor — kein Sammelsurium,',
    'keine Liste. Die Begründung ist ein bis zwei Sätze und erklärt, warum',
    'dieses Thema gerade jetzt zu ihr passt.',
    '',
    'Antworte ausschließlich auf Deutsch, ohne Emojis, ohne Anführungszeichen',
    'um das Thema. Kein Coaching-Fachjargon, keine Wellness-Klischees.',
  ].join('\n');
}

export function baueBenutzerPrompt(kontext: VorschlagsKontext): string {
  const challengeZeilen = kontext.aktiveChallenges.length
    ? kontext.aktiveChallenges
        .map((c) => `- ${c.titel}${c.kategorie ? ` (${c.kategorie})` : ''}`)
        .join('\n')
    : '- (aktuell keine aktive Challenge)';

  const hausaufgabenZeilen = kontext.offeneHausaufgaben.length
    ? kontext.offeneHausaufgaben.map((h) => `- ${h.titel}`).join('\n')
    : '- (aktuell keine offenen Aufgaben)';

  return [
    'Woran die Coachin gerade selbst arbeitet, als Teilnehmerin bei smile2go',
    '(NICHT ihre eigenen Klientinnen — das sind ihre eigenen Challenges und',
    'Hausaufgaben):',
    '',
    'Challenges, denen sie beigetreten ist:',
    challengeZeilen,
    '',
    'Offene Hausaufgaben:',
    hausaufgabenZeilen,
    '',
    'Schlage ein Thema für ihren nächsten Social-Media-Beitrag vor, das zu',
    'diesem Kontext passt.',
  ].join('\n');
}

export const ContentVorschlagSchema = z.object({
  thema: z.string().trim().min(3).max(140),
  begruendung: z.string().trim().min(3).max(400),
});

export type ContentVorschlagAntwort = z.infer<typeof ContentVorschlagSchema>;

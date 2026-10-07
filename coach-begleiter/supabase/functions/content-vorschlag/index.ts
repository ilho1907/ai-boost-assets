/**
 * Coach-Begleiter: wöchentlicher Content-Themenvorschlag (Supabase Edge
 * Function, Deno).
 *
 * Läuft im Namen der aufrufenden Coachin — anders als instagram-webhook in
 * coach-studio verwendet diese Funktion KEINEN Service-Role-Key. Das JWT der
 * Coachin wird durchgereicht, RLS entscheidet, was sichtbar/schreibbar ist.
 * Deshalb ist hier keine coach_id-Prüfung von Hand nötig: was die Coachin
 * über PostgREST sehen kann, ist automatisch nur ihr eigenes.
 *
 * Deployment (MIT JWT-Prüfung — im Unterschied zu instagram-webhook):
 *   supabase functions deploy content-vorschlag
 *   supabase secrets set ANTHROPIC_API_KEY=...
 *
 * Kostenbremse: höchstens ein Anthropic-Aufruf pro Coachin pro Woche. Vor
 * jedem Aufruf wird zuerst geprüft, ob für die aktuelle Woche schon eine
 * Zeile existiert — sowohl hier als auch (als zweite Absicherung) über den
 * Unique-Constraint in der Datenbank.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod';
import {
  ContentVorschlagSchema,
  baueBenutzerPrompt,
  baueSystemPrompt,
  montagDerWoche,
  type KontextChallenge,
  type KontextHausaufgabe,
} from '../_shared/contentVorschlag.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

Deno.serve(async (anfrage: Request): Promise<Response> => {
  if (anfrage.method !== 'POST') {
    return new Response('Methode nicht erlaubt', { status: 405 });
  }

  const authHeader = anfrage.headers.get('Authorization');
  if (!authHeader) {
    return new Response('Nicht angemeldet', { status: 401 });
  }

  // Client im Namen der Coachin — nicht mit Service-Role. Jede Abfrage
  // darunter respektiert also automatisch RLS.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return new Response('Nicht angemeldet', { status: 401 });
  }
  const coachId = userData.user.id;

  const wocheStart = montagDerWoche(new Date());

  // Schon vorhanden? Dann keinen weiteren Anthropic-Aufruf auslösen — das
  // ist die eigentliche Kostenbremse, der Unique-Constraint in der DB ist
  // nur das zweite Netz für den seltenen Gleichzeitigkeits-Fall.
  const { data: bestehend } = await supabase
    .from('content_vorschlaege')
    .select('thema, begruendung, woche_start')
    .eq('woche_start', wocheStart)
    .maybeSingle();

  if (bestehend) {
    return Response.json(bestehend);
  }

  if (!ANTHROPIC_API_KEY) {
    return new Response(
      'ANTHROPIC_API_KEY ist nicht gesetzt (supabase secrets set ANTHROPIC_API_KEY=...)',
      { status: 500 }
    );
  }

  // Kontext ausschließlich aus den EIGENEN Challenges/Hausaufgaben der
  // Coachin — RLS lässt ohnehin nichts anderes zu, aber die Absicht steht
  // auch im Query selbst: kein Zugriff auf leads/lead_interactions hier.
  const jetzt = new Date().toISOString();
  const [challengesErg, hausaufgabenErg] = await Promise.all([
    supabase
      .from('coach_challenge_teilnahme')
      .select('erledigt_at, challenges(titel, kategorie, start_at, ende_at)')
      .is('erledigt_at', null),
    supabase
      .from('hausaufgaben')
      .select('titel')
      .is('erledigt_at', null)
      .order('faellig_am', { ascending: true })
      .limit(5),
  ]);

  if (challengesErg.error || hausaufgabenErg.error) {
    const fehler = challengesErg.error ?? hausaufgabenErg.error;
    return new Response(`Kontext konnte nicht geladen werden: ${fehler?.message}`, {
      status: 500,
    });
  }

  const aktiveChallenges: KontextChallenge[] = (challengesErg.data ?? [])
    .map((z) => (Array.isArray(z.challenges) ? z.challenges[0] : z.challenges))
    .filter(
      (c): c is { titel: string; kategorie: string | null; start_at: string; ende_at: string } =>
        Boolean(c) && c.start_at <= jetzt && c.ende_at >= jetzt
    )
    .map((c) => ({ titel: c.titel, kategorie: c.kategorie }));

  const offeneHausaufgaben: KontextHausaufgabe[] = hausaufgabenErg.data ?? [];

  let antwort: { thema: string; begruendung: string };
  try {
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    // Niedriger Effort: eine kurze, konkrete Themenidee ist kein
    // mehrstufiges Reasoning-Problem — siehe claude-api-Skill-Empfehlung
    // für Chat-/Vorschlagsaufgaben mit niedrigem Volumen.
    const response = await anthropic.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 1024,
      output_config: { effort: 'low', format: zodOutputFormat(ContentVorschlagSchema) },
      system: baueSystemPrompt(),
      messages: [{ role: 'user', content: baueBenutzerPrompt({ aktiveChallenges, offeneHausaufgaben }) }],
    });

    if (!response.parsed_output) {
      return new Response('Antwort von Claude konnte nicht geparst werden', { status: 502 });
    }
    antwort = response.parsed_output;
  } catch (fehler) {
    console.error('Anthropic-Aufruf fehlgeschlagen', fehler);
    return new Response('Themenvorschlag konnte nicht erzeugt werden', { status: 502 });
  }

  // Upsert statt Insert: falls zwei Anfragen für dieselbe Woche gleichzeitig
  // durchkommen, gewinnt die zuerst geschriebene Zeile, keine doppelte.
  const { data: gespeichert, error: schreibFehler } = await supabase
    .from('content_vorschlaege')
    .upsert(
      { coach_id: coachId, woche_start: wocheStart, ...antwort },
      { onConflict: 'coach_id,woche_start', ignoreDuplicates: true }
    )
    .select('thema, begruendung, woche_start')
    .maybeSingle();

  if (schreibFehler) {
    return new Response(`Vorschlag konnte nicht gespeichert werden: ${schreibFehler.message}`, {
      status: 500,
    });
  }

  // ignoreDuplicates liefert bei einem Konflikt keine Zeile zurück — dann
  // gewann die parallele Anfrage, wir lesen ihr Ergebnis nach.
  if (gespeichert) return Response.json(gespeichert);

  const { data: nachgelesen } = await supabase
    .from('content_vorschlaege')
    .select('thema, begruendung, woche_start')
    .eq('woche_start', wocheStart)
    .maybeSingle();

  return Response.json(nachgelesen ?? antwort);
});

/**
 * Instagram-Webhook-Empfaenger (Supabase Edge Function, Deno).
 *
 * GET  — Verifizierungs-Handshake von Meta (hub.challenge).
 * POST — Ereignisse entgegennehmen, auf lead_interactions abbilden, speichern.
 *
 * Sicherheit:
 *  - Jede POST-Anfrage wird gegen X-Hub-Signature-256 geprueft (HMAC-SHA256
 *    ueber den ROHEN Body mit dem App Secret). Ohne gueltige Signatur: 401.
 *  - Der Vergleich laeuft in konstanter Zeit, damit die Signatur nicht
 *    Byte fuer Byte erraten werden kann.
 *  - Laeuft mit dem Service-Role-Key, umgeht also RLS. Deshalb wird jede
 *    Abfrage explizit auf die coach_id eingeschraenkt.
 *
 * Deployment:
 *   supabase functions deploy instagram-webhook --no-verify-jwt
 *   supabase secrets set IG_APP_SECRET=... IG_VERIFY_TOKEN=...
 *
 * `--no-verify-jwt` ist noetig, weil Meta kein Supabase-JWT mitschickt; die
 * Authentizitaet kommt stattdessen aus der HMAC-Signatur.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  mappeWebhook,
  ordneZu,
  type ZuordenbarerLead,
} from '../_shared/instagramIngest.ts';

const APP_SECRET = Deno.env.get('IG_APP_SECRET') ?? '';
const VERIFY_TOKEN = Deno.env.get('IG_VERIFY_TOKEN') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Zeitkonstanter Vergleich — verhindert Timing-Angriffe auf die Signatur. */
function gleichInKonstanterZeit(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let unterschied = 0;
  for (let i = 0; i < a.length; i++) {
    unterschied |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return unterschied === 0;
}

async function signaturGueltig(rohBody: string, kopfzeile: string | null): Promise<boolean> {
  if (!APP_SECRET || !kopfzeile?.startsWith('sha256=')) return false;

  const schluessel = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatur = await crypto.subtle.sign(
    'HMAC',
    schluessel,
    new TextEncoder().encode(rohBody),
  );
  const erwartet = Array.from(new Uint8Array(signatur))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return gleichInKonstanterZeit(erwartet, kopfzeile.slice('sha256='.length));
}

Deno.serve(async (anfrage: Request): Promise<Response> => {
  const url = new URL(anfrage.url);

  // --- Handshake ---
  if (anfrage.method === 'GET') {
    const modus = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (modus === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Verifizierung fehlgeschlagen', { status: 403 });
  }

  if (anfrage.method !== 'POST') {
    return new Response('Methode nicht erlaubt', { status: 405 });
  }

  // Rohen Text lesen — die Signatur gilt fuer exakt diese Bytes.
  const rohBody = await anfrage.text();

  if (!(await signaturGueltig(rohBody, anfrage.headers.get('x-hub-signature-256')))) {
    return new Response('Ungueltige Signatur', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rohBody);
  } catch {
    return new Response('Kein gueltiges JSON', { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Die Payload nennt das IG-Konto; darueber finden wir die Coachin.
  const igKontoId = (payload as { entry?: { id?: string }[] })?.entry?.[0]?.id;
  if (!igKontoId) {
    // Nichts zuzuordnen — trotzdem 200, sonst wiederholt Meta endlos.
    return new Response('ok', { status: 200 });
  }

  const { data: konto } = await supabase
    .from('coach_instagram_konten')
    .select('coach_id')
    .eq('ig_konto_id', igKontoId)
    .maybeSingle();

  if (!konto) {
    return new Response('ok', { status: 200 });
  }
  const coachId: string = konto.coach_id;

  const kandidaten = mappeWebhook(payload as never, igKontoId);
  if (kandidaten.length === 0) {
    return new Response('ok', { status: 200 });
  }

  // Service-Role umgeht RLS — deshalb hier zwingend selbst auf die Coachin filtern.
  const { data: leads } = await supabase
    .from('leads')
    .select('id, instagram_handle, instagram_scoped_id, consent_tracking')
    .eq('coach_id', coachId);

  const ergebnis = ordneZu(kandidaten, (leads ?? []) as ZuordenbarerLead[], coachId);

  if (ergebnis.zeilen.length > 0) {
    // onConflict auf raw_ref: Meta stellt mindestens einmal zu, oft mehrfach.
    // Ohne das wuerde eine erneute Zustellung den Score ein zweites Mal heben.
    const { error } = await supabase
      .from('lead_interactions')
      .upsert(ergebnis.zeilen, { onConflict: 'coach_id,raw_ref', ignoreDuplicates: true });

    if (error) {
      console.error('lead_interactions upsert fehlgeschlagen', error.message);
      return new Response('Speichern fehlgeschlagen', { status: 500 });
    }
  }

  // Handle-Treffer einmalig zur stabilen IGSID verfestigen.
  for (const { leadId, igsid } of ergebnis.igsidNachzutragen) {
    await supabase
      .from('leads')
      .update({ instagram_scoped_id: igsid })
      .eq('id', leadId)
      .eq('coach_id', coachId)
      .is('instagram_scoped_id', null);
  }

  console.log(
    `ingest: ${ergebnis.zeilen.length} gespeichert, ` +
      `${ergebnis.verworfenOhneLead} ohne Lead, ` +
      `${ergebnis.verworfenOhneConsent} ohne Einwilligung`,
  );

  return new Response('ok', { status: 200 });
});

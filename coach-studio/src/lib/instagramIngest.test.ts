import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  mappeWebhook,
  ordneZu,
  type InteraktionsTyp as IngestTyp,
  type WebhookPayload,
  type ZuordenbarerLead,
} from './instagramIngest';
import type { InteraktionsTyp as ScoringTyp } from './scoring';

const IG_KONTO = '17841400000000000';
const JETZT = new Date('2026-09-14T12:00:00Z');

/**
 * Schutz gegen Drift: instagramIngest.ts deklariert die Typliste lokal, damit
 * sie in Deno laeuft. Laufen die beiden Listen auseinander, schlaegt bereits
 * `tsc` fehl — nicht erst die Produktion.
 */
it('hält die Interaktionstypen mit scoring.ts synchron', () => {
  expectTypeOf<IngestTyp>().toEqualTypeOf<ScoringTyp>();
});

describe('mappeWebhook — Nachrichten', () => {
  const SEKUNDEN = 1789387200; // 2026-09-14T12:00:00Z

  /** Baut eine Messaging-Payload. Echos kommen real vom eigenen Konto. */
  function dmPayload(
    nachricht: Record<string, unknown>,
    von: string = 'lead-igsid',
    an: string = IG_KONTO
  ): WebhookPayload {
    return {
      object: 'instagram',
      entry: [
        {
          id: IG_KONTO,
          time: SEKUNDEN,
          messaging: [
            {
              sender: { id: von },
              recipient: { id: an },
              timestamp: SEKUNDEN,
              message: nachricht,
            },
          ],
        },
      ],
    };
  }

  it('erkennt eine eingehende DM des Leads', () => {
    const [k] = mappeWebhook(dmPayload({ mid: 'm1', text: 'Hallo' }), IG_KONTO, JETZT);
    expect(k.typ).toBe('dm_antwort');
    expect(k.richtung).toBe('eingehend');
    expect(k.igsid).toBe('lead-igsid');
    expect(k.rawRef).toBe('m1');
  });

  it('erkennt eine Story-Antwort an der reply_to.story-Referenz', () => {
    const [k] = mappeWebhook(
      dmPayload({ mid: 'm2', text: '🔥', reply_to: { story: { id: 's1' } } }),
      IG_KONTO,
      JETZT
    );
    expect(k.typ).toBe('story_reaktion');
    expect(k.richtung).toBe('eingehend');
  });

  it('markiert is_echo als ausgehend und nimmt den Empfänger als Gegenseite', () => {
    const [k] = mappeWebhook(
      dmPayload({ mid: 'm3', is_echo: true }, IG_KONTO, 'lead-igsid'),
      IG_KONTO,
      JETZT
    );
    expect(k.richtung).toBe('ausgehend');
    expect(k.igsid).toBe('lead-igsid');
  });

  it('erkennt auch ohne is_echo, dass das eigene Konto gesendet hat', () => {
    const [k] = mappeWebhook(dmPayload({ mid: 'm4' }, IG_KONTO, 'lead-igsid'), IG_KONTO, JETZT);
    expect(k.richtung).toBe('ausgehend');
    expect(k.igsid).toBe('lead-igsid');
  });

  it('speichert keinen Nachrichtentext', () => {
    const [k] = mappeWebhook(dmPayload({ mid: 'm5', text: 'sehr privat' }), IG_KONTO, JETZT);
    expect(JSON.stringify(k)).not.toContain('sehr privat');
  });

  it('rechnet Sekunden-Zeitstempel korrekt um', () => {
    const [k] = mappeWebhook(dmPayload({ mid: 'm6' }), IG_KONTO, JETZT);
    expect(k.occurredAt.toISOString()).toBe('2026-09-14T12:00:00.000Z');
  });

  it('verwirft eine Nachricht ohne erkennbare Gegenseite', () => {
    expect(mappeWebhook(dmPayload({ mid: 'm7' }, IG_KONTO, IG_KONTO), IG_KONTO, JETZT)).toHaveLength(
      0
    );
  });
});

describe('mappeWebhook — Kommentare und Mentions', () => {
  it('bildet einen Kommentar mit Username ab', () => {
    const [k] = mappeWebhook(
      {
        object: 'instagram',
        entry: [
          {
            id: IG_KONTO,
            time: 1789200000,
            changes: [
              {
                field: 'comments',
                value: { id: 'c1', from: { id: 'lead-igsid', username: 'Nora.Wandelt' } },
              },
            ],
          },
        ],
      },
      IG_KONTO,
      JETZT
    );
    expect(k.typ).toBe('kommentar');
    expect(k.username).toBe('Nora.Wandelt');
    expect(k.rawRef).toBe('c1');
  });

  it('ignoriert eigene Kommentare unter eigenen Beiträgen', () => {
    const k = mappeWebhook(
      {
        object: 'instagram',
        entry: [
          {
            id: IG_KONTO,
            changes: [{ field: 'comments', value: { id: 'c2', from: { id: IG_KONTO } } }],
          },
        ],
      },
      IG_KONTO,
      JETZT
    );
    expect(k).toHaveLength(0);
  });

  it('ignoriert unbekannte Felder statt zu raten', () => {
    const k = mappeWebhook(
      {
        object: 'instagram',
        entry: [{ id: IG_KONTO, changes: [{ field: 'insights', value: { id: 'x' } }] }],
      },
      IG_KONTO,
      JETZT
    );
    expect(k).toHaveLength(0);
  });

  it('ignoriert fremde Payloads', () => {
    expect(mappeWebhook({ object: 'page', entry: [] }, IG_KONTO, JETZT)).toHaveLength(0);
    expect(mappeWebhook({}, IG_KONTO, JETZT)).toHaveLength(0);
  });
});

describe('ordneZu', () => {
  const COACH = 'coach-1';

  const mitConsent: ZuordenbarerLead = {
    id: 'lead-1',
    instagram_handle: 'nora.wandelt',
    instagram_scoped_id: 'lead-igsid',
    consent_tracking: true,
  };
  const ohneConsent: ZuordenbarerLead = {
    id: 'lead-2',
    instagram_handle: 'paula.k',
    instagram_scoped_id: 'paula-igsid',
    consent_tracking: false,
  };

  const kandidat = (over: Partial<Parameters<typeof ordneZu>[0][number]> = {}) => ({
    igsid: 'lead-igsid',
    username: null,
    typ: 'dm_antwort' as const,
    richtung: 'eingehend' as const,
    occurredAt: JETZT,
    rawRef: 'm1',
    ...over,
  });

  it('ordnet über die gespeicherte IGSID zu', () => {
    const e = ordneZu([kandidat()], [mitConsent], COACH);
    expect(e.zeilen).toHaveLength(1);
    expect(e.zeilen[0].lead_id).toBe('lead-1');
    expect(e.zeilen[0].coach_id).toBe(COACH);
  });

  it('verwirft Interaktionen ohne Einwilligung', () => {
    const e = ordneZu([kandidat({ igsid: 'paula-igsid' })], [ohneConsent], COACH);
    expect(e.zeilen).toHaveLength(0);
    expect(e.verworfenOhneConsent).toBe(1);
  });

  it('verwirft Fremde, die zu keinem Lead gehören', () => {
    const e = ordneZu([kandidat({ igsid: 'unbekannt' })], [mitConsent], COACH);
    expect(e.zeilen).toHaveLength(0);
    expect(e.verworfenOhneLead).toBe(1);
  });

  it('greift ersatzweise auf den Handle zurück, unabhängig von Groß-/Kleinschreibung', () => {
    const nochOhneIgsid = { ...mitConsent, instagram_scoped_id: null };
    const e = ordneZu(
      [kandidat({ igsid: 'neue-igsid', username: 'Nora.Wandelt' })],
      [nochOhneIgsid],
      COACH
    );
    expect(e.zeilen).toHaveLength(1);
    expect(e.igsidNachzutragen).toEqual([{ leadId: 'lead-1', igsid: 'neue-igsid' }]);
  });

  it('trägt eine IGSID auch bei mehreren Treffern nur einmal nach', () => {
    const nochOhneIgsid = { ...mitConsent, instagram_scoped_id: null };
    const e = ordneZu(
      [
        kandidat({ igsid: 'neue-igsid', username: 'nora.wandelt', rawRef: 'a' }),
        kandidat({ igsid: 'neue-igsid', username: 'nora.wandelt', rawRef: 'b' }),
      ],
      [nochOhneIgsid],
      COACH
    );
    expect(e.zeilen).toHaveLength(2);
    expect(e.igsidNachzutragen).toHaveLength(1);
  });

  it('behält die Richtung ausgehender Nachrichten bei', () => {
    const e = ordneZu([kandidat({ richtung: 'ausgehend' })], [mitConsent], COACH);
    expect(e.zeilen[0].richtung).toBe('ausgehend');
  });
});

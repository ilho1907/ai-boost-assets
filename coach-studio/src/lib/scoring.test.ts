import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEWICHTE,
  berechneScore,
  ermittleNaechsteAktion,
  formatiereSignal,
  topAktionen,
  type LeadInteraktion,
} from './scoring';

const JETZT = new Date('2026-08-06T12:00:00Z');

function interaktion(
  typ: LeadInteraktion['typ'],
  vorTagen: number,
  gewicht = DEFAULT_GEWICHTE[typ]
): LeadInteraktion {
  const occurredAt = new Date(JETZT.getTime() - vorTagen * 24 * 60 * 60 * 1000);
  return { id: `${typ}-${vorTagen}`, typ, gewicht, occurredAt };
}

describe('berechneScore', () => {
  it('liefert Stufe "kalt" ohne Interaktionen', () => {
    const ergebnis = berechneScore([], JETZT);
    expect(ergebnis.score).toBe(0);
    expect(ergebnis.stufe).toBe('kalt');
    expect(ergebnis.letzteInteraktionAt).toBeNull();
  });

  it('stuft einen frischen Like als "kalt" ein (unter Schwelle)', () => {
    const ergebnis = berechneScore([interaktion('like', 0)], JETZT);
    expect(ergebnis.score).toBe(2);
    expect(ergebnis.stufe).toBe('kalt');
  });

  it('stuft eine frische Erstgespräch-Interaktion als "warm" ein', () => {
    const ergebnis = berechneScore([interaktion('erstgespraech', 0)], JETZT);
    expect(ergebnis.score).toBe(40);
    expect(ergebnis.stufe).toBe('lauwarm');
  });

  it('kombiniert mehrere Signale über die Warm-Schwelle', () => {
    const ergebnis = berechneScore(
      [interaktion('erstgespraech', 0), interaktion('dm_antwort', 1)],
      JETZT
    );
    expect(ergebnis.score).toBeGreaterThanOrEqual(50);
    expect(ergebnis.stufe).toBe('warm');
  });

  it('lässt Signale mit ~14 Tagen Halbwertszeit abklingen', () => {
    const frisch = berechneScore([interaktion('erstgespraech', 0)], JETZT).score;
    const nach14Tagen = berechneScore([interaktion('erstgespraech', 14)], JETZT).score;
    expect(nach14Tagen).toBeCloseTo(frisch / 2, 0);
  });

  it('ignoriert Interaktionen in der Zukunft', () => {
    const ergebnis = berechneScore([interaktion('erstgespraech', -5)], JETZT);
    expect(ergebnis.score).toBe(0);
  });

  it('liefert die stärksten Signale sortiert und aggregiert nach Typ', () => {
    const ergebnis = berechneScore(
      [
        interaktion('like', 0),
        interaktion('like', 1),
        interaktion('erstgespraech', 2),
        interaktion('save', 3),
      ],
      JETZT
    );
    expect(ergebnis.topSignale[0].typ).toBe('erstgespraech');
    expect(ergebnis.topSignale.length).toBeLessThanOrEqual(3);
    const likeSignal = ergebnis.topSignale.find((s) => s.typ === 'like');
    expect(likeSignal?.anzahl).toBe(2);
  });

  it('erkennt einen steigenden Trend', () => {
    const ergebnis = berechneScore(
      [interaktion('dm_antwort', 1), interaktion('story_reaktion', 2)],
      JETZT
    );
    expect(ergebnis.trend).toBe('steigend');
  });

  it('erkennt einen fallenden Trend', () => {
    const ergebnis = berechneScore(
      [interaktion('dm_antwort', 10), interaktion('erstgespraech', 12)],
      JETZT
    );
    expect(ergebnis.trend).toBe('fallend');
  });

  it('erkennt einen stabilen Trend ohne jüngere Aktivität', () => {
    const ergebnis = berechneScore([], JETZT);
    expect(ergebnis.trend).toBe('stabil');
  });
});

describe('formatiereSignal', () => {
  it('formatiert "heute" für Interaktionen ohne Alter', () => {
    const ergebnis = berechneScore([interaktion('story_reaktion', 0)], JETZT);
    expect(formatiereSignal(ergebnis.topSignale[0], JETZT)).toContain('heute');
  });

  it('formatiert Alter in Tagen', () => {
    const ergebnis = berechneScore([interaktion('kommentar', 3)], JETZT);
    expect(formatiereSignal(ergebnis.topSignale[0], JETZT)).toContain('vor 3 Tagen');
  });
});

describe('ermittleNaechsteAktion', () => {
  it('empfiehlt "Antworten" bei unbeantworteter DM > 24h', () => {
    const empfehlung = ermittleNaechsteAktion({
      stufe: 'lauwarm',
      trend: 'stabil',
      letzteInteraktionAt: new Date(JETZT.getTime() - 2 * 24 * 60 * 60 * 1000),
      letzterInteraktionsTyp: 'dm_antwort',
      jetzt: JETZT,
    });
    expect(empfehlung.titel).toBe('Antworten');
    expect(empfehlung.prioritaet).toBe(1);
  });

  it('empfiehlt persönliche Nachricht bei warmem Lead ohne Kontakt seit 5+ Tagen', () => {
    const empfehlung = ermittleNaechsteAktion({
      stufe: 'warm',
      trend: 'fallend',
      letzteInteraktionAt: new Date(JETZT.getTime() - 6 * 24 * 60 * 60 * 1000),
      letzterInteraktionsTyp: 'like',
      jetzt: JETZT,
    });
    expect(empfehlung.titel).toBe('Persönliche Nachricht senden');
    expect(empfehlung.prioritaet).toBe(1);
  });

  it('empfiehlt Story-Reply bei heutiger Story-Reaktion', () => {
    const empfehlung = ermittleNaechsteAktion({
      stufe: 'lauwarm',
      trend: 'steigend',
      letzteInteraktionAt: JETZT,
      letzterInteraktionsTyp: 'story_reaktion',
      jetzt: JETZT,
    });
    expect(empfehlung.titel).toBe('Story-Reply nutzen');
  });

  it('empfiehlt Archivieren bei kaltem, fallendem, lange stillem Lead', () => {
    const empfehlung = ermittleNaechsteAktion({
      stufe: 'kalt',
      trend: 'fallend',
      letzteInteraktionAt: new Date(JETZT.getTime() - 25 * 24 * 60 * 60 * 1000),
      letzterInteraktionsTyp: 'like',
      jetzt: JETZT,
    });
    expect(empfehlung.titel).toBe('Archivieren oder letzter Impuls');
  });

  it('fällt bei warmem Lead ohne akute Regel auf "Beziehung pflegen" zurück', () => {
    const empfehlung = ermittleNaechsteAktion({
      stufe: 'warm',
      trend: 'stabil',
      letzteInteraktionAt: JETZT,
      letzterInteraktionsTyp: 'save',
      jetzt: JETZT,
    });
    expect(empfehlung.titel).toBe('Beziehung pflegen');
  });
});

describe('topAktionen', () => {
  it('sortiert nach Priorität, dann nach Score', () => {
    const eintraege = [
      { id: 'a', score: 10, empfehlung: { titel: 'A', begruendung: '', prioritaet: 2 as const } },
      { id: 'b', score: 90, empfehlung: { titel: 'B', begruendung: '', prioritaet: 1 as const } },
      { id: 'c', score: 60, empfehlung: { titel: 'C', begruendung: '', prioritaet: 1 as const } },
      { id: 'd', score: 5, empfehlung: { titel: 'D', begruendung: '', prioritaet: 3 as const } },
    ];
    const top = topAktionen(eintraege, 3);
    expect(top.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

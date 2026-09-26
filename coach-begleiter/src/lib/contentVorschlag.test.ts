import { describe, expect, it } from 'vitest';
import {
  ContentVorschlagSchema,
  baueBenutzerPrompt,
  baueSystemPrompt,
  montagDerWoche,
} from './contentVorschlag';

describe('montagDerWoche', () => {
  it('liefert sich selbst für einen Montag', () => {
    expect(montagDerWoche(new Date('2026-09-28T15:00:00'))).toBe('2026-09-28');
  });

  it('rechnet einen Mittwoch auf den Montag derselben Woche zurück', () => {
    expect(montagDerWoche(new Date('2026-09-30T09:00:00'))).toBe('2026-09-28');
  });

  it('zählt einen Sonntag zur VORHERIGEN Woche, nicht zur nächsten', () => {
    expect(montagDerWoche(new Date('2026-10-04T23:00:00'))).toBe('2026-09-28');
  });

  it('bleibt an einer Monatsgrenze korrekt', () => {
    // Dienstag, 2026-09-01 -> Montag der Woche ist der 2026-08-31.
    expect(montagDerWoche(new Date('2026-09-01T12:00:00'))).toBe('2026-08-31');
  });
});

describe('baueBenutzerPrompt', () => {
  it('listet aktive Challenges mit Kategorie auf', () => {
    const prompt = baueBenutzerPrompt({
      aktiveChallenges: [{ titel: 'Sichtbarkeits-Woche', kategorie: 'sichtbarkeit' }],
      offeneHausaufgaben: [],
    });
    expect(prompt).toContain('Sichtbarkeits-Woche (sichtbarkeit)');
  });

  it('kommt ohne Kategorie aus', () => {
    const prompt = baueBenutzerPrompt({
      aktiveChallenges: [{ titel: 'Ohne Tag', kategorie: null }],
      offeneHausaufgaben: [],
    });
    expect(prompt).toContain('- Ohne Tag');
    expect(prompt).not.toContain('Ohne Tag (');
  });

  it('markiert einen leeren Kontext statt leerer Abschnitte', () => {
    const prompt = baueBenutzerPrompt({ aktiveChallenges: [], offeneHausaufgaben: [] });
    expect(prompt).toContain('keine aktive Challenge');
    expect(prompt).toContain('keine offenen Aufgaben');
  });

  it('erwähnt explizit, dass es NICHT um Klientinnen geht', () => {
    // Wichtigste Zeile im ganzen Modul: der Kontext darf nie mit Lead-Radar-
    // Daten verwechselt werden.
    const prompt = baueBenutzerPrompt({ aktiveChallenges: [], offeneHausaufgaben: [] });
    expect(prompt).toContain('NICHT ihre eigenen Klientinnen');
  });
});

describe('baueSystemPrompt', () => {
  it('verlangt Deutsch und genau ein Thema', () => {
    const prompt = baueSystemPrompt();
    expect(prompt).toContain('Deutsch');
    expect(prompt).toContain('GENAU EIN');
  });
});

describe('ContentVorschlagSchema', () => {
  it('akzeptiert eine gültige Antwort', () => {
    const ergebnis = ContentVorschlagSchema.safeParse({
      thema: 'Wie ich meine Nische fand',
      begruendung: 'Passt zur aktuellen Sichtbarkeits-Challenge.',
    });
    expect(ergebnis.success).toBe(true);
  });

  it('lehnt ein leeres Thema ab', () => {
    const ergebnis = ContentVorschlagSchema.safeParse({ thema: '', begruendung: 'x' });
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt ein überlanges Thema ab', () => {
    const ergebnis = ContentVorschlagSchema.safeParse({
      thema: 'a'.repeat(141),
      begruendung: 'x',
    });
    expect(ergebnis.success).toBe(false);
  });

  it('lehnt eine fehlende Begründung ab', () => {
    const ergebnis = ContentVorschlagSchema.safeParse({ thema: 'Thema ohne Begründung' });
    expect(ergebnis.success).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { pruefeVerbindung } from './instagramVerbindung';

const JETZT = new Date('2026-09-16T12:00:00Z');
const inTagen = (t: number) => new Date(JETZT.getTime() + t * 24 * 60 * 60 * 1000).toISOString();

describe('pruefeVerbindung', () => {
  it('meldet eine fehlende Verknüpfung als handlungsbedürftig', () => {
    const z = pruefeVerbindung(null, JETZT);
    expect(z.stufe).toBe('nicht_verbunden');
    expect(z.handlungNoetig).toBe(true);
    expect(z.hinweis).toContain('nicht automatisch erfasst');
  });

  it('schweigt bei einer Verbindung mit reichlich Restlaufzeit', () => {
    const z = pruefeVerbindung(
      { ig_benutzername: 'coachin', token_gueltig_bis: inTagen(45) },
      JETZT
    );
    expect(z.stufe).toBe('aktiv');
    expect(z.handlungNoetig).toBe(false);
    expect(z.hinweis).toBe('');
    expect(z.tageBisAblauf).toBe(45);
  });

  it('warnt eine Woche vor Ablauf', () => {
    const z = pruefeVerbindung(
      { ig_benutzername: 'coachin', token_gueltig_bis: inTagen(6) },
      JETZT
    );
    expect(z.stufe).toBe('laeuft_bald_ab');
    expect(z.handlungNoetig).toBe(true);
    expect(z.hinweis).toContain('in 6 Tagen');
    expect(z.hinweis).toContain('@coachin');
  });

  it('formuliert die letzten Tage in natürlicher Sprache', () => {
    expect(
      pruefeVerbindung({ ig_benutzername: 'c', token_gueltig_bis: inTagen(1) }, JETZT).hinweis
    ).toContain('morgen');
    expect(
      pruefeVerbindung({ ig_benutzername: 'c', token_gueltig_bis: inTagen(0.5) }, JETZT).hinweis
    ).toContain('heute');
  });

  it('benennt beim Ablauf die Folge, nicht nur den Zustand', () => {
    const z = pruefeVerbindung(
      { ig_benutzername: 'coachin', token_gueltig_bis: inTagen(-3) },
      JETZT
    );
    expect(z.stufe).toBe('abgelaufen');
    expect(z.handlungNoetig).toBe(true);
    // Die Coachin soll erfahren, was seitdem NICHT passiert ist.
    expect(z.hinweis).toContain('keine neuen Interaktionen');
  });

  it('gibt ein fehlendes Ablaufdatum nicht als Warnung aus, aber auch nicht als Restlaufzeit', () => {
    const z = pruefeVerbindung({ ig_benutzername: 'c', token_gueltig_bis: null }, JETZT);
    expect(z.handlungNoetig).toBe(false);
    expect(z.tageBisAblauf).toBeNull();
  });

  it('verkraftet ein unbrauchbares Datum, ohne falschen Alarm zu schlagen', () => {
    const z = pruefeVerbindung({ ig_benutzername: 'c', token_gueltig_bis: 'kaputt' }, JETZT);
    expect(z.handlungNoetig).toBe(false);
    expect(z.tageBisAblauf).toBeNull();
  });

  it('kommt ohne hinterlegten Benutzernamen aus', () => {
    const z = pruefeVerbindung({ ig_benutzername: null, token_gueltig_bis: inTagen(-1) }, JETZT);
    expect(z.hinweis).toContain('Dein Instagram-Konto');
  });
});

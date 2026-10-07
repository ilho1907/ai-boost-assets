import { describe, expect, it } from 'vitest';
import { ladeAlleSeiten, vorTagen, type AbfrageAntwort } from './supabaseAbfragen';

/** Erzeugt eine Abfrage, die aus einem festen Datenbestand Seiten bedient. */
function abfrageAuf<T>(bestand: T[], aufrufe: number[] = []) {
  return (von: number, bis: number): PromiseLike<AbfrageAntwort<T>> => {
    aufrufe.push(von);
    return Promise.resolve({ data: bestand.slice(von, bis + 1), error: null });
  };
}

describe('ladeAlleSeiten', () => {
  it('liefert alles zurück, wenn eine Seite genügt', async () => {
    const { daten, fehler } = await ladeAlleSeiten(abfrageAuf([1, 2, 3]));
    expect(daten).toEqual([1, 2, 3]);
    expect(fehler).toBeNull();
  });

  it('blättert über die Seitengrenze hinaus, statt stillschweigend abzuschneiden', async () => {
    const bestand = Array.from({ length: 2300 }, (_, i) => i);
    const aufrufe: number[] = [];

    const { daten } = await ladeAlleSeiten(abfrageAuf(bestand, aufrufe));

    expect(daten).toHaveLength(2300);
    expect(daten[2299]).toBe(2299);
    expect(aufrufe).toEqual([0, 1000, 2000]);
  });

  it('hört auf, sobald eine volle Seite exakt den Bestand erschöpft', async () => {
    const bestand = Array.from({ length: 2000 }, (_, i) => i);
    const aufrufe: number[] = [];

    const { daten } = await ladeAlleSeiten(abfrageAuf(bestand, aufrufe));

    expect(daten).toHaveLength(2000);
    // Dritte Anfrage nötig, um das Ende zu erkennen — aber keine vierte.
    expect(aufrufe).toEqual([0, 1000, 2000]);
  });

  it('bricht bei einem Fehler ab und meldet ihn', async () => {
    const { daten, fehler } = await ladeAlleSeiten<number>(() =>
      Promise.resolve({ data: null, error: { message: 'keine Berechtigung' } })
    );
    expect(daten).toEqual([]);
    expect(fehler).toBe('keine Berechtigung');
  });

  it('gibt bereits geladene Seiten zurück, wenn eine spätere fehlschlägt', async () => {
    let aufruf = 0;
    const { daten, fehler } = await ladeAlleSeiten<number>(() => {
      aufruf += 1;
      if (aufruf === 1) {
        return Promise.resolve({
          data: Array.from({ length: 1000 }, (_, i) => i),
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: 'Zeitüberschreitung' } });
    });

    expect(daten).toHaveLength(1000);
    expect(fehler).toBe('Zeitüberschreitung');
  });
});

describe('vorTagen', () => {
  it('rechnet Tage in einen ISO-Zeitstempel zurück', () => {
    const jetzt = new Date('2026-09-14T12:00:00Z');
    expect(vorTagen(180, jetzt)).toBe('2026-03-18T12:00:00.000Z');
  });
});

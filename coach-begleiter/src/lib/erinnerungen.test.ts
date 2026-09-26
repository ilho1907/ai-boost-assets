import { describe, expect, it } from 'vitest';
import { ermittleErinnerungen } from './erinnerungen';

const JETZT = new Date('2026-09-23T09:00:00');
const heuteInTagen = (t: number) => {
  const d = new Date(JETZT);
  d.setDate(d.getDate() + t);
  return d.toISOString();
};
const datumInTagen = (t: number) => {
  const d = new Date(JETZT);
  d.setDate(d.getDate() + t);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
};

describe('ermittleErinnerungen — Termine', () => {
  it('markiert einen heutigen Termin als dringend', () => {
    const [e] = ermittleErinnerungen({
      termine: [{ id: 't1', titel: 'Mentoring-Call', start_at: heuteInTagen(0), ort: 'Zoom' }],
      challenges: [],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(e.prioritaet).toBe(1);
    expect(e.hinweis).toContain('heute');
    expect(e.hinweis).toContain('Zoom');
  });

  it('zeigt einen Termin in 7 Tagen noch als Vorschau', () => {
    const [e] = ermittleErinnerungen({
      termine: [{ id: 't2', titel: 'Retreat-Planung', start_at: heuteInTagen(7), ort: null }],
      challenges: [],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(e.prioritaet).toBe(3);
  });

  it('blendet einen Termin in 8 Tagen noch aus', () => {
    const liste = ermittleErinnerungen({
      termine: [{ id: 't3', titel: 'Zu weit weg', start_at: heuteInTagen(8), ort: null }],
      challenges: [],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });

  it('blendet vergangene Termine aus', () => {
    const liste = ermittleErinnerungen({
      termine: [{ id: 't4', titel: 'Vorbei', start_at: heuteInTagen(-1), ort: null }],
      challenges: [],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });
});

describe('ermittleErinnerungen — Challenges', () => {
  const basisChallenge = {
    id: 'c1',
    titel: 'Sichtbarkeits-Woche',
    start_at: heuteInTagen(-2),
  };

  it('zeigt eine beigetretene, aktive Challenge', () => {
    const [e] = ermittleErinnerungen({
      termine: [],
      challenges: [
        { ...basisChallenge, ende_at: heuteInTagen(5), beigetreten_at: heuteInTagen(-2), erledigt_at: null },
      ],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(e.typ).toBe('challenge');
    expect(e.prioritaet).toBe(3);
  });

  it('erhöht die Priorität, je näher das Ende rückt', () => {
    const [e] = ermittleErinnerungen({
      termine: [],
      challenges: [
        { ...basisChallenge, ende_at: heuteInTagen(1), beigetreten_at: heuteInTagen(-2), erledigt_at: null },
      ],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(e.prioritaet).toBe(1);
    expect(e.hinweis).toContain('morgen');
  });

  it('zeigt Challenges nicht, denen die Coachin nicht beigetreten ist', () => {
    const liste = ermittleErinnerungen({
      termine: [],
      challenges: [{ ...basisChallenge, ende_at: heuteInTagen(5), beigetreten_at: null, erledigt_at: null }],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });

  it('blendet erledigte Challenges aus', () => {
    const liste = ermittleErinnerungen({
      termine: [],
      challenges: [
        {
          ...basisChallenge,
          ende_at: heuteInTagen(5),
          beigetreten_at: heuteInTagen(-2),
          erledigt_at: heuteInTagen(-1),
        },
      ],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });

  it('blendet Challenges ausserhalb ihres Zeitraums aus', () => {
    const liste = ermittleErinnerungen({
      termine: [],
      challenges: [
        {
          id: 'c2',
          titel: 'Noch nicht gestartet',
          start_at: heuteInTagen(3),
          ende_at: heuteInTagen(10),
          beigetreten_at: heuteInTagen(-1),
          erledigt_at: null,
        },
      ],
      hausaufgaben: [],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });
});

describe('ermittleErinnerungen — Hausaufgaben', () => {
  it('markiert eine überfällige Hausaufgabe deutlich', () => {
    const [e] = ermittleErinnerungen({
      termine: [],
      challenges: [],
      hausaufgaben: [
        { id: 'h1', titel: 'Workbook Kapitel 3', faellig_am: datumInTagen(-2), erledigt_at: null },
      ],
      jetzt: JETZT,
    });
    expect(e.prioritaet).toBe(1);
    expect(e.hinweis).toContain('überfällig');
  });

  it('blendet erledigte Hausaufgaben aus', () => {
    const liste = ermittleErinnerungen({
      termine: [],
      challenges: [],
      hausaufgaben: [
        {
          id: 'h2',
          titel: 'Erledigt',
          faellig_am: datumInTagen(-1),
          erledigt_at: heuteInTagen(-1),
        },
      ],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });

  it('blendet Hausaufgaben ohne Fälligkeitsdatum aus', () => {
    const liste = ermittleErinnerungen({
      termine: [],
      challenges: [],
      hausaufgaben: [{ id: 'h3', titel: 'Irgendwann', faellig_am: null, erledigt_at: null }],
      jetzt: JETZT,
    });
    expect(liste).toHaveLength(0);
  });
});

describe('ermittleErinnerungen — Sortierung', () => {
  it('sortiert nach Priorität, bei Gleichstand nach Fälligkeit', () => {
    const liste = ermittleErinnerungen({
      termine: [{ id: 't1', titel: 'Termin in 6 Tagen', start_at: heuteInTagen(6), ort: null }],
      challenges: [
        {
          id: 'c1',
          titel: 'Challenge endet heute',
          start_at: heuteInTagen(-3),
          ende_at: heuteInTagen(0),
          beigetreten_at: heuteInTagen(-3),
          erledigt_at: null,
        },
      ],
      hausaufgaben: [
        { id: 'h1', titel: 'Fällig morgen', faellig_am: datumInTagen(1), erledigt_at: null },
      ],
      jetzt: JETZT,
    });

    expect(liste.map((e) => e.id)).toEqual(['c1', 'h1', 't1']);
  });
});

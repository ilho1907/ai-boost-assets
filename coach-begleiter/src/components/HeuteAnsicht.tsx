import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { ContentVorschlagKarte } from './ContentVorschlagKarte';
import {
  ermittleErinnerungen,
  type ChallengeMitTeilnahme,
  type Erinnerung,
  type HausaufgabeZeile,
  type TerminZeile,
} from '../lib/erinnerungen';

const TYP_LABEL: Record<Erinnerung['typ'], string> = {
  termin: 'Termin',
  challenge: 'Challenge',
  hausaufgabe: 'Hausaufgabe',
};

/**
 * "Was steht heute für mich an?" — persönlich, weil jede Coachin nur ihre
 * eigenen Termine/Hausaufgaben und nur die Challenges sieht, denen sie
 * beigetreten ist (RLS + die Teilnahme-Zeile). Die Priorisierung selbst ist
 * reine Datumsarithmetik in `erinnerungen.ts`, kein KI-Aufruf — siehe dort.
 */
export function HeuteAnsicht({ session }: { session: Session }) {
  const [erinnerungen, setErinnerungen] = useState<Erinnerung[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    async function laden() {
      setLaedt(true);
      setFehler(null);

      const jetzt = new Date();
      const inSiebenTagen = new Date(jetzt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const [termineErg, challengesErg, hausaufgabenErg] = await Promise.all([
        supabase
          .from('termine')
          .select('id, titel, start_at, ort')
          .gte('start_at', jetzt.toISOString())
          .lte('start_at', inSiebenTagen)
          .order('start_at'),
        supabase
          .from('challenges')
          .select(
            'id, titel, start_at, ende_at, coach_challenge_teilnahme(beigetreten_at, erledigt_at)'
          )
          .lte('start_at', jetzt.toISOString())
          .gte('ende_at', jetzt.toISOString()),
        supabase
          .from('hausaufgaben')
          .select('id, titel, faellig_am, erledigt_at')
          .is('erledigt_at', null)
          .order('faellig_am'),
      ]);

      const ersterFehler = termineErg.error ?? challengesErg.error ?? hausaufgabenErg.error;
      if (ersterFehler) {
        setFehler(ersterFehler.message);
        setLaedt(false);
        return;
      }

      const termine: TerminZeile[] = termineErg.data ?? [];

      // Die Teilnahme kommt als eingebettetes Array (RLS greift auch hier:
      // jede Coachin sieht nur ihre eigene Zeile in coach_challenge_teilnahme).
      const challenges: ChallengeMitTeilnahme[] = (challengesErg.data ?? []).map((c) => {
        const teilnahme = Array.isArray(c.coach_challenge_teilnahme)
          ? c.coach_challenge_teilnahme[0]
          : c.coach_challenge_teilnahme;
        return {
          id: c.id,
          titel: c.titel,
          start_at: c.start_at,
          ende_at: c.ende_at,
          beigetreten_at: teilnahme?.beigetreten_at ?? null,
          erledigt_at: teilnahme?.erledigt_at ?? null,
        };
      });

      const hausaufgaben: HausaufgabeZeile[] = hausaufgabenErg.data ?? [];

      setErinnerungen(
        ermittleErinnerungen({ termine, challenges, hausaufgaben, jetzt: new Date() })
      );
      setLaedt(false);
    }

    laden();
  }, []);

  return (
    <div className="cb-root cb-heute">
      <header className="cb-heute__kopf">
        <div>
          <h1 className="cb-heading cb-heute__titel">Heute für dich</h1>
          <p className="cb-heute__untertitel">{session.user.email}</p>
        </div>
        <button type="button" className="cb-btn cb-btn--ghost" onClick={() => supabase.auth.signOut()}>
          Abmelden
        </button>
      </header>

      <ContentVorschlagKarte />

      {fehler && (
        <p className="cb-fehler" role="alert">
          {fehler}
        </p>
      )}

      {laedt && <p className="cb-panel__text">Lädt…</p>}

      {!laedt && !fehler && erinnerungen.length === 0 && (
        <p className="cb-leer">
          Nichts Dringendes in den nächsten Tagen — schau später wieder vorbei.
        </p>
      )}

      {!laedt && !fehler && erinnerungen.length > 0 && (
        <div className="cb-liste">
          {erinnerungen.map((e) => (
            <article key={`${e.typ}-${e.id}`} className={`cb-eintrag cb-eintrag--${e.prioritaet}`}>
              <span className="cb-eintrag__marke" />
              <div>
                <span className="cb-eintrag__typ">{TYP_LABEL[e.typ]}</span>
                <p className="cb-eintrag__titel">{e.titel}</p>
                <p className="cb-eintrag__hinweis">{e.hinweis}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

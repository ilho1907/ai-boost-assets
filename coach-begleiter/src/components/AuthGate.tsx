import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { istSupabaseKonfiguriert, supabase } from '../lib/supabaseClient';
import { Anmeldung } from './Anmeldung';

type ZulassungsStatus = 'prueft' | 'zugelassen' | 'nicht_zugelassen';

/**
 * Hält die Supabase-Session und entscheidet, was gerendert wird.
 *
 * Coach-Begleiter ist ausschließlich für bereits zugelassene Coachinnen
 * (siehe coach-studio: `coach_profile` entsteht dort über eine an eine
 * E-Mail-Adresse gebundene Einladung). Hier wird diese Zulassung nur
 * GEPRÜFT, nicht noch einmal vergeben — eine zweite Einladungs-Oberfläche
 * würde dieselbe Logik duplizieren. Fehlt `coach_profile`, verweist die
 * Meldung auf Coach-Studio statt einen eigenen Zulassungs-Flow anzubieten.
 */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [zulassung, setZulassung] = useState<ZulassungsStatus>('prueft');

  useEffect(() => {
    if (!istSupabaseKonfiguriert) {
      setLaedt(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLaedt(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_ereignis, neueSession) => {
      setSession(neueSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function zulassungPruefen(userId: string) {
    setZulassung('prueft');
    const { data } = await supabase
      .from('coach_profile')
      .select('coach_id')
      .eq('coach_id', userId)
      .maybeSingle();
    setZulassung(data ? 'zugelassen' : 'nicht_zugelassen');
  }

  useEffect(() => {
    if (session) zulassungPruefen(session.user.id);
  }, [session?.user.id]);

  if (!istSupabaseKonfiguriert) {
    return (
      <div className="cb-root cb-zentriert">
        <div className="cb-panel">
          <h1 className="cb-panel__titel">Noch nicht verbunden</h1>
          <p className="cb-panel__text">
            Coach-Begleiter findet keine Supabase-Zugangsdaten. Lege eine Datei{' '}
            <code>.env.local</code> an und trage <code>VITE_SUPABASE_URL</code> sowie{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> ein — dieselben Werte wie im Coach-Studio,
            beide teilen sich dasselbe Supabase-Projekt.
          </p>
        </div>
      </div>
    );
  }

  if (laedt) {
    return (
      <div className="cb-root cb-zentriert">
        <p className="cb-panel__text">Einen Moment…</p>
      </div>
    );
  }

  if (!session) return <Anmeldung />;

  if (zulassung === 'prueft') {
    return (
      <div className="cb-root cb-zentriert">
        <p className="cb-panel__text">Einen Moment…</p>
      </div>
    );
  }

  if (zulassung === 'nicht_zugelassen') {
    return (
      <div className="cb-root cb-zentriert">
        <div className="cb-panel">
          <h1 className="cb-panel__titel">Noch nicht als Coachin zugelassen</h1>
          <p className="cb-panel__text">
            Coach-Begleiter ist für zugelassene smile2go-Coachinnen. Deine Zulassung läuft über
            das Coach-Studio — dort löst du deinen Einladungslink ein, den du nach eurem
            kostenlosen Kennenlerngespräch bekommen hast.
          </p>
          <button
            type="button"
            className="cb-btn cb-btn--ghost"
            onClick={() => zulassungPruefen(session.user.id)}
          >
            Erneut prüfen
          </button>
        </div>
      </div>
    );
  }

  return <>{children(session)}</>;
}

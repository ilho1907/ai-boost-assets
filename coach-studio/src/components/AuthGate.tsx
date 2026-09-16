import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { istSupabaseKonfiguriert, supabase } from '../lib/supabaseClient';
import { Anmeldung } from './Anmeldung';
import { Zulassung } from './Zulassung';

type ZulassungsStatus = 'prueft' | 'zugelassen' | 'nicht_zugelassen';

/**
 * Hält die Supabase-Session und entscheidet, was gerendert wird.
 *
 * Zwei getrennte Fragen, nicht eine: "ist die Person angemeldet" (Session)
 * und "ist die Person eine zugelassene Coachin" (coach_profile). Ein Magic
 * Link beweist nur den Zugriff auf eine E-Mail-Adresse — ohne die zweite
 * Prüfung wäre jede angemeldete Person automatisch ihre eigene "Coachin",
 * obwohl das Kernversprechen "verifizierte Coachinnen" lautet. Ohne
 * coach_profile geben die RLS-Policies ohnehin keine Zeile heraus, die
 * Ansicht bliebe also auch technisch leer — dieses Gate macht daraus einen
 * verständlichen nächsten Schritt statt einer stillen leeren Seite.
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
      <div className="cs-root cs-zentriert">
        <div className="cs-panel">
          <h1 className="cs-panel__titel">Noch nicht verbunden</h1>
          <p className="cs-panel__text">
            Das Coach-Studio findet keine Supabase-Zugangsdaten. Lege eine Datei{' '}
            <code>.env.local</code> an und trage <code>VITE_SUPABASE_URL</code> sowie{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> ein — die Vorlage dafür liegt als{' '}
            <code>.env.example</code> bereit.
          </p>
        </div>
      </div>
    );
  }

  if (laedt) {
    return (
      <div className="cs-root cs-zentriert">
        <p className="cs-panel__text">Einen Moment…</p>
      </div>
    );
  }

  if (!session) return <Anmeldung />;

  if (zulassung === 'prueft') {
    return (
      <div className="cs-root cs-zentriert">
        <p className="cs-panel__text">Einen Moment…</p>
      </div>
    );
  }

  if (zulassung === 'nicht_zugelassen') {
    return <Zulassung onZugelassen={() => zulassungPruefen(session.user.id)} />;
  }

  return <>{children(session)}</>;
}

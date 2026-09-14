import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { istSupabaseKonfiguriert, supabase } from '../lib/supabaseClient';
import { Anmeldung } from './Anmeldung';

/**
 * Hält die Supabase-Session und entscheidet, was gerendert wird.
 *
 * Ohne angemeldete Coachin ist `auth.uid()` null, und die RLS-Policies geben
 * konsequenterweise keine einzige Zeile heraus — die Ansicht bliebe leer.
 * Deshalb steht die Anmeldung zwingend vor dem Lead-Radar.
 */
export function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [laedt, setLaedt] = useState(true);

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

  return <>{children(session)}</>;
}

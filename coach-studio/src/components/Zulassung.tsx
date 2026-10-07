import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  einladungMerken,
  extrahiereEinladungsToken,
  extrahiereTokenAusEingabe,
  gemerkteEinladungLesen,
  gemerkteEinladungLoeschen,
} from '../lib/einladung';

type Zustand = 'bereit' | 'loest_ein' | 'fehler';

// Noch kein eigenes Env-Feld dafür vorgesehen (kein Calendly-Konto in dieser
// Session verfügbar) — Platzhalter, vor Go-Live durch die echte Buchungs-URL
// ersetzen oder als VITE_CALENDLY_URL aus der Umgebung lesen.
const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL || 'https://calendly.com/smile2go';

/**
 * Steht zwischen erfolgreicher Anmeldung und dem eigentlichen Coach-Studio.
 *
 * Ein Magic Link beweist nur, dass jemand Zugriff auf eine E-Mail-Adresse
 * hat — er beweist nicht, dass diese Person eine zugelassene Coachin ist.
 * Diese Zulassung entsteht ausschließlich über eine eingelöste Einladung
 * (`coach_einladung_einloesen`, serverseitig an dieselbe E-Mail gebunden).
 */
export function Zulassung({ onZugelassen }: { onZugelassen: () => void }) {
  const [token, setToken] = useState('');
  const [zustand, setZustand] = useState<Zustand>('bereit');
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    const ausUrl = extrahiereEinladungsToken(window.location.search);
    if (ausUrl) {
      einladungMerken(ausUrl);
      setToken(ausUrl);
      return;
    }
    const gemerkt = gemerkteEinladungLesen();
    if (gemerkt) setToken(gemerkt);
  }, []);

  async function einloesen(ereignis: FormEvent) {
    ereignis.preventDefault();
    const bereinigt = extrahiereTokenAusEingabe(token);
    if (!bereinigt) return;

    setZustand('loest_ein');
    setFehler(null);

    const { error } = await supabase.rpc('coach_einladung_einloesen', { p_token: bereinigt });

    if (error) {
      setZustand('fehler');
      // Die Fehlermeldung der Funktion ist bereits für Coachinnen verständlich
      // formuliert (siehe coach_einladung_einloesen in der Migration).
      setFehler(error.message.replace(/^coach_einladung_einloesen:\s*/, ''));
      return;
    }

    gemerkteEinladungLoeschen();
    onZugelassen();
  }

  return (
    <div className="cs-root cs-zentriert">
      <form className="cs-panel" onSubmit={einloesen}>
        <p className="cs-panel__marke">smile2go · Coach-Studio</p>
        <h1 className="cs-panel__titel">Fast geschafft</h1>
        <p className="cs-panel__text">
          Dein Konto ist bestätigt, aber noch nicht als Coachin freigeschaltet. Füge deinen
          Einladungslink ein — den hast du nach eurem kostenlosen Kennenlerngespräch per E-Mail
          bekommen.
        </p>

        <div className="cs-field">
          <label htmlFor="cs-einladung">Einladungslink oder -code</label>
          <input
            id="cs-einladung"
            type="text"
            required
            placeholder="https://…/?einladung=…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </div>

        {fehler && (
          <p className="cs-fehler" role="alert">
            Das hat nicht geklappt: {fehler}
          </p>
        )}

        <button type="submit" className="cs-btn cs-btn--primary" disabled={zustand === 'loest_ein'}>
          {zustand === 'loest_ein' ? 'Wird geprüft…' : 'Freischalten'}
        </button>

        <p className="cs-panel__text" style={{ marginTop: '1rem', marginBottom: 0 }}>
          Noch kein Kennenlerngespräch gehabt?{' '}
          <a href={CALENDLY_URL} target="_blank" rel="noreferrer">
            Hier Termin buchen
          </a>
          .
        </p>
      </form>
    </div>
  );
}

import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

type Zustand = 'bereit' | 'sendet' | 'gesendet' | 'fehler';

/**
 * Anmeldung per Magic Link — bewusst ohne Passwort: eine Coachin soll sich
 * nichts merken müssen, und wir speichern kein weiteres Geheimnis.
 */
export function Anmeldung() {
  const [email, setEmail] = useState('');
  const [zustand, setZustand] = useState<Zustand>('bereit');
  const [fehler, setFehler] = useState<string | null>(null);

  async function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    const adresse = email.trim();
    if (!adresse) return;

    setZustand('sendet');
    setFehler(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: adresse,
      options: { emailRedirectTo: window.location.origin },
    });

    if (error) {
      setZustand('fehler');
      setFehler(error.message);
      return;
    }
    setZustand('gesendet');
  }

  if (zustand === 'gesendet') {
    return (
      <div className="cb-root cb-zentriert">
        <div className="cb-panel">
          <h1 className="cb-panel__titel">Schau in dein Postfach</h1>
          <p className="cb-panel__text">
            Wir haben dir einen Anmeldelink an <strong>{email.trim()}</strong> geschickt. Ein
            Klick darauf genügt — kein Passwort nötig.
          </p>
          <button
            type="button"
            className="cb-btn cb-btn--ghost"
            onClick={() => setZustand('bereit')}
          >
            Andere Adresse verwenden
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cb-root cb-zentriert">
      <form className="cb-panel" onSubmit={absenden}>
        <p className="cb-panel__marke">smile2go · Coach-Begleiter</p>
        <h1 className="cb-panel__titel">Willkommen zurück</h1>
        <p className="cb-panel__text">
          Melde dich mit deiner E-Mail-Adresse an. Wir schicken dir einen Link — ohne Passwort.
        </p>

        <div className="cb-field">
          <label htmlFor="cb-email">E-Mail-Adresse</label>
          <input
            id="cb-email"
            type="email"
            autoComplete="email"
            required
            placeholder="du@beispiel.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {fehler && (
          <p className="cb-fehler" role="alert">
            Das hat nicht geklappt: {fehler}
          </p>
        )}

        <button type="submit" className="cb-btn cb-btn--primary" disabled={zustand === 'sendet'}>
          {zustand === 'sendet' ? 'Wird gesendet…' : 'Anmeldelink senden'}
        </button>
      </form>
    </div>
  );
}

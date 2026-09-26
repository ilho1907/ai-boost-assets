import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { montagDerWoche } from '../lib/contentVorschlag';

interface Vorschlag {
  thema: string;
  begruendung: string;
  woche_start: string;
}

/**
 * Zeigt den Content-Themenvorschlag der aktuellen Woche, oder einen Knopf,
 * um einen anzufordern. Die eigentliche Anthropic-Anfrage läuft serverseitig
 * (Edge Function `content-vorschlag`) — der Browser sieht nie den API-Key.
 */
export function ContentVorschlagKarte() {
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fordertAn, setFordertAn] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const wocheStart = montagDerWoche(new Date());

  useEffect(() => {
    async function laden() {
      setLaedt(true);
      const { data, error } = await supabase
        .from('content_vorschlaege')
        .select('thema, begruendung, woche_start')
        .eq('woche_start', wocheStart)
        .maybeSingle();

      if (error) setFehler(error.message);
      else setVorschlag(data);
      setLaedt(false);
    }
    laden();
  }, [wocheStart]);

  async function anfordern() {
    setFordertAn(true);
    setFehler(null);

    const { data: sitzung } = await supabase.auth.getSession();
    if (!sitzung.session) {
      setFehler('Nicht angemeldet.');
      setFordertAn(false);
      return;
    }

    // supabase-js hängt den Authorization-Header aus der aktuellen Session
    // automatisch an — die Edge Function liest ihn daraus, kein manuelles
    // Weiterreichen nötig.
    const { data, error } = await supabase.functions.invoke<Vorschlag>('content-vorschlag', {
      method: 'POST',
    });

    if (error) {
      setFehler('Themenvorschlag konnte nicht erzeugt werden. Versuch es später noch einmal.');
      setFordertAn(false);
      return;
    }

    setVorschlag(data ?? null);
    setFordertAn(false);
  }

  if (laedt) return null;

  return (
    <section className="cb-content-vorschlag">
      <h2 className="cb-heading cb-content-vorschlag__titel">Diese Woche empfehle ich dir</h2>

      {fehler && (
        <p className="cb-fehler" role="alert">
          {fehler}
        </p>
      )}

      {vorschlag ? (
        <div className="cb-content-vorschlag__karte">
          <p className="cb-content-vorschlag__thema">{vorschlag.thema}</p>
          <p className="cb-content-vorschlag__begruendung">{vorschlag.begruendung}</p>
        </div>
      ) : (
        <div className="cb-content-vorschlag__leer">
          <p className="cb-panel__text" style={{ margin: '0 0 0.8rem' }}>
            Noch kein Themenvorschlag für diese Woche.
          </p>
          <button
            type="button"
            className="cb-btn cb-btn--primary"
            onClick={anfordern}
            disabled={fordertAn}
          >
            {fordertAn ? 'Wird erstellt…' : 'Themenvorschlag anfordern'}
          </button>
        </div>
      )}
    </section>
  );
}

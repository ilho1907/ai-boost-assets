import { useState, type FormEvent } from 'react';
import type { LeadQuelle } from '../types/leadRadar';

export interface LeadAnlegenProps {
  onSchliessen: () => void;
  onAnlegen: (lead: {
    name: string;
    instagram_handle: string | null;
    quelle: LeadQuelle;
    notiz: string | null;
  }) => Promise<string | null>;
}

const QUELLEN: { wert: LeadQuelle; label: string }[] = [
  { wert: 'erstgespraech', label: 'Erstgespräch' },
  { wert: 'dm', label: 'Direktnachricht' },
  { wert: 'empfehlung', label: 'Empfehlung' },
  { wert: 'sonstige', label: 'Sonstige' },
];

/**
 * Modal zum Anlegen einer neuen Interessentin.
 *
 * Bewusst ohne Consent-Schalter: hier entstehen nur Kontaktstammdaten. Die
 * Einwilligung zum Erfassen von Interaktionen wird getrennt in
 * `LeadVerknuepfen` eingeholt, damit sie eine eigene, bewusste Entscheidung
 * bleibt und nicht im Anlegen-Formular mitläuft.
 */
export function LeadAnlegen({ onSchliessen, onAnlegen }: LeadAnlegenProps) {
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [quelle, setQuelle] = useState<LeadQuelle>('erstgespraech');
  const [notiz, setNotiz] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    const bereinigterName = name.trim();
    if (!bereinigterName) return;

    setSpeichert(true);
    setFehler(null);

    const bereinigterHandle = handle.trim().replace(/^@/, '');
    const meldung = await onAnlegen({
      name: bereinigterName,
      instagram_handle: bereinigterHandle || null,
      quelle,
      notiz: notiz.trim() || null,
    });

    if (meldung) {
      setFehler(meldung);
      setSpeichert(false);
      return;
    }
    onSchliessen();
  }

  return (
    <div className="cs-modal__backdrop" role="dialog" aria-modal="true">
      <form className="cs-modal" onSubmit={absenden}>
        <h2 className="cs-modal__title">Neue Interessentin</h2>
        <p className="cs-modal__intro">
          Lege den Kontakt an. Ob Lead-Radar ihre Interaktionen auswertet, entscheidest du
          anschließend separat — mit ihrer Einwilligung.
        </p>

        <div className="cs-field">
          <label htmlFor="cs-neu-name">Name</label>
          <input
            id="cs-neu-name"
            type="text"
            required
            autoFocus
            placeholder="z. B. Nora Fischer"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="cs-field">
          <label htmlFor="cs-neu-handle">Instagram-Handle (optional)</label>
          <input
            id="cs-neu-handle"
            type="text"
            placeholder="z. B. nora.wandelt"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
          />
        </div>

        <div className="cs-field">
          <label htmlFor="cs-neu-quelle">Woher kennt ihr euch?</label>
          <select
            id="cs-neu-quelle"
            value={quelle}
            onChange={(e) => setQuelle(e.target.value as LeadQuelle)}
          >
            {QUELLEN.map(({ wert, label }) => (
              <option key={wert} value={wert}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="cs-field">
          <label htmlFor="cs-neu-notiz">Notiz (optional)</label>
          <textarea
            id="cs-neu-notiz"
            rows={3}
            placeholder="Was möchtest du dir merken?"
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />
        </div>

        {fehler && (
          <p className="cs-fehler" role="alert">
            {fehler}
          </p>
        )}

        <div className="cs-modal__actions">
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onSchliessen}>
            Abbrechen
          </button>
          <button type="submit" className="cs-btn cs-btn--primary" disabled={speichert}>
            {speichert ? 'Wird angelegt…' : 'Anlegen'}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import type { Lead } from '../types/leadRadar';

export interface LeadVerknuepfenProps {
  lead: Lead;
  onSchliessen: () => void;
  onSpeichern: (aenderungen: {
    instagram_handle: string | null;
    consent_tracking: boolean;
  }) => void;
}

/**
 * Modal zum manuellen Zuordnen des Instagram-Handles eines Leads und zum
 * Einholen der Einwilligung (DSGVO Art. 6 Abs. 1 lit. a). Der Consent-Schalter
 * ist bewusst NICHT vorausgewählt.
 */
export function LeadVerknuepfen({ lead, onSchliessen, onSpeichern }: LeadVerknuepfenProps) {
  const [handle, setHandle] = useState(lead.instagram_handle ?? '');
  const [consent, setConsent] = useState(lead.consent_tracking);

  function handleSpeichern() {
    const bereinigt = handle.trim().replace(/^@/, '');
    onSpeichern({
      instagram_handle: bereinigt.length > 0 ? bereinigt : null,
      consent_tracking: consent,
    });
  }

  return (
    <div className="cs-modal__backdrop" role="dialog" aria-modal="true">
      <div className="cs-modal">
        <h2 className="cs-modal__title">Mit Instagram verknüpfen</h2>
        <p className="cs-modal__intro">
          Ordne {lead.name} ihrem Instagram-Profil zu, damit Lead-Radar erkennt, wenn sie mit
          deinem eigenen Konto in Kontakt tritt.
        </p>

        <div className="cs-field">
          <label htmlFor="cs-ig-handle">Instagram-Handle</label>
          <input
            id="cs-ig-handle"
            type="text"
            placeholder="z. B. maxine.mustermann"
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
          />
        </div>

        <div className="cs-consent">
          <label className="cs-switch">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span className="cs-switch__track" />
          </label>
          <p className="cs-consent__text">
            <strong>Beziehungspflege statt Überwachung.</strong> Mit deiner Zustimmung erfasst
            Lead-Radar nur, <em>wie</em> und <em>wann</em> {lead.name} mit deinem eigenen
            Instagram-Konto interagiert – z. B. eine DM-Antwort, eine Story-Reaktion oder ein
            Kommentar. Wir lesen niemals ihr Profil, ihre Kontakte oder ihre Beiträge. Du kannst
            die Einwilligung jederzeit widerrufen; ihre Daten werden dann vollständig gelöscht.
          </p>
        </div>

        <div className="cs-modal__actions">
          <button type="button" className="cs-btn cs-btn--ghost" onClick={onSchliessen}>
            Abbrechen
          </button>
          <button type="button" className="cs-btn cs-btn--primary" onClick={handleSpeichern}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

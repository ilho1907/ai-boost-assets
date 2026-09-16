import type { BetreuungsErgebnis } from '../lib/scoring';
import type { Lead } from '../types/leadRadar';

export interface KlientinKarteProps {
  lead: Lead;
  betreuung: BetreuungsErgebnis;
  onAktionAusfuehren: (lead: Lead) => void;
  onNotizAendern: (lead: Lead, notiz: string) => void;
}

const STUFE_LABEL: Record<BetreuungsErgebnis['stufe'], string> = {
  aktiv: 'Im Fluss',
  aufmerksamkeit: 'Check-in fällig',
  still: 'Lange still',
};

/**
 * Karte einer bestehenden Klientin. Bewusst ohne Score und ohne
 * Interesse-Stufe: sie hat sich längst entschieden. Gezeigt wird, wie es um
 * die Begleitung steht.
 */
export function KlientinKarte({
  lead,
  betreuung,
  onAktionAusfuehren,
  onNotizAendern,
}: KlientinKarteProps) {
  return (
    <article className="cs-card" data-lead-id={lead.id}>
      <div className="cs-card__head">
        <div>
          <h3 className="cs-card__name">{lead.name}</h3>
          {lead.instagram_handle && <p className="cs-card__handle">@{lead.instagram_handle}</p>}
        </div>
        <span className={`cs-badge cs-badge--betreuung-${betreuung.stufe}`}>
          {STUFE_LABEL[betreuung.stufe]}
        </span>
      </div>

      <p className="cs-card__trend">
        {betreuung.tageSeitKontakt === null
          ? 'Noch kein Kontakt festgehalten'
          : betreuung.tageSeitKontakt <= 0
            ? 'Heute in Kontakt'
            : `Letzter Kontakt vor ${betreuung.tageSeitKontakt} Tagen`}
      </p>

      <div className="cs-card__aktion">
        <span className="cs-card__aktion-titel">{betreuung.empfehlung.titel}</span>
        <p className="cs-card__aktion-begruendung">{betreuung.empfehlung.begruendung}</p>
      </div>

      <button
        type="button"
        className="cs-btn cs-btn--primary"
        onClick={() => onAktionAusfuehren(lead)}
      >
        Kontakt vermerken
      </button>

      <textarea
        className="cs-card__notiz"
        placeholder="Notiz zur Begleitung…"
        defaultValue={lead.notiz ?? ''}
        onBlur={(event) => onNotizAendern(lead, event.target.value)}
      />
    </article>
  );
}

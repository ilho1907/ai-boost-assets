import { formatiereSignal, type Empfehlung, type ScoreErgebnis } from '../lib/scoring';
import type { Lead } from '../types/leadRadar';

export interface LeadKarteProps {
  lead: Lead;
  score: ScoreErgebnis;
  empfehlung: Empfehlung;
  onAktionAusfuehren: (lead: Lead) => void;
  onNotizAendern: (lead: Lead, notiz: string) => void;
  onVerknuepfen: (lead: Lead) => void;
}

const TREND_LABEL: Record<ScoreErgebnis['trend'], string> = {
  steigend: '↗ Interesse wächst',
  stabil: '→ konstant',
  fallend: '↘ lässt nach',
};

export function LeadKarte({
  lead,
  score,
  empfehlung,
  onAktionAusfuehren,
  onNotizAendern,
  onVerknuepfen,
}: LeadKarteProps) {
  return (
    <article className="cs-card" data-lead-id={lead.id}>
      <div className="cs-card__head">
        <div>
          <h3 className="cs-card__name">{lead.name}</h3>
          <p className="cs-card__handle">
            {lead.instagram_handle ? (
              `@${lead.instagram_handle}`
            ) : (
              <button
                type="button"
                className="cs-btn cs-btn--ghost"
                onClick={() => onVerknuepfen(lead)}
              >
                Instagram verknüpfen
              </button>
            )}
          </p>
        </div>
        <span className={`cs-badge cs-badge--${score.stufe}`}>{score.stufe}</span>
      </div>

      <p className="cs-card__trend">
        {TREND_LABEL[score.trend]} · Score {score.score}
      </p>

      {score.topSignale.length > 0 && (
        <ul className="cs-card__signale">
          {score.topSignale.map((signal) => (
            <li key={signal.typ}>{formatiereSignal(signal)}</li>
          ))}
        </ul>
      )}

      <div className="cs-card__aktion">
        <span className="cs-card__aktion-titel">{empfehlung.titel}</span>
        <p className="cs-card__aktion-begruendung">{empfehlung.begruendung}</p>
      </div>

      <button
        type="button"
        className="cs-btn cs-btn--primary"
        onClick={() => onAktionAusfuehren(lead)}
      >
        {empfehlung.titel}
      </button>

      <textarea
        className="cs-card__notiz"
        placeholder="Notiz zu dieser Beziehung…"
        defaultValue={lead.notiz ?? ''}
        onBlur={(event) => onNotizAendern(lead, event.target.value)}
      />
    </article>
  );
}

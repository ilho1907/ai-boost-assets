import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LeadKarte } from './LeadKarte';
import { berechneScore, ermittleNaechsteAktion, type Empfehlung } from '../lib/scoring';
import type { Lead } from '../types/leadRadar';

const JETZT = new Date('2026-09-16T12:00:00Z');

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'l1',
    coach_id: 'c1',
    name: 'Nora Fischer',
    instagram_handle: 'nora.wandelt',
    instagram_scoped_id: null,
    quelle: 'erstgespraech',
    status: 'kontaktiert',
    consent_tracking: true,
    consent_at: JETZT.toISOString(),
    folgt_coach: null,
    folgt_coach_at: null,
    letzte_beruehrung_at: null,
    notiz: null,
    created_at: JETZT.toISOString(),
    updated_at: JETZT.toISOString(),
    ...over,
  };
}

const empfehlung: Empfehlung = {
  titel: 'Antworten',
  begruendung: 'Ihre DM-Antwort wartet seit über 24 Stunden.',
  prioritaet: 1,
};

function rendere(over: { lead?: Partial<Lead>; empfehlung?: Empfehlung } = {}) {
  const handler = {
    onAktionAusfuehren: vi.fn(),
    onNotizAendern: vi.fn(),
    onVerknuepfen: vi.fn(),
    onArchivieren: vi.fn(),
  };
  const daten = lead(over.lead);
  render(
    <LeadKarte
      lead={daten}
      score={berechneScore([], JETZT)}
      empfehlung={over.empfehlung ?? empfehlung}
      {...handler}
    />
  );
  return { handler, daten };
}

describe('LeadKarte', () => {
  it('zeigt Name, Handle und Empfehlung', () => {
    rendere();
    expect(screen.getByText('Nora Fischer')).toBeInTheDocument();
    expect(screen.getByText('@nora.wandelt')).toBeInTheDocument();
    expect(screen.getByText('Ihre DM-Antwort wartet seit über 24 Stunden.')).toBeInTheDocument();
  });

  it('bietet das Verknüpfen an, solange kein Handle hinterlegt ist', async () => {
    const { handler, daten } = rendere({ lead: { instagram_handle: null } });
    await userEvent.click(screen.getByRole('button', { name: 'Instagram verknüpfen' }));
    expect(handler.onVerknuepfen).toHaveBeenCalledWith(daten);
  });

  it('archiviert auf Klick', async () => {
    const { handler, daten } = rendere();
    await userEvent.click(screen.getByRole('button', { name: 'Archivieren' }));
    expect(handler.onArchivieren).toHaveBeenCalledWith(daten);
  });

  it('verspricht bei der Archivieren-Empfehlung keinen Kontakt', async () => {
    // Der Haupt-Knopf trägt sonst den Empfehlungstitel. Hier wäre
    // "Archivieren oder letzter Impuls" als Kontaktaktion irreführend.
    rendere({
      empfehlung: {
        titel: 'Archivieren oder letzter Impuls',
        begruendung: 'Über 21 Tage keine Reaktion.',
        prioritaet: 3,
      },
    });
    expect(screen.getByRole('button', { name: 'Letzter Impuls' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Archivieren oder letzter Impuls' })
    ).not.toBeInTheDocument();
  });

  it('meldet eine geänderte Notiz erst beim Verlassen des Feldes', async () => {
    const { handler, daten } = rendere();
    const feld = screen.getByPlaceholderText('Notiz zu dieser Beziehung…');

    await userEvent.type(feld, 'Mag Atemübungen');
    expect(handler.onNotizAendern).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(handler.onNotizAendern).toHaveBeenCalledWith(daten, 'Mag Atemübungen');
  });

  it('zeigt den Follow-Status nur, wenn er bekannt ist', () => {
    rendere({ lead: { folgt_coach: null } });
    expect(screen.queryByText(/Folgt dir/)).not.toBeInTheDocument();
  });

  it('zeigt "Folgt dir", wenn der Status bekannt ist', () => {
    rendere({ lead: { folgt_coach: true } });
    expect(screen.getByText('Folgt dir')).toBeInTheDocument();
  });

  it('begründet eine warme Stufe mit den stärksten Signalen', () => {
    const score = berechneScore(
      [
        { id: 'a', typ: 'erstgespraech', gewicht: 40, occurredAt: JETZT },
        { id: 'b', typ: 'dm_antwort', gewicht: 15, occurredAt: JETZT },
      ],
      JETZT
    );
    render(
      <LeadKarte
        lead={lead()}
        score={score}
        empfehlung={ermittleNaechsteAktion({
          stufe: score.stufe,
          trend: score.trend,
          letzteInteraktionAt: score.letzteInteraktionAt,
          letzterInteraktionsTyp: 'dm_antwort',
          jetzt: JETZT,
        })}
        onAktionAusfuehren={vi.fn()}
        onNotizAendern={vi.fn()}
        onVerknuepfen={vi.fn()}
        onArchivieren={vi.fn()}
      />
    );
    expect(screen.getByText('warm')).toBeInTheDocument();
    expect(screen.getByText(/Erstgespräch/)).toBeInTheDocument();
  });
});

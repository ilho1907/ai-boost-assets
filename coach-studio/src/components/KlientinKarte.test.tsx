import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { KlientinKarte } from './KlientinKarte';
import { ermittleBetreuung } from '../lib/scoring';
import type { Lead } from '../types/leadRadar';

const JETZT = new Date('2026-09-16T12:00:00Z');
const tageHer = (t: number) => new Date(JETZT.getTime() - t * 24 * 60 * 60 * 1000);

function klientin(over: Partial<Lead> = {}): Lead {
  return {
    id: 'k1',
    coach_id: 'c1',
    name: 'Bettina Hoff',
    instagram_handle: 'bettina.hoff',
    instagram_scoped_id: null,
    quelle: 'empfehlung',
    status: 'client',
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

function rendere(letzteBeruehrungAt: Date | null, over: Partial<Lead> = {}) {
  const handler = { onAktionAusfuehren: vi.fn(), onNotizAendern: vi.fn() };
  const daten = klientin({
    letzte_beruehrung_at: letzteBeruehrungAt?.toISOString() ?? null,
    ...over,
  });
  render(
    <KlientinKarte
      lead={daten}
      betreuung={ermittleBetreuung({ letzteBeruehrungAt, jetzt: JETZT })}
      {...handler}
    />
  );
  return { handler, daten };
}

describe('KlientinKarte', () => {
  it('zeigt keine Interesse-Stufe und keinen Score', () => {
    // Eine Klientin hat sich entschieden; sie nach Interesse zu bewerten
    // wäre die falsche Frage.
    rendere(tageHer(3));
    expect(screen.queryByText(/Score/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lauwarm|warm|kalt/)).not.toBeInTheDocument();
  });

  it('meldet eine lange stille Begleitung deutlich', () => {
    rendere(tageHer(38));
    // Grossschreibung macht die CSS; im DOM steht die Beschriftung wie gesetzt.
    expect(screen.getByText('Lange still')).toBeInTheDocument();
    expect(screen.getByText('Letzter Kontakt vor 38 Tagen')).toBeInTheDocument();
    expect(screen.getByText('Persönlich nachfragen')).toBeInTheDocument();
  });

  it('lässt frischen Kontakt in Ruhe', () => {
    rendere(tageHer(2));
    expect(screen.getByText('Im Fluss')).toBeInTheDocument();
    expect(screen.getByText('Alles im Fluss')).toBeInTheDocument();
  });

  it('führt eine Klientin ohne festgehaltenen Kontakt ans Ankommen heran', () => {
    rendere(null);
    expect(screen.getByText('Noch kein Kontakt festgehalten')).toBeInTheDocument();
    expect(screen.getByText('Ankommen begleiten')).toBeInTheDocument();
  });

  it('vermerkt Kontakt auf Klick', async () => {
    const { handler, daten } = rendere(tageHer(20));
    await userEvent.click(screen.getByRole('button', { name: 'Kontakt vermerken' }));
    expect(handler.onAktionAusfuehren).toHaveBeenCalledWith(daten);
  });

  it('kommt ohne hinterlegten Instagram-Handle aus', () => {
    rendere(tageHer(5), { instagram_handle: null });
    expect(screen.getByText('Bettina Hoff')).toBeInTheDocument();
    expect(screen.queryByText(/^@/)).not.toBeInTheDocument();
  });
});

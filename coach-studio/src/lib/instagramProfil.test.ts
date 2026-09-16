import { describe, expect, it } from 'vitest';
import {
  baueFollowStatusUpdate,
  folgtStatusLabel,
  leseFollowStatus,
  profilAbrufUrl,
} from './instagramProfil';

const JETZT = new Date('2026-08-29T10:00:00Z');

describe('leseFollowStatus', () => {
  it('liest true aus is_user_follow_business', () => {
    const ergebnis = leseFollowStatus({ is_user_follow_business: true }, JETZT);
    expect(ergebnis.folgtCoach).toBe(true);
    expect(ergebnis.ermitteltAt).toEqual(JETZT);
  });

  it('liest false aus is_user_follow_business', () => {
    expect(leseFollowStatus({ is_user_follow_business: false }, JETZT).folgtCoach).toBe(false);
  });

  it('bleibt "unbekannt", wenn Meta das Feld nicht liefert', () => {
    expect(leseFollowStatus({ username: 'nora' }, JETZT).folgtCoach).toBeNull();
  });

  it('bleibt "unbekannt" bei fehlender Antwort', () => {
    expect(leseFollowStatus(null, JETZT).folgtCoach).toBeNull();
    expect(leseFollowStatus(undefined, JETZT).folgtCoach).toBeNull();
  });
});

describe('baueFollowStatusUpdate', () => {
  it('erzeugt ein Update bei vorhandener Einwilligung', () => {
    const update = baueFollowStatusUpdate(leseFollowStatus({ is_user_follow_business: true }, JETZT), true);
    expect(update).toEqual({
      folgt_coach: true,
      folgt_coach_at: JETZT.toISOString(),
    });
  });

  it('verwirft den Status ohne Einwilligung', () => {
    const update = baueFollowStatusUpdate(
      leseFollowStatus({ is_user_follow_business: true }, JETZT),
      false
    );
    expect(update).toBeNull();
  });

  it('schreibt nichts, wenn der Status unbekannt ist', () => {
    expect(baueFollowStatusUpdate(leseFollowStatus({}, JETZT), true)).toBeNull();
  });
});

describe('folgtStatusLabel', () => {
  it('beschriftet alle drei Zustände', () => {
    expect(folgtStatusLabel(true)).toBe('Folgt dir');
    expect(folgtStatusLabel(false)).toBe('Folgt dir nicht');
    expect(folgtStatusLabel(null)).toBe('Folgt-Status unbekannt');
  });
});

describe('profilAbrufUrl', () => {
  it('fragt die Follow-Felder an und kodiert die IGSID', () => {
    const url = profilAbrufUrl('178414/00 99');
    expect(url).toContain('is_user_follow_business');
    expect(url).toContain('is_business_follow_user');
    expect(url).toContain('178414%2F00%2099');
    expect(url).not.toContain(' ');
  });
});

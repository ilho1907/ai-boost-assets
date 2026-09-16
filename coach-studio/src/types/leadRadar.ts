import type { InteraktionsTyp } from '../lib/scoring';

export type LeadQuelle = 'erstgespraech' | 'dm' | 'empfehlung' | 'sonstige';
export type LeadStatus = 'neu' | 'kontaktiert' | 'erstgespraech' | 'warm' | 'client' | 'verloren';

/** Spiegelt die Tabelle public.leads. */
export interface Lead {
  id: string;
  coach_id: string;
  name: string;
  instagram_handle: string | null;
  /** Instagram-Scoped ID, entsteht erst mit der ersten Konversation. */
  instagram_scoped_id: string | null;
  quelle: LeadQuelle;
  status: LeadStatus;
  consent_tracking: boolean;
  consent_at: string | null;
  /** is_user_follow_business; null = unbekannt. Nur mit Einwilligung befüllt. */
  folgt_coach: boolean | null;
  folgt_coach_at: string | null;
  /**
   * Juengste Interaktion in beliebiger Richtung, per Trigger gepflegt.
   * Grundlage der Betreuungsansicht für Klientinnen.
   */
  letzte_beruehrung_at: string | null;
  notiz: string | null;
  created_at: string;
  updated_at: string;
}

/** Spiegelt die Tabelle public.lead_interactions. */
export interface LeadInteractionRow {
  id: string;
  coach_id: string;
  lead_id: string;
  typ: InteraktionsTyp;
  gewicht: number;
  /** eingehend = vom Lead, ausgehend = von der Coachin gesendet. */
  richtung: 'eingehend' | 'ausgehend';
  occurred_at: string;
  quelle: 'instagram' | 'manuell';
  raw_ref: string | null;
  created_at: string;
}

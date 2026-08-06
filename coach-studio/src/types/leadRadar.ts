import type { InteraktionsTyp, Stufe, Trend } from '../lib/scoring';

export type LeadQuelle = 'erstgespraech' | 'dm' | 'empfehlung' | 'sonstige';
export type LeadStatus = 'neu' | 'kontaktiert' | 'erstgespraech' | 'warm' | 'client' | 'verloren';

/** Spiegelt die Tabelle public.leads. */
export interface Lead {
  id: string;
  coach_id: string;
  name: string;
  instagram_handle: string | null;
  quelle: LeadQuelle;
  status: LeadStatus;
  consent_tracking: boolean;
  consent_at: string | null;
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
  occurred_at: string;
  quelle: 'instagram' | 'manuell';
  raw_ref: string | null;
  created_at: string;
}

/** Spiegelt die Tabelle public.lead_scores. */
export interface LeadScoreRow {
  id: string;
  coach_id: string;
  lead_id: string;
  score: number;
  stufe: Stufe;
  trend: Trend;
  letzte_interaktion_at: string | null;
  berechnet_at: string;
}

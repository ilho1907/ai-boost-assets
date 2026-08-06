import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  berechneScore,
  ermittleNaechsteAktion,
  topAktionen,
  type Empfehlung,
  type InteraktionsTyp,
  type ScoreErgebnis,
} from '../lib/scoring';
import type { Lead, LeadInteractionRow } from '../types/leadRadar';
import { LeadKarte } from './LeadKarte';
import { LeadVerknuepfen } from './LeadVerknuepfen';

interface LeadMitAuswertung {
  lead: Lead;
  score: ScoreErgebnis;
  empfehlung: Empfehlung;
}

const SPALTEN: { stufe: ScoreErgebnis['stufe']; titel: string }[] = [
  { stufe: 'warm', titel: 'Warm' },
  { stufe: 'lauwarm', titel: 'Lauwarm' },
  { stufe: 'kalt', titel: 'Kalt' },
];

/**
 * Tagesansicht: alle Leads einer Coachin, gruppiert nach Interesse-Stufe,
 * mit einer "Heute zu tun"-Leiste für die dringendsten Empfehlungen.
 *
 * Scores werden hier live aus den Rohinteraktionen berechnet (reine
 * Funktion aus scoring.ts) statt ausschließlich aus der periodisch
 * vorberechneten lead_scores-Tabelle zu lesen, damit die Ansicht auch nach
 * einer eben erst gespeicherten Interaktion sofort aktuell ist.
 */
export function LeadRadar() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [interaktionenProLead, setInteraktionenProLead] = useState<
    Map<string, LeadInteractionRow[]>
  >(new Map());
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [verknuepfenLead, setVerknuepfenLead] = useState<Lead | null>(null);

  async function neuLaden() {
    setLaedt(true);
    setLadeFehler(null);

    const [{ data: leadDaten, error: leadFehler }, { data: interaktionsDaten, error: intFehler }] =
      await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase
          .from('lead_interactions')
          .select('*')
          .order('occurred_at', { ascending: false }),
      ]);

    if (leadFehler || intFehler) {
      setLadeFehler(
        (leadFehler ?? intFehler)?.message ?? 'Leads konnten nicht geladen werden.'
      );
      setLaedt(false);
      return;
    }

    const gruppiert = new Map<string, LeadInteractionRow[]>();
    for (const zeile of interaktionsDaten ?? []) {
      const liste = gruppiert.get(zeile.lead_id) ?? [];
      liste.push(zeile);
      gruppiert.set(zeile.lead_id, liste);
    }

    setLeads(leadDaten ?? []);
    setInteraktionenProLead(gruppiert);
    setLaedt(false);
  }

  useEffect(() => {
    neuLaden();
  }, []);

  const ausgewertet = useMemo<LeadMitAuswertung[]>(() => {
    const jetzt = new Date();
    return leads.map((lead) => {
      const interaktionen = (interaktionenProLead.get(lead.id) ?? []).map((row) => ({
        id: row.id,
        typ: row.typ,
        gewicht: row.gewicht,
        occurredAt: row.occurred_at,
      }));

      const score = berechneScore(interaktionen, jetzt);

      const letzte = (interaktionenProLead.get(lead.id) ?? [])[0];
      const letzterTyp: InteraktionsTyp | null = letzte?.typ ?? null;

      const empfehlung = ermittleNaechsteAktion({
        stufe: score.stufe,
        trend: score.trend,
        letzteInteraktionAt: score.letzteInteraktionAt,
        letzterInteraktionsTyp: letzterTyp,
        jetzt,
      });

      return { lead, score, empfehlung };
    });
  }, [leads, interaktionenProLead]);

  const heute = useMemo(
    () =>
      topAktionen(
        ausgewertet.map((e) => ({ ...e, score: e.score.score })),
        3
      ),
    [ausgewertet]
  );

  async function aktionAusfuehren(lead: Lead) {
    await supabase
      .from('leads')
      .update({ status: lead.status === 'neu' ? 'kontaktiert' : lead.status })
      .eq('id', lead.id);
    await supabase.from('lead_interactions').insert({
      coach_id: lead.coach_id,
      lead_id: lead.id,
      typ: 'dm_antwort',
      gewicht: 0,
      quelle: 'manuell',
    });
    neuLaden();
  }

  async function notizAendern(lead: Lead, notiz: string) {
    await supabase.from('leads').update({ notiz }).eq('id', lead.id);
  }

  async function verknuepfenSpeichern(aenderungen: {
    instagram_handle: string | null;
    consent_tracking: boolean;
  }) {
    if (!verknuepfenLead) return;
    await supabase.from('leads').update(aenderungen).eq('id', verknuepfenLead.id);
    setVerknuepfenLead(null);
    neuLaden();
  }

  return (
    <div className="cs-root cs-lead-radar">
      <header className="cs-lead-radar__header">
        <h1 className="cs-heading cs-lead-radar__title">Lead-Radar</h1>
        <p className="cs-lead-radar__subtitle">
          Wer ist warm, wem schreibst du heute? Basierend auf Interaktionen mit deinem eigenen
          Instagram-Konto.
        </p>
      </header>

      {ladeFehler && <p role="alert">{ladeFehler}</p>}
      {laedt && <p>Lädt…</p>}

      {!laedt && !ladeFehler && (
        <>
          <section className="cs-today-bar">
            <h2 className="cs-today-bar__title">Heute zu tun</h2>
            <div className="cs-today-bar__items">
              {heute.length === 0 && (
                <p className="cs-column__empty">Keine dringenden Aktionen – schöner Tag.</p>
              )}
              {heute.map(({ lead, empfehlung }) => (
                <div className="cs-today-bar__item" key={lead.id}>
                  <strong>{lead.name}</strong>
                  {empfehlung.titel} — {empfehlung.begruendung}
                </div>
              ))}
            </div>
          </section>

          <div className="cs-columns">
            {SPALTEN.map(({ stufe, titel }) => {
              const eintraege = ausgewertet
                .filter((e) => e.score.stufe === stufe)
                .sort((a, b) => a.empfehlung.prioritaet - b.empfehlung.prioritaet);

              return (
                <section className={`cs-column cs-column--${stufe}`} key={stufe}>
                  <h2 className="cs-column__title">
                    {titel} <span className="cs-column__count">({eintraege.length})</span>
                  </h2>
                  <div className="cs-column__list">
                    {eintraege.length === 0 && (
                      <p className="cs-column__empty">Keine Leads in dieser Stufe.</p>
                    )}
                    {eintraege.map(({ lead, score, empfehlung }) => (
                      <LeadKarte
                        key={lead.id}
                        lead={lead}
                        score={score}
                        empfehlung={empfehlung}
                        onAktionAusfuehren={aktionAusfuehren}
                        onNotizAendern={notizAendern}
                        onVerknuepfen={setVerknuepfenLead}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      {verknuepfenLead && (
        <LeadVerknuepfen
          lead={verknuepfenLead}
          onSchliessen={() => setVerknuepfenLead(null)}
          onSpeichern={verknuepfenSpeichern}
        />
      )}
    </div>
  );
}

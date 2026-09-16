import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import {
  berechneScore,
  ermittleBetreuung,
  ermittleNaechsteAktion,
  topAktionen,
  RELEVANZ_FENSTER_TAGE,
  type BetreuungsErgebnis,
  type Empfehlung,
  type InteraktionsTyp,
  type ScoreErgebnis,
} from '../lib/scoring';
import { ladeAlleSeiten, vorTagen } from '../lib/supabaseAbfragen';
import type { Lead, LeadInteractionRow, LeadQuelle } from '../types/leadRadar';
import { KlientinKarte } from './KlientinKarte';
import { LeadAnlegen } from './LeadAnlegen';
import { LeadKarte } from './LeadKarte';
import { LeadVerknuepfen } from './LeadVerknuepfen';

interface LeadMitAuswertung {
  lead: Lead;
  score: ScoreErgebnis;
  empfehlung: Empfehlung;
}

interface KlientinMitBetreuung {
  lead: Lead;
  betreuung: BetreuungsErgebnis;
}

const SPALTEN: { stufe: ScoreErgebnis['stufe']; titel: string }[] = [
  { stufe: 'warm', titel: 'Warm' },
  { stufe: 'lauwarm', titel: 'Lauwarm' },
  { stufe: 'kalt', titel: 'Kalt' },
];

/**
 * Tagesansicht der Coachin.
 *
 * Interessentinnen werden nach Interesse-Stufe triagiert; Klientinnen stehen
 * bewusst daneben statt mittendrin: wer bereits gebucht hat, lässt sich nicht
 * sinnvoll danach sortieren, wie interessiert sie wirkt. Für sie zählt, wie es
 * um die Begleitung steht.
 *
 * Scores werden live aus den Rohinteraktionen berechnet (reine Funktion aus
 * scoring.ts), damit die Ansicht auch nach einer eben gespeicherten
 * Interaktion sofort stimmt.
 */
export function LeadRadar({ session }: { session: Session }) {
  const coachId = session.user.id;
  const [leads, setLeads] = useState<Lead[]>([]);
  const [interaktionenProLead, setInteraktionenProLead] = useState<
    Map<string, LeadInteractionRow[]>
  >(new Map());
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [schreibFehler, setSchreibFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [verknuepfenLead, setVerknuepfenLead] = useState<Lead | null>(null);
  const [legtAn, setLegtAn] = useState(false);

  async function neuLaden() {
    setLaedt(true);
    setLadeFehler(null);

    // Beide Abfragen blättern über alle Seiten: PostgREST kappt sonst
    // stillschweigend bei 1000 Zeilen, und fehlende Interaktionen ergäben
    // keinen Fehler, sondern einen zu niedrigen Score.
    const [leadErgebnis, interaktionsErgebnis] = await Promise.all([
      ladeAlleSeiten<Lead>((von, bis) =>
        supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .range(von, bis)
      ),
      ladeAlleSeiten<LeadInteractionRow>((von, bis) =>
        supabase
          .from('lead_interactions')
          .select('*')
          // Ältere Signale sind so weit abgeklungen, dass sie den gerundeten
          // Score nicht mehr bewegen — siehe RELEVANZ_FENSTER_TAGE.
          .gte('occurred_at', vorTagen(RELEVANZ_FENSTER_TAGE))
          .order('occurred_at', { ascending: false })
          .range(von, bis)
      ),
    ]);

    if (leadErgebnis.fehler || interaktionsErgebnis.fehler) {
      setLadeFehler(
        leadErgebnis.fehler ??
          interaktionsErgebnis.fehler ??
          'Leads konnten nicht geladen werden.'
      );
      setLaedt(false);
      return;
    }

    const gruppiert = new Map<string, LeadInteractionRow[]>();
    for (const zeile of interaktionsErgebnis.daten) {
      const liste = gruppiert.get(zeile.lead_id) ?? [];
      liste.push(zeile);
      gruppiert.set(zeile.lead_id, liste);
    }

    setLeads(leadErgebnis.daten);
    setInteraktionenProLead(gruppiert);
    setLaedt(false);
  }

  useEffect(() => {
    neuLaden();
  }, []);

  /** Interessentinnen — alles außer bereits gebuchten Klientinnen. */
  const interessentinnen = useMemo(() => leads.filter((l) => l.status !== 'client'), [leads]);
  const klientinnenRoh = useMemo(() => leads.filter((l) => l.status === 'client'), [leads]);

  const ausgewertet = useMemo<LeadMitAuswertung[]>(() => {
    const jetzt = new Date();
    return interessentinnen.map((lead) => {
      // Zeilen kommen nach occurred_at absteigend aus der Abfrage.
      const alle = interaktionenProLead.get(lead.id) ?? [];
      const eingehend = alle.filter((row) => row.richtung !== 'ausgehend');
      const ausgehend = alle.filter((row) => row.richtung === 'ausgehend');

      // Nur eingehende Signale zählen zum Score — er misst das Interesse des
      // Leads, nicht die Aktivität der Coachin.
      const score = berechneScore(
        eingehend.map((row) => ({
          id: row.id,
          typ: row.typ,
          gewicht: row.gewicht,
          occurredAt: row.occurred_at,
        })),
        jetzt
      );

      const letzterTyp: InteraktionsTyp | null = eingehend[0]?.typ ?? null;
      const letzteAntwortAt = ausgehend[0] ? new Date(ausgehend[0].occurred_at) : null;

      const empfehlung = ermittleNaechsteAktion({
        stufe: score.stufe,
        trend: score.trend,
        letzteInteraktionAt: score.letzteInteraktionAt,
        letzterInteraktionsTyp: letzterTyp,
        letzteAntwortAt,
        folgtCoach: lead.folgt_coach,
        jetzt,
      });

      return { lead, score, empfehlung };
    });
  }, [interessentinnen, interaktionenProLead]);

  const klientinnen = useMemo<KlientinMitBetreuung[]>(() => {
    const jetzt = new Date();
    return klientinnenRoh
      .map((lead) => ({
        lead,
        betreuung: ermittleBetreuung({
          letzteBeruehrungAt: lead.letzte_beruehrung_at
            ? new Date(lead.letzte_beruehrung_at)
            : null,
          jetzt,
        }),
      }))
      .sort((a, b) => a.betreuung.empfehlung.prioritaet - b.betreuung.empfehlung.prioritaet);
  }, [klientinnenRoh]);

  // Klientinnen stehen in der "Heute zu tun"-Leiste gleichberechtigt neben
  // Interessentinnen: eine Begleitung, die einschläft, wiegt schwerer als ein
  // lauwarmer Lead. Ohne Score rangieren sie bei gleicher Priorität hinten.
  const heute = useMemo(
    () =>
      topAktionen(
        [
          ...ausgewertet.map((e) => ({
            lead: e.lead,
            empfehlung: e.empfehlung,
            score: e.score.score,
          })),
          ...klientinnen.map((k) => ({
            lead: k.lead,
            empfehlung: k.betreuung.empfehlung,
            score: 0,
          })),
        ],
        3
      ),
    [ausgewertet, klientinnen]
  );

  async function aktionAusfuehren(lead: Lead) {
    setSchreibFehler(null);

    const { error: statusFehler } = await supabase
      .from('leads')
      .update({ status: lead.status === 'neu' ? 'kontaktiert' : lead.status })
      .eq('id', lead.id);

    if (statusFehler) {
      setSchreibFehler(`Status konnte nicht aktualisiert werden: ${statusFehler.message}`);
      return;
    }

    // Ausgehende Interaktion: beendet den Wartezustand, zählt nicht zum Score.
    const { error: interaktionsFehler } = await supabase.from('lead_interactions').insert({
      coach_id: coachId,
      lead_id: lead.id,
      typ: 'dm_antwort',
      richtung: 'ausgehend',
      quelle: 'manuell',
    });

    if (interaktionsFehler) {
      setSchreibFehler(
        `Die Aktion wurde nicht vermerkt: ${interaktionsFehler.message}`
      );
      return;
    }
    neuLaden();
  }

  async function notizAendern(lead: Lead, notiz: string) {
    setSchreibFehler(null);
    const { error } = await supabase.from('leads').update({ notiz }).eq('id', lead.id);
    if (error) {
      // Ohne diese Meldung hielte die Coachin die Notiz für gespeichert.
      setSchreibFehler(`Notiz zu ${lead.name} wurde nicht gespeichert: ${error.message}`);
    }
  }

  async function leadAnlegen(neu: {
    name: string;
    instagram_handle: string | null;
    quelle: LeadQuelle;
    notiz: string | null;
  }): Promise<string | null> {
    const { error } = await supabase.from('leads').insert({ ...neu, coach_id: coachId });
    if (error) return `Konnte nicht angelegt werden: ${error.message}`;
    await neuLaden();
    return null;
  }

  async function verknuepfenSpeichern(aenderungen: {
    instagram_handle: string | null;
    consent_tracking: boolean;
  }) {
    if (!verknuepfenLead) return;
    setSchreibFehler(null);

    const { error } = await supabase
      .from('leads')
      .update(aenderungen)
      .eq('id', verknuepfenLead.id);

    if (error) {
      setSchreibFehler(`Verknüpfung nicht gespeichert: ${error.message}`);
      return;
    }
    setVerknuepfenLead(null);
    neuLaden();
  }

  return (
    <div className="cs-root cs-lead-radar">
      <header className="cs-lead-radar__header">
        <div className="cs-lead-radar__kopfzeile">
          <div>
            <h1 className="cs-heading cs-lead-radar__title">Lead-Radar</h1>
            <p className="cs-lead-radar__subtitle">
              Wer ist warm, wem schreibst du heute? Basierend auf Interaktionen mit deinem eigenen
              Instagram-Konto.
            </p>
          </div>
          <div className="cs-lead-radar__konto">
            <span>{session.user.email}</span>
            <button type="button" className="cs-btn cs-btn--primary" onClick={() => setLegtAn(true)}>
              Neue Interessentin
            </button>
            <button
              type="button"
              className="cs-btn cs-btn--ghost"
              onClick={() => supabase.auth.signOut()}
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      {ladeFehler && (
        <p className="cs-fehler" role="alert">
          {ladeFehler}
        </p>
      )}
      {schreibFehler && (
        <p className="cs-fehler" role="alert">
          {schreibFehler}{' '}
          <button
            type="button"
            className="cs-fehler__schliessen"
            onClick={() => setSchreibFehler(null)}
          >
            ausblenden
          </button>
        </p>
      )}
      {laedt && <p>Lädt…</p>}

      {!laedt && !ladeFehler && leads.length === 0 && (
        <section className="cs-leer">
          <h2 className="cs-heading cs-leer__titel">Noch niemand im Radar</h2>
          <p className="cs-leer__text">
            Lege deine erste Interessentin an — den Rest baut Lead-Radar nach und nach aus ihren
            Interaktionen mit deinem Instagram-Konto auf.
          </p>
          <button type="button" className="cs-btn cs-btn--primary" onClick={() => setLegtAn(true)}>
            Erste Interessentin anlegen
          </button>
        </section>
      )}

      {!laedt && !ladeFehler && leads.length > 0 && (
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

          {klientinnen.length > 0 && (
            <section className="cs-klientinnen">
              <div className="cs-klientinnen__kopf">
                <h2 className="cs-heading cs-klientinnen__titel">Deine Klientinnen</h2>
                <p className="cs-klientinnen__text">
                  Hier zählt nicht das Interesse, sondern die Begleitung — wann war zuletzt
                  Kontakt?
                </p>
              </div>
              <div className="cs-klientinnen__liste">
                {klientinnen.map(({ lead, betreuung }) => (
                  <KlientinKarte
                    key={lead.id}
                    lead={lead}
                    betreuung={betreuung}
                    onAktionAusfuehren={aktionAusfuehren}
                    onNotizAendern={notizAendern}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {legtAn && <LeadAnlegen onSchliessen={() => setLegtAn(false)} onAnlegen={leadAnlegen} />}

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

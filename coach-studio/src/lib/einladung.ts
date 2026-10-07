/**
 * Einladungs-Token: Extraktion und Zwischenspeicherung.
 *
 * Der Magic-Link-Redirect von Supabase geht auf eine feste `emailRedirectTo`-
 * URL — ein `?einladung=...`-Parameter, den die Coachin beim ersten Klick auf
 * den Einladungslink mitbrachte, wäre nach dem Anmelde-Umweg sonst verloren.
 * Deshalb wird der Token beim ersten Sichten in sessionStorage geparkt.
 *
 * Die reine Extraktion ist von der Speicherung getrennt, damit sie ohne DOM
 * testbar bleibt.
 */

const SPEICHER_SCHLUESSEL = 'cs-ausstehende-einladung';

/** Liest `einladung` aus einem Query-String wie `location.search`. */
export function extrahiereEinladungsToken(suchstring: string): string | null {
  const params = new URLSearchParams(suchstring);
  const wert = params.get('einladung');
  return wert && wert.trim() ? wert.trim() : null;
}

/**
 * Erlaubt sowohl das Einfügen eines nackten Tokens als auch einer ganzen
 * Einladungs-URL — Coachinnen kopieren oft die ganze Zeile aus der E-Mail.
 */
export function extrahiereTokenAusEingabe(eingabe: string): string {
  const bereinigt = eingabe.trim();
  if (bereinigt.includes('?') || bereinigt.includes('=')) {
    const perParam = extrahiereEinladungsToken(
      bereinigt.includes('?') ? bereinigt.slice(bereinigt.indexOf('?')) : `?einladung=${bereinigt}`
    );
    if (perParam) return perParam;
  }
  return bereinigt;
}

export function einladungMerken(token: string): void {
  sessionStorage.setItem(SPEICHER_SCHLUESSEL, token);
}

export function gemerkteEinladungLesen(): string | null {
  return sessionStorage.getItem(SPEICHER_SCHLUESSEL);
}

export function gemerkteEinladungLoeschen(): void {
  sessionStorage.removeItem(SPEICHER_SCHLUESSEL);
}

/**
 * PostgREST liefert pro Anfrage höchstens eine begrenzte Zahl Zeilen
 * (Supabase-Standard: 1000) — und zwar ohne Fehler. Eine Abfrage ohne
 * ausdrückliche Paginierung schneidet also stillschweigend ab. Für den
 * Lead-Radar wäre das besonders tückisch: fehlende Interaktionen ergeben
 * keinen Fehler, sondern einen zu niedrigen Score.
 *
 * Diese Funktion blättert deshalb, bis eine Seite nicht mehr voll ist.
 */

const SEITENGROESSE = 1000;

/**
 * Nur das, was hier wirklich gebraucht wird: etwas Awaitbares, das Daten oder
 * einen Fehler liefert. Bewusst kein `PostgrestFilterBuilder`-Typ — dessen
 * Generics unterscheiden sich zwischen postgrest-js-Versionen und würden die
 * Hilfsfunktion an eine Version koppeln.
 */
export interface AbfrageAntwort<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function ladeAlleSeiten<T>(
  abfrageBauen: (von: number, bis: number) => PromiseLike<AbfrageAntwort<T>>
): Promise<{ daten: T[]; fehler: string | null }> {
  const alle: T[] = [];

  for (let seite = 0; ; seite++) {
    const von = seite * SEITENGROESSE;
    const { data, error } = await abfrageBauen(von, von + SEITENGROESSE - 1);

    if (error) return { daten: alle, fehler: error.message };
    if (!data || data.length === 0) break;

    alle.push(...data);
    if (data.length < SEITENGROESSE) break;
  }

  return { daten: alle, fehler: null };
}

/** ISO-Zeitstempel vor `tage` Tagen — für zeitlich begrenzte Abfragen. */
export function vorTagen(tage: number, jetzt: Date = new Date()): string {
  return new Date(jetzt.getTime() - tage * 24 * 60 * 60 * 1000).toISOString();
}

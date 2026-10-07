import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Ob überhaupt Zugangsdaten hinterlegt sind. Fehlen sie, zeigt der AuthGate
 * einen erklärenden Hinweis statt einer leeren Seite.
 */
export const istSupabaseKonfiguriert = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'anon');

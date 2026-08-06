import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    'Lead-Radar: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen. Siehe coach-studio/README.md.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '');

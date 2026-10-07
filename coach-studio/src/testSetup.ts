import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Ohne `globals: true` hängt sich Testing Library nicht selbst ein, und
// gerenderte Bäume blieben zwischen Tests stehen — Abfragen fänden dann
// mehrere Treffer statt einem.
afterEach(cleanup);

import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './components/AuthGate';
import { HeuteAnsicht } from './components/HeuteAnsicht';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>{(session) => <HeuteAnsicht session={session} />}</AuthGate>
  </React.StrictMode>
);

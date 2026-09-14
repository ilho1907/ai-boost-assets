import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthGate } from './components/AuthGate';
import { LeadRadar } from './components/LeadRadar';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>{(session) => <LeadRadar session={session} />}</AuthGate>
  </React.StrictMode>
);

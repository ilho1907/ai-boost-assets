import React from 'react';
import ReactDOM from 'react-dom/client';
import { LeadRadar } from './components/LeadRadar';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LeadRadar />
  </React.StrictMode>
);

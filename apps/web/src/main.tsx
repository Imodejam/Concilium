import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App.js';
import DecisionsListPage from './pages/DecisionsListPage.js';
import DecisionDetailPage from './pages/DecisionDetailPage.js';
import NewRequestPage from './pages/NewRequestPage.js';
import ConfigurationPage from './pages/ConfigurationPage.js';
import LiveDeliberationPage from './pages/LiveDeliberationPage.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App>
        <Routes>
          <Route path="/" element={<Navigate to="/decisions" replace />} />
          <Route path="/decisions" element={<DecisionsListPage />} />
          <Route path="/decisions/:id" element={<DecisionDetailPage />} />
          <Route path="/requests/new" element={<NewRequestPage />} />
          <Route path="/requests/:id/live" element={<LiveDeliberationPage />} />
          <Route path="/configuration" element={<ConfigurationPage />} />
        </Routes>
      </App>
    </BrowserRouter>
  </React.StrictMode>,
);

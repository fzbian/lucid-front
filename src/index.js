import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { NotificationsProvider } from './components/Notifications';
import { BrowserRouter } from 'react-router-dom';
import { applyTheme } from './theme';

// Inicializa tema (usa preferencia guardada o del sistema)
applyTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <NotificationsProvider>
        <App />
      </NotificationsProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// Métricas opcionales eliminadas para aligerar el bundle.

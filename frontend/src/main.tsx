import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.tsx'
import { ErrorFallback } from './components/ErrorFallback'
import './index.css'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    environment: import.meta.env.MODE,
  });
}

// dev-logs integration
if (import.meta.env.DEV) {
  fetch('http://localhost:4445/overlay.js', { method: 'HEAD', mode: 'no-cors' })
    .then(() => {
      const s = document.createElement('script');
      s.src = 'http://localhost:4445/overlay.js';
      document.head.appendChild(s);
    })
    .catch(() => {
      // Quietly ignore if dev-logs server is not running
    });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
)

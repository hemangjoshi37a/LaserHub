/**
 * Unobtrusive notification permission prompt.
 *
 * Shown to logged-in users who have not yet been asked for notification
 * permission and who have not previously dismissed the banner. Appears
 * only after the user has been on the site for a short delay so it
 * doesn't interrupt the initial page load.
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  isNotificationSupported,
  isPushSupported,
  subscribeToPush,
} from '../services/notifications';

const DISMISSED_KEY = 'laserhub-notifications-dismissed';
const SHOW_DELAY_MS = 10_000;

/**
 * Register the service worker so push events can be received. vite-plugin-pwa
 * (injectManifest) emits the SW to `/sw.js` from src/sw.ts; we register it
 * manually here rather than in App.tsx (owned by another agent). Registration
 * is required for `subscribeToPush()` — it awaits `serviceWorker.ready`, which
 * never resolves unless something registers the worker.
 *
 * Idempotent: registering an already-registered scope resolves with the
 * existing registration.
 */
async function ensureServiceWorkerRegistered(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const base = import.meta.env.BASE_URL || '/';
    // In dev, vite-plugin-pwa (devOptions.enabled) serves the worker at
    // `/dev-sw.js?dev-sw` as an ES module; the production build emits `/sw.js`.
    const swUrl = import.meta.env.DEV ? `${base}dev-sw.js?dev-sw` : `${base}sw.js`;
    await navigator.serviceWorker.register(swUrl, { type: 'module' });
  } catch (err) {
    console.warn('[LaserHub] Service worker registration failed:', err);
  }
}

export function NotificationPrompt() {
  const { isAuthenticated } = useAuthStore();
  const [visible, setVisible] = useState(false);

  // Register the SW once a user is logged in so push delivery works, and
  // re-sync the backend subscription if permission was already granted
  // (e.g. on a new device or after clearing site data).
  useEffect(() => {
    if (!isAuthenticated || !isPushSupported()) return;

    let cancelled = false;
    (async () => {
      await ensureServiceWorkerRegistered();
      if (!cancelled && Notification.permission === 'granted') {
        await subscribeToPush();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !isNotificationSupported() ||
      Notification.permission !== 'default' ||
      localStorage.getItem(DISMISSED_KEY) === 'true'
    ) {
      setVisible(false);
      return;
    }

    // Delay showing the banner so it doesn't interrupt the first view.
    const timer = window.setTimeout(() => {
      setVisible(true);
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  if (!visible) return null;

  const handleEnable = async () => {
    setVisible(false);
    await subscribeToPush();
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true');
    setVisible(false);
  };

  return (
    <div className="notification-prompt" role="banner" aria-live="polite">
      <span className="notification-prompt-icon" aria-hidden="true">🔔</span>
      <span className="notification-prompt-text">
        Get notified about your order updates
      </span>
      <div className="notification-prompt-actions">
        <button
          className="btn btn-sm btn-primary"
          onClick={handleEnable}
          aria-label="Enable order notifications"
        >
          Enable
        </button>
      </div>
      <button
        type="button"
        className="notification-prompt-close"
        onClick={handleDismiss}
        aria-label="Dismiss notification prompt"
      >
        <X size={16} />
      </button>
    </div>
  );
}

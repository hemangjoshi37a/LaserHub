import React, { useEffect, useCallback, useRef } from 'react';
import { authApi } from '../services';
import { toast } from 'sonner';

interface GoogleLoginProps {
  onSuccess: (data: { access_token: string; user: any }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
          renderButton: (element: HTMLElement, config: any) => void;
        };
      };
    };
  }
}

// Track script loading globally to avoid duplicates
let gsiScriptLoaded = false;
let gsiScriptPromise: Promise<void> | null = null;

function loadGsiScript(): Promise<void> {
  if (gsiScriptPromise) return gsiScriptPromise;
  if (window.google?.accounts?.id) {
    gsiScriptLoaded = true;
    return Promise.resolve();
  }
  gsiScriptPromise = new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => { gsiScriptLoaded = true; resolve(); });
      if (gsiScriptLoaded) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gsiScriptLoaded = true; resolve(); };
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

// Track initialization to avoid "already called initialize" warnings
let isGsiInitialized = false;

export const GoogleLogin: React.FC<GoogleLoginProps> = ({ onSuccess }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleCredentialResponse = useCallback(async (response: any) => {
    try {
      const data = await authApi.googleLogin(response.credential);
      toast.success('Signed in with Google!');
      onSuccess(data);
    } catch (error: any) {
      toast.error('Google sign-in failed', {
        description: error.response?.data?.detail || 'Please try again',
      });
    }
  }, [onSuccess]);

  useEffect(() => {
    if (!clientId) return;

    loadGsiScript().then(() => {
      if (!window.google || !buttonRef.current) return;

      if (!(window as any).__gsi_initialized) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
        });
        (window as any).__gsi_initialized = true;
      }

      // Clear previous render
      buttonRef.current.innerHTML = '';

      const width = Math.min(
        400,
        Math.max(240, buttonRef.current.offsetWidth || 360)
      );
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'center',
        width,
      });
    });
  }, [clientId, handleCredentialResponse]);

  if (!clientId) return (
    <div className="google-login">
      <div className="divider"><span>or</span></div>
      <div className="google-btn-placeholder">
        <span>Google Sign-In not configured — add <code>VITE_GOOGLE_CLIENT_ID</code> to frontend/.env</span>
      </div>
    </div>
  );

  return (
    <div className="google-login">
      <div className="divider">
        <span>or</span>
      </div>
      <div ref={buttonRef} className="google-btn-container"></div>
    </div>
  );
};

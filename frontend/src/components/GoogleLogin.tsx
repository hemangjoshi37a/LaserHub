import React, { useEffect, useCallback } from 'react';
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

export const GoogleLogin: React.FC<GoogleLoginProps> = ({ onSuccess }) => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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

    // Load Google Identity Services script
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: true,  // Auto-select if only one account
        });

        // Show One Tap prompt
        window.google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            // One Tap not shown, button will be the fallback
          }
        });

        // Render button as fallback
        const buttonDiv = document.getElementById('google-signin-button');
        if (buttonDiv) {
          window.google.accounts.id.renderButton(buttonDiv, {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signin_with',
            shape: 'rectangular',
          });
        }
      }
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, [clientId, handleCredentialResponse]);

  if (!clientId) return null;

  return (
    <div className="google-login">
      <div className="divider">
        <span>or</span>
      </div>
      <div id="google-signin-button" className="google-btn-container"></div>
    </div>
  );
};

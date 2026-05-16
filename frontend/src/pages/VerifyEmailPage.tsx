import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { authApi } from '../services';
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const VerifyEmailPage: React.FC = () => {
  useDocumentTitle('Verify Email — LaserHub');
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const token = searchParams.get('token');

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus('error');
        return;
      }
      try {
        await authApi.verifyEmail(token);
        setStatus('success');
      } catch (error) {
        setStatus('error');
      }
    };
    verify();
  }, [token]);

  return (
    <div className="lh-auth-shell">
      <div className="lh-auth-bg" aria-hidden />
      <div className="lh-auth-orbs" aria-hidden>
        <span className="lh-auth-orb lh-auth-orb-a" />
        <span className="lh-auth-orb lh-auth-orb-b" />
        <span className="lh-auth-orb lh-auth-orb-c" />
      </div>
      <div className="lh-auth-grid" aria-hidden />

      <main className="lh-auth-form-wrap" style={{ maxWidth: '480px', margin: '0 auto', width: '100%' }}>
        <div className="lh-auth-card text-center py-8">
          <div className="flex justify-center mb-6">
            <Link to="/" className="lh-auth-brand-mark" style={{ display: 'inline-flex', padding: '1rem' }}>
              <Zap size={32} />
            </Link>
          </div>

          {status === 'loading' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <Loader2 className="lh-auth-spin mx-auto text-primary" size={48} />
              <h2 className="text-2xl font-bold mt-6 mb-2">Verifying your email</h2>
              <p className="text-secondary">Please wait while we confirm your address…</p>
            </div>
          )}

          {status === 'success' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success mx-auto mb-6">
                <CheckCircle size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">Email Verified!</h2>
              <p className="text-secondary mb-8">Your email has been successfully verified. You can now access all LaserHub features.</p>
              <Link to="/login" className="lh-auth-submit" style={{ textDecoration: 'none' }}>
                Sign in to your account
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center text-error mx-auto mb-6">
                <XCircle size={32} />
              </div>
              <h2 className="text-2xl font-bold mb-2">Verification Failed</h2>
              <p className="text-secondary mb-8">The verification link is invalid or has expired.</p>
              <div className="flex flex-col gap-4">
                <Link to="/register" className="lh-auth-submit" style={{ textDecoration: 'none' }}>
                  Create a new account
                </Link>
                <Link to="/login" className="text-secondary hover:text-primary transition-colors text-sm">
                  Back to login
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};


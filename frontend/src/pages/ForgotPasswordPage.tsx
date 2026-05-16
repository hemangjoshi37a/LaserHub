import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services';
import { Mail, ArrowLeft, Send, Loader2, CheckCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const ForgotPasswordPage: React.FC = () => {
  useDocumentTitle('Reset Password — LaserHub');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authApi.requestPasswordReset(email);
      setIsSent(true);
      toast.success('Reset link sent if account exists');
    } catch (error) {
      toast.error('Failed to send reset link');
    } finally {
      setIsLoading(false);
    }
  };

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
        <Link to="/" className="lh-auth-mobile-brand" style={{ display: 'flex', marginBottom: '2rem' }}>
          <span className="lh-auth-brand-mark" aria-hidden>
            <Zap size={18} />
          </span>
          <strong>LaserHub</strong>
        </Link>

        <div className="lh-auth-card">
          {isSent ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success">
                  <CheckCircle size={32} />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">Check your email</h2>
              <p className="text-secondary mb-8">
                We've sent a password reset link to <br />
                <strong className="text-primary">{email}</strong>
              </p>
              <Link to="/login" className="lh-auth-submit" style={{ textDecoration: 'none' }}>
                <ArrowLeft size={18} /> Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="lh-auth-card-header">
                <h2>Reset password</h2>
                <p>Enter your email and we'll send you a link to reset your password.</p>
              </div>

              <form onSubmit={handleSubmit} className="lh-auth-form">
                <div className="lh-field">
                  <label htmlFor="email">Email address</label>
                  <div className="lh-field-input">
                    <Mail size={16} className="lh-field-icon" />
                    <input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <button type="submit" className="lh-auth-submit" disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 size={18} className="lh-auth-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                  {isLoading ? 'Sending link…' : 'Send reset link'}
                </button>
              </form>

              <p className="lh-auth-footer">
                Wait, I remember it! <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
};


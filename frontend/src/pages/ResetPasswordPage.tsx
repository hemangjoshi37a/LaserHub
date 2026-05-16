import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { authApi } from '../services';
import { Lock, ArrowLeft, Loader2, Zap, Eye, EyeOff, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const ResetPasswordPage: React.FC = () => {
  useDocumentTitle('Reset Password — LaserHub');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error('Invalid or missing reset token');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    setIsLoading(true);
    try {
      await authApi.confirmPasswordReset(token, password);
      setIsSuccess(true);
      toast.success('Password reset successful');
      setTimeout(() => navigate('/login'), 3000);
    } catch (error) {
      toast.error('Failed to reset password. The link may have expired.');
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
          {isSuccess ? (
            <div className="text-center py-4 animate-in fade-in zoom-in duration-500">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center text-success">
                  <CheckCircle size={32} />
                </div>
              </div>
              <h2 className="text-2xl font-bold mb-2">Password Updated!</h2>
              <p className="text-secondary mb-8">
                Your password has been reset successfully. <br />
                Redirecting you to login in a few seconds…
              </p>
              <Link to="/login" className="lh-auth-submit" style={{ textDecoration: 'none' }}>
                Go to Sign In
              </Link>
            </div>
          ) : (
            <>
              <div className="lh-auth-card-header">
                <h2>Set new password</h2>
                <p>Please enter your new secure password below.</p>
              </div>

              {!token ? (
                <div className="text-center py-4">
                  <p className="text-error mb-4">Invalid or expired reset link.</p>
                  <Link to="/forgot-password" size={18} className="lh-auth-submit" style={{ textDecoration: 'none' }}>
                    Request a new link
                  </Link>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="lh-auth-form">
                  <div className="lh-field">
                    <label htmlFor="password">New Password</label>
                    <div className="lh-field-input">
                      <Lock size={16} className="lh-field-icon" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        className="lh-field-reveal"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="lh-field">
                    <label htmlFor="confirmPassword">Confirm New Password</label>
                    <div className="lh-field-input">
                      <Lock size={16} className="lh-field-icon" />
                      <input
                        id="confirmPassword"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={8}
                      />
                    </div>
                  </div>

                  <button type="submit" className="lh-auth-submit" disabled={isLoading}>
                    {isLoading ? (
                      <Loader2 size={18} className="lh-auth-spin" />
                    ) : (
                      <Lock size={18} />
                    )}
                    {isLoading ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              )}

              <p className="lh-auth-footer">
                Back to <Link to="/login">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../services';
import { Mail, ArrowLeft, Send, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export const ForgotPasswordPage: React.FC = () => {
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

  if (isSent) {
    return (
      <div className="auth-page">
        <div className="auth-card text-center">
          <CheckCircle className="mx-auto text-success" size={64} />
          <h1>Check Your Email</h1>
          <p>We've sent a password reset link to <strong>{email}</strong>.</p>
          <Link to="/login" className="auth-link mt-4 flex items-center justify-center">
            <ArrowLeft size={16} className="mr-2" /> Back to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/login" className="back-link">
          <ArrowLeft size={16} /> Back to Login
        </Link>
        <h1>Reset Password</h1>
        <p>Enter your email and we'll send you a link to reset your password</p>
        
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-with-icon">
              <Mail size={18} />
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
          
          <button type="submit" className="auth-submit" disabled={isLoading}>
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            Send Reset Link
          </button>
        </form>
      </div>
    </div>
  );
};

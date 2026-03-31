import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export const VerifyEmailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const token = searchParams.get('token');
  const navigate = useNavigate();

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
    <div className="auth-page">
      <div className="auth-card text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="animate-spin mx-auto" size={48} />
            <h1>Verifying your email...</h1>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="mx-auto text-success" size={64} />
            <h1>Email Verified!</h1>
            <p>Your email has been successfully verified. You can now log in.</p>
            <Link to="/login" className="auth-submit mt-4">Login</Link>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="mx-auto text-error" size={64} />
            <h1>Verification Failed</h1>
            <p>The verification link is invalid or has expired.</p>
            <Link to="/register" className="auth-submit mt-4">Try Registering Again</Link>
          </>
        )}
      </div>
    </div>
  );
};

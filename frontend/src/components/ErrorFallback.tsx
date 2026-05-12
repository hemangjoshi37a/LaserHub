import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import type { FallbackProps } from 'react-error-boundary';

type ErrorFallbackProps = Partial<FallbackProps>;

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetErrorBoundary }) => {
  const handleReload = () => {
    if (resetErrorBoundary) {
      resetErrorBoundary();
      return;
    }
    window.location.reload();
  };

  const handleGoHome = () => {
    window.location.assign('/');
  };

  return (
    <div className="error-boundary-page">
      <div className="error-card animate-in">
        <div className="error-icon-wrapper">
          <AlertCircle size={48} />
        </div>
        
        <h1>Something went wrong</h1>
        
        <p className="error-message">
          An unexpected error occurred while rendering this page. Our team has been notified.
        </p>

        {error && (
          <div className="error-details">
            <code>{error.message || 'Unknown error'}</code>
          </div>
        )}

        <div className="error-actions">
          <button onClick={handleReload} className="error-btn error-btn--primary">
            <RefreshCw size={18} />
            Try Again
          </button>
          
          <button onClick={handleGoHome} className="error-btn error-btn--secondary">
            <Home size={18} />
            Go to Homepage
          </button>
        </div>

        <div className="error-footer">
          If the problem persists, please <a href="/contact">contact support</a>.
        </div>
      </div>

      <style>{`
        .error-boundary-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          background: var(--bg-secondary);
          font-family: var(--font-main, 'Inter', sans-serif);
        }

        .error-card {
          background: var(--bg-primary);
          padding: 3rem 2rem;
          border-radius: var(--radius-xl, 16px);
          box-shadow: var(--shadow-xl);
          border: 1px solid var(--border-color);
          max-width: 500px;
          width: 100%;
          text-align: center;
        }

        .error-icon-wrapper {
          color: var(--color-danger, #ef4444);
          margin-bottom: 1.5rem;
          display: flex;
          justify-content: center;
        }

        .error-card h1 {
          font-size: 1.75rem;
          font-weight: 800;
          color: var(--text-primary);
          margin-bottom: 1rem;
          letter-spacing: -0.02em;
        }

        .error-message {
          color: var(--text-secondary);
          line-height: 1.6;
          margin-bottom: 2rem;
        }

        .error-details {
          background: var(--bg-tertiary);
          padding: 1rem;
          border-radius: var(--radius-md, 8px);
          margin-bottom: 2rem;
          text-align: left;
          font-size: 0.8rem;
          overflow-x: auto;
          color: var(--text-tertiary);
          border: 1px solid var(--border-color);
        }

        .error-actions {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .error-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 0.875rem 1.5rem;
          font-weight: 700;
          font-size: 0.95rem;
          border-radius: var(--radius-lg, 12px);
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }

        .error-btn--primary {
          background: var(--color-primary, #0ea5e9);
          color: #ffffff;
          box-shadow: 0 4px 12px rgba(14, 165, 233, 0.25);
        }

        .error-btn--primary:hover {
          background: var(--color-primary-hover, #0284c7);
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(14, 165, 233, 0.35);
        }

        .error-btn--secondary {
          background: transparent;
          border-color: var(--border-color);
          color: var(--text-primary);
        }

        .error-btn--secondary:hover {
          background: var(--bg-secondary);
          border-color: var(--text-secondary);
        }

        .error-footer {
          font-size: 0.875rem;
          color: var(--text-tertiary);
        }

        .error-footer a {
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 600;
        }

        .error-footer a:hover {
          text-decoration: underline;
        }

        @media (min-width: 640px) {
          .error-actions {
            flex-direction: row;
          }
          .error-btn {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
};



import React from 'react';
import { Link } from 'react-router-dom';
import { Home, Search } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export const NotFoundPage: React.FC = () => {
  useDocumentTitle('404 Not Found — LaserHub');

  return (
    <div className="not-found-page">
      <div className="nf-content">
        <div className="nf-illustration">
          <span>404</span>
          <div className="nf-beam" />
        </div>
        <h1>Lost in Space?</h1>
        <p>The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.</p>
        
        <div className="nf-actions">
          <Link to="/" className="btn btn-primary">
            <Home size={18} /> Back to Earth
          </Link>
          <Link to="/browse" className="btn btn-outline">
            <Search size={18} /> Browse Designs
          </Link>
        </div>
      </div>

      <style>{`
        .not-found-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #0a0a0b;
          color: white;
          padding: 2rem;
          text-align: center;
        }
        .nf-content {
          max-width: 500px;
        }
        .nf-illustration {
          position: relative;
          font-size: 8rem;
          font-weight: 900;
          line-height: 1;
          margin-bottom: 2rem;
          background: linear-gradient(to bottom, #0ea5e9, #4f46e5);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          opacity: 0.8;
        }
        .nf-beam {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(14, 165, 233, 0.15) 0%, transparent 70%);
          z-index: -1;
        }
        h1 { font-size: 2.5rem; margin-bottom: 1rem; }
        p { color: #94a3b8; margin-bottom: 2.5rem; font-size: 1.1rem; line-height: 1.6; }
        .nf-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
        }
        .btn-primary { background: #0ea5e9; color: white; }
        .btn-primary:hover { background: #0284c7; }
        .btn-outline { border: 1px solid #27272a; color: white; }
        .btn-outline:hover { background: #1e293b; border-color: #3f3f46; }
      `}</style>
    </div>
  );
};

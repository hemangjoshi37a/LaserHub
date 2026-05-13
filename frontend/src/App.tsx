import { useEffect, useState, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { ErrorFallback } from './components/ErrorFallback';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { BrowseDesignsPage } from './pages/BrowseDesignsPage';
import { VendorsPage } from './pages/VendorsPage';
import { VendorProfilePage } from './pages/VendorProfilePage';
import { DesignDetailPage } from './pages/DesignDetailPage';
import { VendorRegisterPage } from './pages/VendorRegisterPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage';
import { TermsOfServicePage } from './pages/TermsOfServicePage';
import { RefundPolicyPage } from './pages/RefundPolicyPage';
import { AboutUsPage } from './pages/AboutUsPage';
import { ContactUsPage } from './pages/ContactUsPage';
import { PublicQuotePage } from './pages/PublicQuotePage';
import { OrderTrackingPage } from './pages/OrderTrackingPage';
import { TrackOrderPage } from './pages/TrackOrderPage';
import { MaterialWizardPage } from './pages/MaterialWizardPage';
import { MaterialComparePage } from './pages/MaterialComparePage';
import { SamplePackPage } from './pages/SamplePackPage';
import { useAuthStore } from './store/authStore';
import { isSuperAdmin, isVendor } from './utils/roles';
import { useCurrencyStore } from './store/currencyStore';
import { Navbar, NotificationPrompt } from './components';
import { useEscapeKey } from './hooks/useEscapeKey';
import { Toaster } from 'sonner';
import { Github } from 'lucide-react';
import './App.css';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const location = useLocation();

  if (!hasHydrated) return null;

  if (!isAuthenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }

  return <>{children}</>;
};

function AppContent() {
  const { checkAuth } = useAuthStore();
  const { detect: detectCurrency } = useCurrencyStore();

  // Restore auth state and detect currency on mount
  useEffect(() => {
    checkAuth();
    detectCurrency();
  }, [checkAuth, detectCurrency]);

  return (
    <div className="app">
      <a href="#main" className="skip-link">Skip to main content</a>
      <Navbar />

      <NotificationPrompt />

      <main className="main" id="main" tabIndex={-1}>
        <ErrorBoundary
          FallbackComponent={ErrorFallback as unknown as React.ComponentType<FallbackProps>}
          onReset={() => window.location.assign('/')}
        >
          <Routes>
            <Route path="/" element={<MarketplacePage />} />
            <Route path="/upload" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/browse" element={<BrowseDesignsPage />} />
            <Route path="/vendors" element={<VendorsPage />} />
            <Route path="/vendor/register" element={<VendorRegisterPage />} />
            <Route path="/vendor/:slug" element={<VendorProfilePage />} />
            <Route path="/design/:id" element={<DesignDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard/*" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="/admin/*" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="/vendor/dashboard/*" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/refund-policy" element={<RefundPolicyPage />} />
            <Route path="/about" element={<AboutUsPage />} />
            <Route path="/contact" element={<ContactUsPage />} />
            <Route path="/track/:token" element={<TrackOrderPage />} />
            <Route path="/tracking/:identifier" element={<OrderTrackingPage />} />
            <Route path="/q/:quote_number" element={<PublicQuotePage />} />
            <Route path="/material-wizard" element={<MaterialWizardPage />} />
            <Route path="/materials/compare" element={<MaterialComparePage />} />
            <Route path="/samples" element={<SamplePackPage />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span>LaserHub</span> by <a href="https://hjlabs.in" target="_blank" rel="noopener noreferrer">hjLabs.in</a>
          </div>
          <div className="footer-links">
            <a href="https://github.com/hemangjoshi37a/LaserHub" target="_blank" rel="noopener noreferrer" className="footer-github-link">
              <Github size={16} />
              GitHub
            </a>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/refund-policy">Refund Policy</Link>
          </div>
          <details className="footer-more-tools">
            <summary>More tools from hjLabs.in</summary>
            <div className="footer-tool-links footer-ecosystem">
              <a href="https://og.hjlabs.in" target="_blank" rel="noopener noreferrer">OG Generator</a>
              <a href="https://fmt.hjlabs.in" target="_blank" rel="noopener noreferrer">Dev Tools</a>
              <a href="https://enhance.hjlabs.in" target="_blank" rel="noopener noreferrer">AI Image Enhancer</a>
              <a href="https://compliance.hjlabs.in" target="_blank" rel="noopener noreferrer">DPDPA Compliance</a>
              <a href="https://pixel.hjlabs.in" target="_blank" rel="noopener noreferrer">Arduino Image2CPP</a>
              <a href="https://hjlabs.in/AIML/" target="_blank" rel="noopener noreferrer">AI/ML Services</a>
            </div>
          </details>
          <p className="footer-copy">&copy; {new Date().getFullYear()} hjLabs.in. All rights reserved.</p>
        </div>
      </footer>

      <Toaster
        position="top-right"
        richColors
        closeButton
        duration={2000}
        toastOptions={{
          style: { pointerEvents: 'auto' },
        }}
      />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Zap, ShoppingBag, Store, ShieldCheck } from 'lucide-react';
import { NavLinks } from './NavLinks';
import { NavUserMenu } from './NavUserMenu';
import { CurrencySwitcher } from '../CurrencySwitcher';
import { ThemeToggle } from '../ThemeToggle';
import { useAuthStore } from '../../store/authStore';
import { isSuperAdmin } from '../../utils/roles';
import './Navbar.css';

export const Navbar: React.FC = () => {
  const { user } = useAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Track scroll for navbar shadow
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // The brand always returns to the public marketplace home for every user
  // (customers, vendors, super-admins). The dashboard is reachable via the
  // avatar menu / "Viewing as" switcher, never by hijacking the logo.
  const logoLink = '/';

  // Determine which super-admin "view" is currently active from the URL.
  const path = location.pathname;
  const activeView = path.startsWith('/admin')
    ? 'admin'
    : path.startsWith('/vendor/dashboard')
      ? 'seller'
      : path.startsWith('/dashboard')
        ? 'buyer'
        : null;

  return (
    <nav className={`navbar${isScrolled ? ' scrolled' : ''}`}>
      <div className="nav-container">
        <div className="nav-main">
          <Link to={logoLink} className="nav-brand">
            <Zap className="nav-logo-icon" fill="var(--color-primary)" />
            <span>LaserHub</span>
          </Link>
          
          <NavLinks className="nav-links-desktop" />
        </div>

        <div className="nav-actions">
          <div className="nav-links-desktop">
            <CurrencySwitcher />
          </div>

          <ThemeToggle />

          {user && isSuperAdmin(user) && (
            <div className="nav-role-switches" role="group" aria-label="Viewing as">
              <span className="nav-role-label">Viewing as:</span>
              <Link
                to="/dashboard/profile"
                className={`nav-role-btn${activeView === 'buyer' ? ' active' : ''}`}
                title="Buyer View"
                aria-label="Buyer View"
                aria-current={activeView === 'buyer' ? 'page' : undefined}
              >
                <ShoppingBag size={16} />
                <span className="nav-role-btn-text">Buyer</span>
              </Link>
              <Link
                to="/vendor/dashboard/dashboard"
                className={`nav-role-btn${activeView === 'seller' ? ' active' : ''}`}
                title="Seller View"
                aria-label="Seller View"
                aria-current={activeView === 'seller' ? 'page' : undefined}
              >
                <Store size={16} />
                <span className="nav-role-btn-text">Seller</span>
              </Link>
              <Link
                to="/admin/sa-overview"
                className={`nav-role-btn${activeView === 'admin' ? ' active' : ''}`}
                title="Admin View"
                aria-label="Admin View"
                aria-current={activeView === 'admin' ? 'page' : undefined}
              >
                <ShieldCheck size={16} />
                <span className="nav-role-btn-text">Admin</span>
              </Link>
            </div>
          )}

          <NavUserMenu />

          <button 
            className="nav-mobile-toggle"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="nav-mobile-menu">
          <NavLinks 
            className="nav-mobile-links" 
            onItemClick={() => setIsMobileMenuOpen(false)} 
          />
          <div className="nav-dropdown-divider" />
          <div style={{ padding: '8px 16px' }}>
            <CurrencySwitcher />
          </div>
        </div>
      )}
    </nav>
  );
};

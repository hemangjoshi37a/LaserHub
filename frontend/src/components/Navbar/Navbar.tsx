import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Zap } from 'lucide-react';
import { NavLinks } from './NavLinks';
import { NavUserMenu } from './NavUserMenu';
import { CurrencySwitcher } from '../CurrencySwitcher';
import { useAuthStore } from '../../store/authStore';
import { isSuperAdmin, isVendor } from '../../utils/roles';
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

  const logoLink = user ? (isSuperAdmin(user) ? '/admin/sa-overview' : isVendor(user) ? '/vendor/dashboard/dashboard' : '/') : '/';

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

          {user && isSuperAdmin(user) && (
            <div className="nav-role-switches">
              <Link to="/dashboard/profile" className="nav-role-btn" title="Buyer View">
                <Zap size={18} />
              </Link>
              <Link to="/vendor/dashboard/dashboard" className="nav-role-btn" title="Seller View">
                <Zap size={18} />
              </Link>
              <Link to="/admin/sa-overview" className="nav-role-btn" title="Admin View">
                <Zap size={18} />
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

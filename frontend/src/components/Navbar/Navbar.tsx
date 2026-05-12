import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Sun, Moon, Zap } from 'lucide-react';
import { NavLinks } from './NavLinks';
import { NavUserMenu } from './NavUserMenu';
import { CurrencySwitcher } from '../CurrencySwitcher';
import './Navbar.css';

export const Navbar: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const location = useLocation();

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Sync dark mode class and storage
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(prev => !prev);

  return (
    <nav className="navbar">
      <div className="nav-container">
        <div className="nav-main">
          <Link to="/" className="nav-brand">
            <Zap className="nav-logo-icon" fill="var(--color-primary)" />
            <span>LaserHub</span>
          </Link>
          
          <NavLinks className="nav-links-desktop" />
        </div>

        <div className="nav-actions">
          <div className="nav-links-desktop">
            <CurrencySwitcher />
          </div>
          
          <button 
            className="nav-theme-toggle" 
            onClick={toggleDarkMode}
            aria-label="Toggle theme"
          >
            {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>

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

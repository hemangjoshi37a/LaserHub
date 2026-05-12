import React from 'react';
import { NavLink } from 'react-router-dom';
import { Search, Upload, Store } from 'lucide-react';

interface NavLinksProps {
  onItemClick?: () => void;
  className?: string;
}

export const NavLinks: React.FC<NavLinksProps> = ({ onItemClick, className }) => {
  return (
    <div className={className || 'nav-links-desktop'}>
      <NavLink 
        to="/browse" 
        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        onClick={onItemClick}
      >
        <Search size={18} />
        <span>Browse</span>
      </NavLink>
      <NavLink 
        to="/upload" 
        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        onClick={onItemClick}
      >
        <Upload size={18} />
        <span>Upload</span>
      </NavLink>
      <NavLink 
        to="/vendors" 
        className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        onClick={onItemClick}
      >
        <Store size={18} />
        <span>Vendors</span>
      </NavLink>
    </div>
  );
};

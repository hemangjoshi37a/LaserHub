import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  LayoutDashboard, 
  Package, 
  Store, 
  Image as ImageIcon, 
  BarChart2, 
  Settings
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { isSuperAdmin, isVendor } from '../../utils/roles';
import { useEscapeKey } from '../../hooks/useEscapeKey';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const NavUserMenu: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEscapeKey(() => setIsOpen(false), isOpen);

  if (!user) {
    return (
      <div className="nav-auth-btns">
        <Link to="/login" className="nav-btn-login">Login</Link>
        <Link to="/register" className="nav-btn-register">Get Started</Link>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    navigate('/');
  };

  const userIsVendor = isVendor(user) || !!user?.is_admin;
  const userIsSuperAdmin = isSuperAdmin(user);

  return (
    <div className="nav-user-menu" ref={menuRef}>
      <button
        className={`nav-avatar-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        <span className="nav-avatar-initials">{getInitials(user.name)}</span>
      </button>

      {isOpen && (
        <div className="nav-dropdown">
          <div className="nav-dropdown-info">
            <span className="nav-dropdown-name">{user.name}</span>
            <span className="nav-dropdown-email">{user.email}</span>
          </div>
          
          <div className="nav-dropdown-list">
            <Link 
              to={userIsSuperAdmin ? "/admin/sa-overview" : userIsVendor ? "/vendor/dashboard/dashboard" : "/dashboard/profile"} 
              className="nav-dropdown-item" 
              onClick={() => setIsOpen(false)}
            >
              <LayoutDashboard size={16} />
              <span>{userIsSuperAdmin ? "Admin Dashboard" : userIsVendor ? "Seller Dashboard" : "My Projects"}</span>
            </Link>
            
            {(userIsSuperAdmin || !userIsVendor) && (
              <Link to="/dashboard/my-orders" className="nav-dropdown-item" onClick={() => setIsOpen(false)}>
                <Package size={16} />
                <span>My Orders</span>
              </Link>
            )}

            <Link 
              to={userIsVendor ? "/vendor/dashboard/my-settings" : "/dashboard/my-settings"} 
              className="nav-dropdown-item" 
              onClick={() => setIsOpen(false)}
            >
              <Settings size={16} />
              <span>Settings</span>
            </Link>

            {(userIsVendor || userIsSuperAdmin) && (
              <>
                <div className="nav-dropdown-divider" />
                <div className="nav-dropdown-section">Shop Management</div>
                <Link to="/vendor/dashboard/orders" className="nav-dropdown-item" onClick={() => setIsOpen(false)}>
                  <Package size={16} />
                  <span>Fulfillment</span>
                </Link>
                <Link to="/vendor/dashboard/materials-inventory" className="nav-dropdown-item" onClick={() => setIsOpen(false)}>
                  <Store size={16} />
                  <span>Catalog</span>
                </Link>
                <Link to="/vendor/dashboard/storefront" className="nav-dropdown-item" onClick={() => setIsOpen(false)}>
                  <ImageIcon size={16} />
                  <span>My Storefront</span>
                </Link>
              </>
            )}

            {userIsSuperAdmin && (
              <>
                <div className="nav-dropdown-divider" />
                <Link to="/admin" className="nav-dropdown-item" onClick={() => setIsOpen(false)}>
                  <BarChart2 size={16} />
                  <span>Admin Panel</span>
                </Link>
              </>
            )}

            <div className="nav-dropdown-divider" />
            <button className="nav-dropdown-item nav-dropdown-logout" onClick={handleLogout}>
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

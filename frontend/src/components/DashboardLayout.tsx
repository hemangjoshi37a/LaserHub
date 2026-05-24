import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Image as ImageIcon, 
  Receipt, 
  MapPin, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Store,
  BarChart2,
  Layers,
  Search,
  Users,
  Shield,
  FileText
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { isVendor, isSuperAdmin } from '../utils/roles';
import { api } from '../services/api';
import { NavUserMenu } from '.';
import { NotificationBell } from './NotificationBell';
import '../styles/dashboard-new.css';
import './Navbar/Navbar.css';

interface NavItem {
  key: string;
  label: string;
  icon: React.ElementType;
  path: string;
}

const CUSTOMER_NAV: NavItem[] = [
  { key: 'overview', label: 'My Projects', icon: LayoutDashboard, path: '/dashboard/profile' },
  { key: 'orders', label: 'Orders', icon: Package, path: '/dashboard/my-orders' },
  { key: 'designs', label: 'Design Library', icon: ImageIcon, path: '/dashboard/my-designs' },
  { key: 'invoices', label: 'Billing', icon: Receipt, path: '/dashboard/my-invoices' },
  { key: 'addresses', label: 'Shipping', icon: MapPin, path: '/dashboard/billing-addresses' },
  { key: 'settings', label: 'Account', icon: Settings, path: '/dashboard/my-settings' },
];

const VENDOR_NAV: NavItem[] = [
  { key: 'overview', label: 'Mission Control', icon: BarChart2, path: '/vendor/dashboard/dashboard' },
  { key: 'orders', label: 'Fulfillment', icon: Package, path: '/vendor/dashboard/orders' },
  { key: 'catalog', label: 'Shop Catalog', icon: Layers, path: '/vendor/dashboard/materials-inventory' },
  { key: 'customers', label: 'Customers', icon: Users, path: '/vendor/dashboard/customers' },
  { key: 'quotes', label: 'Quotes', icon: FileText, path: '/vendor/dashboard/quotes' },
  { key: 'reports', label: 'Reports', icon: Receipt, path: '/vendor/dashboard/reports' },
  { key: 'storefront', label: 'My Storefront', icon: Store, path: '/vendor/dashboard/storefront' },
  { key: 'team', label: 'Team', icon: Users, path: '/vendor/dashboard/team' },
  { key: 'settings', label: 'Shop Settings', icon: Settings, path: '/vendor/dashboard/my-settings' },
];

const ADMIN_NAV: NavItem[] = [
  { key: 'overview', label: 'Admin Overview', icon: LayoutDashboard, path: '/admin/sa-overview' },
  { key: 'users', label: 'System Users', icon: Users, path: '/admin/sa-users' },
  { key: 'vendors', label: 'Partner Shops', icon: Store, path: '/admin/sa-vendors' },
  { key: 'orders', label: 'Global Orders', icon: Package, path: '/admin/sa-orders' },
  { key: 'stats', label: 'System Stats', icon: BarChart2, path: '/admin/sa-stats' },
  { key: 'settings', label: 'Admin Settings', icon: Settings, path: '/admin/my-settings' },
];

type DashboardSection = 'admin' | 'vendor' | 'customer';

// Pick the dashboard section from the URL path, not the user's role. This keeps
// the chrome (sidebar menu + breadcrumb) in sync with the page being viewed —
// e.g. a super-admin browsing /vendor/dashboard/* sees the VENDOR menu. Access
// control still lives at the route level (ProtectedRoute) and in role helpers;
// this only decides which menu renders for someone already allowed on the page.
const sectionForPath = (pathname: string): DashboardSection | null => {
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/vendor/dashboard')) return 'vendor';
  if (pathname.startsWith('/dashboard')) return 'customer';
  return null;
};

const NAV_BY_SECTION: Record<DashboardSection, NavItem[]> = {
  admin: ADMIN_NAV,
  vendor: VENDOR_NAV,
  customer: CUSTOMER_NAV,
};

// Breadcrumb root label per section, so the trail reflects the area being
// viewed rather than always reading "Dashboard".
const SECTION_LABEL: Record<DashboardSection, string> = {
  admin: 'Admin',
  vendor: 'Seller',
  customer: 'Dashboard',
};

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [vendorSlug, setVendorSlug] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Notifications are handled by the shared <NotificationBell /> in the header,
  // which polls /api/notifications and manages its own read state.

  // Resolve the logged-in vendor's public storefront slug for the "View Public
  // Shop" link. Only fetched while the vendor section is active and the current
  // user can actually own a shop (vendor or super-admin in Seller View).
  useEffect(() => {
    if (!user) return;
    if (sectionForPath(location.pathname) !== 'vendor') return;
    if (!isVendor(user)) return;
    if (vendorSlug) return;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/vendors/me');
        if (!cancelled && data?.slug) setVendorSlug(data.slug);
      } catch {
        // No own shop (e.g. super-admin without a vendor profile) — leave the
        // link hidden rather than pointing at a 404.
      }
    })();
    return () => { cancelled = true; };
  }, [user, location.pathname, vendorSlug]);

  if (!user) return null;

  const userIsVendor = isVendor(user);
  const userIsSuperAdmin = isSuperAdmin(user);

  // Choose chrome (menu + breadcrumb) from the PATH so it matches the page the
  // user is viewing — e.g. a super-admin in Seller View gets the vendor menu.
  // Fall back to the role-based default only when the path isn't a recognised
  // dashboard area. Access control is enforced by the routes, not here.
  const roleSection: DashboardSection = userIsSuperAdmin
    ? 'admin'
    : userIsVendor
      ? 'vendor'
      : 'customer';
  const section: DashboardSection = sectionForPath(location.pathname) ?? roleSection;
  const navItems = NAV_BY_SECTION[section];
  const viewingVendorSection = section === 'vendor';
  
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/dashboard/overview' && location.pathname === '/dashboard') return true;
    return location.pathname.startsWith(path);
  };

  // The brand logo always returns to the public marketplace home so users are
  // never "locked" inside the dashboard. The sidebar nav still covers in-app
  // navigation; the dashboard root is reachable from the user/avatar menu.
  const logoLink = '/';

  return (
    <div className={`dash-container ${section === 'admin' ? 'theme-admin' : section === 'vendor' ? 'theme-vendor' : 'theme-customer'}`}>
      {/* Sidebar */}
      <aside className={`dash-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="dash-sidebar-header">
          <Link to={logoLink} className="dash-logo">
            <div className="dash-logo-icon">L</div>
            <span className="dash-logo-text">LaserHub</span>
          </Link>
          <button className="mobile-close-btn" onClick={() => setMobileMenuOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <div className="dash-user-section">
          <div className="dash-avatar">
            {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            {userIsSuperAdmin ? (
              <div className="admin-badge"><Shield size={10} /></div>
            ) : userIsVendor ? (
              <div className="vendor-badge"><Store size={10} /></div>
            ) : null}
          </div>
          <div className="dash-user-info">
            <span className="dash-user-name">{user.name}</span>
            <span className="dash-user-role">
              {userIsSuperAdmin ? 'System Admin' : userIsVendor ? 'Shop Manager' : 'Project Owner'}
            </span>
          </div>
        </div>

        <nav className="dash-nav">
          <div className="dash-nav-group">
            <span className="dash-nav-label">Menu</span>
            {navItems.map(item => (
              <Link
                key={item.key}
                to={item.path}
                className={`dash-nav-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {isActive(item.path) && <div className="active-indicator" />}
              </Link>
            ))}
          </div>
        </nav>

        <div className="dash-sidebar-footer">
          {viewingVendorSection && vendorSlug && (
            <Link to={`/vendor/${vendorSlug}`} className="dash-view-shop">
              <Store size={16} />
              <span>View Public Shop</span>
            </Link>
          )}
          <button className="dash-logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="dash-main">
        {/* Top Header */}
        <header className={`dash-header ${scrolled ? 'scrolled' : ''}`}>
          <div className="dash-header-left">
            <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <div className="dash-breadcrumb">
              <span className="dash-breadcrumb-item">{SECTION_LABEL[section]}</span>
              <span className="dash-breadcrumb-sep">/</span>
              <span className="dash-breadcrumb-item active">
                {navItems.find(n => isActive(n.path))?.label
                  || navItems[0]?.label
                  || 'Overview'}
              </span>
            </div>
          </div>

          <div className="dash-header-right">
            <div className="dash-search-box">
              <Search size={16} />
              <input type="text" placeholder="Search orders, designs..." />
            </div>
            <NotificationBell variant="dashboard" />

            <div className="dash-header-user">
              {/* Dashboard renders its own <NotificationBell> above, so suppress
                  the duplicate bell inside NavUserMenu here. */}
              <NavUserMenu showBell={false} />
            </div>
          </div>
        </header>

        {/* Content Wrapper */}
        <main className="dash-content">
          {children}
        </main>
      </div>
    </div>
  );
};

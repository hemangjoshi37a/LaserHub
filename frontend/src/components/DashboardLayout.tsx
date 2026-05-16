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
  Bell,
  Search,
  Users,
  Shield
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { isVendor, isSuperAdmin } from '../utils/roles';
import { notificationsApi } from '../services';
import { NavUserMenu } from '.';
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

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Notification Polling
  useEffect(() => {
    if (!user) return;
    
    const fetchNotifications = async () => {
      try {
        const data = await notificationsApi.list();
        setNotifications(data);
      } catch (err) {
        console.error('Failed to fetch notifications');
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // 30s polling
    return () => clearInterval(interval);
  }, [user]);

  if (!user) return null;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleMarkRead = async (id: number) => {
    try {
      await notificationsApi.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error('Failed to mark notification as read');
    }
  };

  const userIsVendor = isVendor(user);
  const userIsSuperAdmin = isSuperAdmin(user);
  
  // Choose navigation based on role
  const navItems = userIsSuperAdmin ? ADMIN_NAV : (userIsVendor ? VENDOR_NAV : CUSTOMER_NAV);
  
  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const isActive = (path: string) => {
    if (path === '/dashboard/overview' && location.pathname === '/dashboard') return true;
    return location.pathname.startsWith(path);
  };

  const logoLink = userIsSuperAdmin ? '/admin/sa-overview' : userIsVendor ? '/vendor/dashboard/dashboard' : '/dashboard/profile';

  return (
    <div className={`dash-container ${userIsSuperAdmin ? 'theme-admin' : userIsVendor ? 'theme-vendor' : 'theme-customer'}`}>
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
          {userIsVendor && !userIsSuperAdmin && (
            <Link to={`/shop/${user.id}`} className="dash-view-shop">
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
              <span className="dash-breadcrumb-item">Dashboard</span>
              <span className="dash-breadcrumb-sep">/</span>
              <span className="dash-breadcrumb-item active">
                {navItems.find(n => isActive(n.path))?.label || 'Overview'}
              </span>
            </div>
          </div>

          <div className="dash-header-right">
            <div className="dash-search-box">
              <Search size={16} />
              <input type="text" placeholder="Search orders, designs..." />
            </div>
            <div className="dash-notifications-wrapper">
              <button 
                className={`dash-icon-btn ${showNotifications ? 'active' : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={20} />
                {unreadCount > 0 && <div className="notification-dot">{unreadCount}</div>}
              </button>

              {showNotifications && (
                <div className="dash-notifications-dropdown">
                  <div className="dash-notifications-header">
                    <h3>Notifications</h3>
                    {unreadCount > 0 && <span>{unreadCount} unread</span>}
                  </div>
                  <div className="dash-notifications-list">
                    {notifications.length === 0 ? (
                      <div className="dash-no-notifications">
                        <Bell size={24} />
                        <p>No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map(n => (
                        <div 
                          key={n.id} 
                          className={`dash-notification-item ${n.is_read ? 'read' : 'unread'}`}
                          onClick={() => {
                            if (!n.is_read) handleMarkRead(n.id);
                            if (n.link) navigate(n.link);
                            setShowNotifications(false);
                          }}
                        >
                          <div className="notification-item-dot" />
                          <div className="notification-item-content">
                            <p className="notification-item-title">{n.title}</p>
                            <p className="notification-item-msg">{n.message}</p>
                            <span className="notification-item-time">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="dash-header-user">
              <NavUserMenu />
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

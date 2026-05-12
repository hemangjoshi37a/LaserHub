import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Package,
  User as UserIcon,
  LogOut,
  Menu,
  X,
  Mail,
  Calendar,
  Loader2,
  Star,
  Edit2,
  Save,
  Bell,
  Settings,
  Image as ImageIcon,
  MapPin,
  Receipt,
  type LucideIcon,
  Trash2,
} from 'lucide-react';
import { BillingAddressBook } from '../components/billing/BillingAddressBook';
import { CustomerInvoiceList } from '../components/invoicing/CustomerInvoiceList';
import OrderTrackingPanel from '../components/OrderTrackingPanel';
import { ReviewModal } from '../components/ReviewModal';
import { EmptyState } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { useAuthStore } from '../store/authStore';
import { formatRole } from '../utils/roles';
import { authApi, designApi, ordersApi, addressesApi, savedQuotesStore, Order, DesignItem, type SavedAddress, type SavedQuote } from '../services';
import { resolveMediaUrl } from '../services/api';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

// ---- Tab identifiers ----
type TabKey =
  | 'profile'
  | 'orders'
  | 'designs'
  | 'invoices'
  | 'addresses'
  | 'settings';

interface NavItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'profile', label: 'Profile', icon: UserIcon },
  { key: 'orders', label: 'My Orders', icon: Package },
  { key: 'designs', label: 'My Designs', icon: ImageIcon },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'addresses', label: 'Addresses', icon: MapPin },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export const UserDashboardPage: React.FC = () => {
  useDocumentTitle('My Dashboard — LaserHub');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, logout, checkAuth, setUser } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Derive activeTab from URL path: /dashboard/orders -> "orders"
  const pathSuffix = location.pathname.replace(/^\/dashboard\/?/, '').replace(/\/$/, '');
  const activeTab = (pathSuffix || 'profile') as TabKey;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
    }
  }, [user, authLoading, navigate]);

  if (authLoading || !user) {
    return (
      <div className="adm-loading">
        <Loader2 className="spinner" size={32} />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="adm-layout">
      {/* Sidebar */}
      <aside className={`adm-sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="adm-sidebar-header">
          <div className="adm-user-brief">
            <div className="adm-avatar-sm">
              {user.name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div className="adm-user-info">
              <span className="adm-user-name">{user.name}</span>
              <span className="adm-user-role">{formatRole(user.role, user.is_admin)}</span>
            </div>
          </div>
          <button className="adm-mobile-close" onClick={() => setMobileOpen(false)}>
            <X size={20} />
          </button>
        </div>

        <nav className="adm-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              to={`/dashboard/${item.key}`}
              className={`adm-nav-item ${activeTab === item.key ? 'active' : ''}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="adm-sidebar-footer">
          <button onClick={handleLogout} className="adm-nav-item adm-nav-logout">
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="adm-main">
        <div className="adm-mobile-header">
          <button className="adm-menu-toggle" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </button>
          <span className="adm-mobile-title">
            {NAV_ITEMS.find(n => n.key === activeTab)?.label || 'Dashboard'}
          </span>
        </div>

        <div className="adm-content-wrap">
          {activeTab === 'profile' && <ProfileTab />}
          {activeTab === 'orders' && <OrdersTab />}
          {activeTab === 'designs' && <DesignsTab />}
          {activeTab === 'invoices' && <InvoicesTab />}
          {activeTab === 'addresses' && <AddressesTab />}
          {activeTab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
};

// --- Sub-components (Simplified versions of AdminPage tabs) ---

function ProfileTab() {
  const { user, setUser } = useAuthStore();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');

  if (!user) return null;

  const handleSaveName = () => {
    if (!nameDraft.trim()) return;
    setUser({ ...user, name: nameDraft.trim() });
    setEditingName(false);
    toast.success('Name updated');
  };

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <h1 className="adm-page-title">Profile</h1>
        <p className="adm-page-sub">Manage your account information</p>
      </header>

      <div className="adm-card">
        <div style={{ padding: '1.5rem' }}>
          <div className="prof-field" style={{ marginBottom: '1.5rem' }}>
            <label className="sa-label">Full Name</label>
            {editingName ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  className="sa-input" 
                  value={nameDraft} 
                  onChange={e => setNameDraft(e.target.value)} 
                />
                <button className="sa-btn sa-btn--primary-sm" onClick={handleSaveName}>Save</button>
                <button className="sa-btn sa-btn--ghost-sm" onClick={() => setEditingName(false)}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{user.name}</span>
                <button className="sa-btn sa-btn--ghost-sm" onClick={() => setEditingName(true)}>
                  <Edit2 size={14} /> Edit
                </button>
              </div>
            )}
          </div>

          <div className="prof-field" style={{ marginBottom: '1.5rem' }}>
            <label className="sa-label">Email Address</label>
            <p>{user.email}</p>
          </div>

          <div className="prof-field">
            <label className="sa-label">Account Type</label>
            <span className="sa-badge">{user.role}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackOrderId, setTrackOrderId] = useState<number | null>(null);

  useEffect(() => {
    authApi.listMyOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <h1 className="adm-page-title">My Orders</h1>
        <p className="adm-page-sub">Track and manage your orders</p>
      </header>

      <div className="adm-card">
        {loading ? (
          <div style={{ padding: '2rem' }}><Skeleton height="200px" /></div>
        ) : orders.length === 0 ? (
          <EmptyState 
            icon={<Package size={48} />} 
            title="No orders yet" 
            description="Your order history will appear here once you place your first order."
            action={<Link to="/upload" className="sa-btn sa-btn--primary">Start a New Project</Link>}
          />
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr key={order.id}>
                    <td className="adm-cell-accent">{order.order_number}</td>
                    <td>{new Date(order.created_at).toLocaleDateString()}</td>
                    <td>{formatPrice(order.total_amount)}</td>
                    <td>
                      <span className={`adm-status-badge adm-status-badge--${order.status}`}>
                        {order.status}
                      </span>
                    </td>
                    <td>
                      <button className="sa-btn sa-btn--ghost-sm" onClick={() => setTrackOrderId(order.id)}>
                        Track
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {trackOrderId && (
        <OrderTrackingPanel orderId={trackOrderId} onClose={() => setTrackOrderId(null)} />
      )}
    </div>
  );
}

function DesignsTab() {
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    designApi.getMyDesigns()
      .then(setDesigns)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <h1 className="adm-page-title">My Designs</h1>
        <p className="adm-page-sub">Your uploaded and saved vector files</p>
      </header>

      <div className="adm-card">
        {loading ? (
          <div className="mp-design-grid" style={{ padding: '1.5rem' }}>
            {[1,2,3].map(i => <Skeleton key={i} height="200px" />)}
          </div>
        ) : designs.length === 0 ? (
          <EmptyState 
            icon={<ImageIcon size={48} />} 
            title="No designs yet" 
            description="Upload DXF or SVG files to get started."
            action={<Link to="/upload" className="sa-btn sa-btn--primary">Upload Design</Link>}
          />
        ) : (
          <div className="prof-designs-grid" style={{ padding: '1.5rem' }}>
            {designs.map(d => (
              <Link key={d.id} to={`/design/${d.id}`} className="prof-design-card">
                <div className="prof-design-thumb">
                  {d.thumbnail_url ? <img src={resolveMediaUrl(d.thumbnail_url)!} alt={d.title} /> : <ImageIcon size={32} />}
                </div>
                <div className="prof-design-info">
                  <strong>{d.title}</strong>
                  <span>{d.category}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InvoicesTab() {
  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <h1 className="adm-page-title">Invoices</h1>
        <p className="adm-page-sub">Download tax invoices for your orders</p>
      </header>
      <div className="adm-card">
        <CustomerInvoiceList />
      </div>
    </div>
  );
}

function AddressesTab() {
  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <h1 className="adm-page-title">Billing Addresses</h1>
        <p className="adm-page-sub">Manage your shipping and billing details</p>
      </header>
      <BillingAddressBook />
    </div>
  );
}

function SettingsTab() {
  const { user } = useAuthStore();
  const [emailNotifs, setEmailNotifs] = useState(true);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <h1 className="adm-page-title">Settings</h1>
        <p className="adm-page-sub">Notification and account preferences</p>
      </header>

      <div className="adm-card" style={{ padding: '1.5rem' }}>
        <h3>Notifications</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1rem' }}>
          <input type="checkbox" checked={emailNotifs} onChange={e => setEmailNotifs(e.target.checked)} />
          <span>Email me updates about my order status</span>
        </label>
      </div>

      <div className="adm-card" style={{ padding: '1.5rem', marginTop: '1.5rem', border: '1px solid #fee2e2' }}>
        <h3 style={{ color: '#ef4444' }}>Danger Zone</h3>
        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.5rem 0 1rem' }}>
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button className="sa-btn sa-btn--danger-sm">Delete Account</button>
      </div>
    </div>
  );
}

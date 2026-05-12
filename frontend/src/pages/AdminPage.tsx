import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Layers,
  CreditCard,
  BarChart2,
  User as UserIcon,
  LogOut,
  ArrowLeft,
  Menu,
  X,
  Mail,
  Calendar,
  Loader2,
  Star,
  Edit2,
  Save,
  Trash2,
  Bell,
  Settings,
  Image as ImageIcon,
  Users,
  Store,
  BarChart3,
  Palette,
  FileText,
  MapPin,
  Receipt,
  type LucideIcon,
} from 'lucide-react';
import { AdminDashboard } from '../components/AdminDashboard';
import { OrderKanban } from '../components/OrderKanban';
import { QuoteBuilder } from '../components/QuoteBuilder';
import { MaterialsInventory } from './MaterialsInventory';
import { BusinessReports } from './BusinessReports';
import { Invoices as InvoicesPage } from './admin/Invoices';
import { BillingAddressBook } from '../components/billing/BillingAddressBook';
import { CustomerInvoiceList } from '../components/invoicing/CustomerInvoiceList';
import { PaymentSettings } from '../components/PaymentSettings';
import { CustomersCRM } from '../components/CustomersCRM';
import { TeamPanel } from '../components/TeamPanel';
import { ReviewModal } from '../components/ReviewModal';
import OrderTrackingPanel from '../components/OrderTrackingPanel';
import { EmptyState } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { useAuthStore } from '../store/authStore';
import { isSuperAdmin, isVendor, formatRole } from '../utils/roles';
import { authApi, designApi, ordersApi, addressesApi, savedQuotesStore, Order, DesignItem, type SavedAddress, type SavedQuote } from '../services';
import { resolveMediaUrl } from '../services/api';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

// Super admin tab components (imported from SuperAdminPage module)
// We re-export those sub-tab functions so they're available here.
// Since they're local functions in SuperAdminPage.tsx, we inline-import the page
// and render the sub-tabs via the main component's tab mechanism.
// Actually, the sub-tab components (UsersTab, VendorsTab, etc.) are not exported
// from SuperAdminPage.tsx, so we need to import the whole module differently.
// The cleanest approach: import SuperAdminPage's internal tabs by extracting them.
// For now, we'll use a wrapper that renders the SuperAdminPage content sections.

// ---- Tab identifiers ----
type TabKey =
  // Everyone
  | 'profile'
  | 'my-orders'
  | 'my-designs'
  | 'my-invoices'
  | 'billing-addresses'
  | 'my-settings'
  // Vendor + Super Admin
  | 'dashboard'
  | 'orders'
  | 'quotes'
  | 'customers'
  | 'team'
  | 'materials-inventory'
  | 'reports'
  | 'invoices'
  | 'payments'
  // Super Admin only
  | 'sa-overview'
  | 'sa-users'
  | 'sa-vendors'
  | 'sa-designs'
  | 'sa-orders'
  | 'sa-stats';

interface NavItem {
  key: TabKey;
  label: string;
  icon: LucideIcon;
}

// ============================================================================
// Profile Tab Content
// ============================================================================
function ProfileTabContent() {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');

  if (!user) return null;

  const handleSaveName = () => {
    if (!nameDraft.trim()) return;
    setUser({ ...user, name: nameDraft.trim() });
    setEditingName(false);
    toast.success('Name updated');
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getInitials = (name: string) =>
    name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Profile</h1>
          <p className="adm-page-sub">Manage your account information</p>
        </div>
      </header>

      <div className="adm-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.5rem' }}>
          <div className="nav-avatar-initials" style={{
            width: 64, height: 64, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
            fontWeight: 700, background: 'var(--primary-color)', color: '#fff',
          }}>
            {getInitials(user.name)}
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{user.name}</h2>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Mail size={14} /> {user.email}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Calendar size={14} /> Joined{' '}
                {new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ padding: '1.5rem' }}>
          <div className="prof-field" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Name</label>
            {editingName ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)', flex: 1 }}
                />
                <button className="sa-btn sa-btn--primary-sm" onClick={handleSaveName}><Save size={14} /> Save</button>
                <button className="sa-btn sa-btn--ghost-sm" onClick={() => { setEditingName(false); setNameDraft(user.name); }}><X size={14} /> Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>{user.name}</span>
                <button className="sa-btn sa-btn--ghost-sm" onClick={() => setEditingName(true)}><Edit2 size={14} /> Edit</button>
              </div>
            )}
          </div>

          <div className="prof-field" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Email</label>
            <span>{user.email}</span>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>Contact support to change</span>
          </div>

          <div className="prof-field" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Joined</label>
            <span>{new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>

          <div className="prof-field" style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem', display: 'block' }}>Role</label>
            <span className="sa-badge">{formatRole(user.role, user.is_admin)}</span>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '1rem' }}>
            <button onClick={handleLogout} className="sa-btn sa-btn--ghost-sm">
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// My Orders Tab Content
// ============================================================================
function MyOrdersTabContent() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);
  const [reviewedOrders, setReviewedOrders] = useState<Set<number>>(new Set());
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [reorderingId, setReorderingId] = useState<number | null>(null);

  useEffect(() => {
    setSavedQuotes(savedQuotesStore.load());
  }, []);

  const handleReorder = async (orderId: number) => {
    setReorderingId(orderId);
    try {
      const newOrder = await ordersApi.reorder(orderId);
      toast.success(`Reordered as ${newOrder.order_number}`);
      // Refresh list
      const data = await authApi.listMyOrders();
      setOrders(data);
    } catch (err) {
      const e = err as { response?: { data?: { detail?: string } } };
      toast.error('Reorder failed', { description: e.response?.data?.detail });
    } finally {
      setReorderingId(null);
    }
  };

  const handleOrderSavedQuote = (q: SavedQuote) => {
    const params = new URLSearchParams();
    if (q.design_id) params.set('design_id', String(q.design_id));
    if (q.file_id) params.set('file_id', q.file_id);
    if (q.vendor_slug) params.set('vendor', q.vendor_slug);
    if (q.material) params.set('material', q.material);
    if (q.thickness) params.set('thickness', String(q.thickness));
    if (q.qty) params.set('qty', String(q.qty));
    navigate(`/upload?${params.toString()}`);
  };

  const handleRemoveSavedQuote = (id: string) => {
    savedQuotesStore.remove(id);
    setSavedQuotes(savedQuotesStore.load());
  };
  const [trackOrderId, setTrackOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const data = await authApi.listMyOrders();
        setOrders(data);
      } catch {
        console.error('Failed to fetch orders');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user]);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">My Orders</h1>
          <p className="adm-page-sub">Your order history and tracking</p>
        </div>
      </header>

      <div className="adm-card">
        <div className="adm-card-header">
          <h2 className="adm-card-title"><Package size={18} /> Order History</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{orders.length} orders</span>
        </div>

        {isLoading ? (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }} aria-busy="true" aria-label="Loading orders">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height="2.5rem" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <EmptyState
              icon={<Package size={40} />}
              title="No orders yet"
              description="Upload a design, pick a material, and place your first order."
              action={<Link to="/upload" className="sa-btn sa-btn--primary-sm">Start a new order</Link>}
            />
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Material</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="adm-row"
                    onClick={(e) => {
                      // don't hijack clicks on buttons inside the row
                      if ((e.target as HTMLElement).closest('button')) return;
                      setTrackOrderId(order.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="adm-cell-accent">{order.order_number}</td>
                    <td>
                      <div className="adm-cell-medium">{order.material_name}</div>
                      <div className="adm-cell-sub">{order.thickness_mm}mm / Qty: {order.quantity}</div>
                    </td>
                    <td className="adm-cell-bold">{formatPrice(order.total_amount)}</td>
                    <td>
                      <span className={`adm-status-badge adm-status-badge--${
                        order.status === 'completed' ? 'success' :
                        order.status === 'cancelled' ? 'error' :
                        order.status === 'paid' ? 'success' :
                        order.status === 'in_production' ? 'info' : 'warning'
                      }`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="adm-cell-sub">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                        <button
                          className="sa-btn sa-btn--ghost-sm"
                          onClick={() => handleReorder(order.id)}
                          disabled={reorderingId === order.id}
                          title="Place the same order again"
                        >
                          {reorderingId === order.id ? 'Reordering…' : 'Reorder'}
                        </button>
                        {order.status === 'completed' && !reviewedOrders.has(order.id) && (
                          <button
                            className="sa-btn sa-btn--ghost-sm"
                            onClick={() => setReviewOrderId(order.id)}
                          >
                            <Star size={14} /> Review
                          </button>
                        )}
                        {reviewedOrders.has(order.id) && (
                          <span className="sa-badge sa-badge--success">Reviewed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="adm-card" style={{ marginTop: '1.5rem' }}>
        <div className="adm-card-header">
          <h2 className="adm-card-title">Saved Quotes</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            {savedQuotes.length} saved · auto-expire after 30 days
          </span>
        </div>
        {savedQuotes.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No saved quotes yet. Save quotes from the vendor comparison to reorder later.
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Material</th>
                  <th>Price</th>
                  <th>Qty</th>
                  <th>Saved</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {savedQuotes.map((q) => (
                  <tr key={q.id} className="adm-row">
                    <td className="adm-cell-medium">{q.vendor_name || q.vendor_slug || '—'}</td>
                    <td>{q.material} · {q.thickness}mm</td>
                    <td className="adm-cell-bold">{formatPrice(q.price)}</td>
                    <td>{q.qty}</td>
                    <td className="adm-cell-sub">{new Date(q.saved_at).toLocaleDateString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {q.design_id && (
                          <Link to={`/design/${q.design_id}`} className="sa-btn sa-btn--ghost-sm">View Design</Link>
                        )}
                        <button className="sa-btn sa-btn--primary-sm" onClick={() => handleOrderSavedQuote(q)}>
                          Order Now
                        </button>
                        <button className="sa-btn sa-btn--ghost-sm" onClick={() => handleRemoveSavedQuote(q.id)} aria-label="Remove saved quote">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewOrderId !== null && (
        <ReviewModal
          orderId={reviewOrderId}
          vendorId={1}
          onClose={() => setReviewOrderId(null)}
          onSubmitted={() => {
            setReviewedOrders((prev) => new Set(prev).add(reviewOrderId));
            setReviewOrderId(null);
          }}
        />
      )}

      {trackOrderId !== null && (
        <OrderTrackingPanel
          orderId={trackOrderId}
          onClose={() => setTrackOrderId(null)}
        />
      )}
    </div>
  );
}

// ============================================================================
// My Designs Tab Content
// ============================================================================
function MyDesignsTabContent() {
  const { user } = useAuthStore();
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    designApi
      .getMyDesigns()
      .then((d) => setDesigns(d))
      .catch(() => console.error('Failed to load designs'))
      .finally(() => setIsLoading(false));
  }, [user]);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">My Designs</h1>
          <p className="adm-page-sub">Your saved and uploaded designs</p>
        </div>
      </header>

      <div className="adm-card">
        <div className="adm-card-header">
          <h2 className="adm-card-title"><ImageIcon size={18} /> Designs</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{designs.length} designs</span>
        </div>

        {isLoading ? (
          <div className="mp-design-grid" style={{ padding: '1rem' }} aria-busy="true" aria-label="Loading designs">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="mp-design-card skeleton-card">
                <Skeleton height="140px" borderRadius="6px" />
                <Skeleton height="1rem" width="70%" />
                <Skeleton height="0.75rem" width="50%" />
              </div>
            ))}
          </div>
        ) : designs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <EmptyState
              icon={<ImageIcon size={40} />}
              title="No saved designs"
              description="Upload a design and save it to reuse later or share with the community."
              action={<Link to="/upload" className="sa-btn sa-btn--primary-sm">Upload a design</Link>}
            />
          </div>
        ) : (
          <div className="prof-designs-grid" style={{ padding: '1.5rem' }}>
            {designs.map((d) => (
              <Link key={d.id} to={`/design/${d.id}`} className="prof-design-card">
                <div className="prof-design-thumb">
                  {d.thumbnail_url ? <img src={resolveMediaUrl(d.thumbnail_url)!} alt={d.title} style={{ background: '#fff', padding: 2, borderRadius: 4 }} /> : <ImageIcon size={32} />}
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

// ============================================================================
// Address Manager (embedded in MySettings)
// ============================================================================
function AddressManager() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Omit<SavedAddress, 'id'>>({
    label: '', street: '', city: '', state: '', zip: '', country: '', is_default: false,
  });

  const reload = async () => {
    setLoading(true);
    try { setAddresses(await addressesApi.list()); } catch { setAddresses([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const handleSave = async () => {
    if (!form.street || !form.city) { toast.error('Street and city are required'); return; }
    try {
      await addressesApi.create(form);
      toast.success('Address saved');
      setShowForm(false);
      setForm({ label: '', street: '', city: '', state: '', zip: '', country: '', is_default: false });
      reload();
    } catch { toast.error('Failed to save address'); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this address?')) return;
    try { await addressesApi.remove(id); reload(); } catch { toast.error('Delete failed'); }
  };

  const handleSetDefault = async (id: string) => {
    try { await addressesApi.setDefault(id); reload(); } catch { toast.error('Failed to set default'); }
  };

  return (
    <div className="adm-card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0 }}>Saved Addresses</h3>
        <button className="sa-btn sa-btn--primary-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Add address'}
        </button>
      </div>

      {showForm && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-secondary, #f8fafc)', borderRadius: 8 }}>
          <input placeholder="Label (Home, Office…)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <input placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <input placeholder="Street address" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} style={{ gridColumn: '1 / -1' }} />
          <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <input placeholder="ZIP" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            Make default
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button className="sa-btn sa-btn--primary-sm" onClick={handleSave}>Save address</button>
          </div>
        </div>
      )}

      {loading ? (
        <Skeleton height="3rem" />
      ) : addresses.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>No addresses saved yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {addresses.map((a) => (
            <div key={a.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
              padding: '0.6rem 0.85rem', border: '1px solid var(--border-color)', borderRadius: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                  {a.label || 'Address'}
                  {a.is_default && <span className="sa-badge sa-badge--success" style={{ marginLeft: '0.35rem' }}>Default</span>}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {[a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(', ')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                {!a.is_default && (
                  <button className="sa-btn sa-btn--ghost-sm" onClick={() => handleSetDefault(a.id)}>
                    Set default
                  </button>
                )}
                <button className="sa-btn sa-btn--ghost-sm" onClick={() => handleDelete(a.id)} aria-label="Delete address">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// My Settings Tab Content
// ============================================================================
function MySettingsTabContent() {
  const { user } = useAuthStore();
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const api = (await import('../services/api')).default;
        const { data } = await api.get('/tracking/me/notification-prefs');
        setEmailNotifs(!!data.email);
        setPushNotifs(!!data.push);
      } catch {
        // non-fatal
      }
    })();
  }, [user]);

  const savePrefs = async (next: { email?: boolean; push?: boolean }) => {
    const payload = { email: next.email ?? emailNotifs, push: next.push ?? pushNotifs, sms: false };
    setSavingPrefs(true);
    try {
      const api = (await import('../services/api')).default;
      await api.put('/tracking/me/notification-prefs', payload);
      toast.success('Preferences saved');
    } catch {
      toast.error('Could not save preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  if (!user) return null;

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      'Delete your account? This cannot be undone and will remove your orders and designs.'
    );
    if (!confirmed) return;
    toast.error('Account deletion is not yet available. Contact support.');
  };

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Settings</h1>
          <p className="adm-page-sub">Account preferences and notifications</p>
        </div>
      </header>

      <div className="adm-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <Bell size={16} /> Order status notifications
        </h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={emailNotifs}
            disabled={savingPrefs}
            onChange={(e) => { setEmailNotifs(e.target.checked); savePrefs({ email: e.target.checked }); }}
          />
          <span>Email on order status change</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={pushNotifs}
            disabled={savingPrefs}
            onChange={(e) => { setPushNotifs(e.target.checked); savePrefs({ push: e.target.checked }); }}
          />
          <span>Push on order status change</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'not-allowed', opacity: 0.6 }}>
          <input type="checkbox" disabled />
          <span>SMS on order status change <em style={{ fontSize: '0.75rem' }}>(coming soon)</em></span>
        </label>
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '0.75rem 0' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={marketingEmails} onChange={(e) => setMarketingEmails(e.target.checked)} />
          <span>Product updates and newsletter</span>
        </label>
      </div>

      <AddressManager />

      <div className="adm-card" style={{ padding: '1.5rem', marginTop: '1.5rem', borderColor: 'var(--error-color, #ef4444)' }}>
        <h3 style={{ color: 'var(--error-color, #ef4444)', marginBottom: '0.5rem' }}>Danger zone</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
          Permanently delete your LaserHub account and all associated data.
        </p>
        <button className="sa-btn sa-btn--danger-sm" onClick={handleDeleteAccount}>
          <Trash2 size={14} /> Delete account
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Lazy-loaded Super Admin sub-tabs
// We dynamically import the SuperAdminPage module and render its internal
// sub-components. Since those sub-components are NOT exported, we'll create
// a wrapper that renders the full SuperAdminPage but controls which tab shows.
// ============================================================================

// Instead, let's use React.lazy to load the entire SuperAdminPage module.
// The internal tab components (UsersTab, VendorsTab, etc.) are not exported,
// so we need a different approach: we render an embedded version that
// takes the desired tab as a prop.

// The simplest approach: since the SuperAdminPage sub-tabs are self-contained
// functions, we'll import them by re-exporting. But to avoid touching that file
// for now, we'll create thin wrapper components that lazy-load them.

// Actually, the cleanest path: We extract the sub-tabs as exported functions
// from SuperAdminPage.tsx OR we just embed the whole SuperAdminPage content
// directly by rendering it inside our unified layout. Let's do the latter:
// We'll render the super admin sub-tab components by importing the page
// and telling it which tab to show.

// For the MVP, let's import the SuperAdminPage and wrap its content.
// But that would bring its own sidebar. Instead, we'll refactor:
// export the sub-tab components from SuperAdminPage.

// The pragmatic approach: use React.lazy + a hack. But really, the best approach
// is to just export those functions from SuperAdminPage.tsx.
// Let's do that - add exports to the sub-tab functions.

// We'll handle this after writing this file by editing SuperAdminPage.tsx.

// For now, use lazy imports with placeholder:
const LazySuperAdminContent = React.lazy(() =>
  import('./SuperAdminPage').then((mod) => ({
    default: mod.SuperAdminTabContent,
  }))
);

function SuperAdminTabWrapper({ tab }: { tab: string }) {
  return (
    <React.Suspense fallback={<div className="adm-loading"><Loader2 className="spinner" size={32} /><p>Loading...</p></div>}>
      <LazySuperAdminContent activeTab={tab} />
    </React.Suspense>
  );
}

// ============================================================================
// Main Unified Admin Page
// ============================================================================
export const AdminPage: React.FC = () => {
  useDocumentTitle('Admin Dashboard — LaserHub');
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading: authLoading, hasHydrated, logout, checkAuth } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Derive activeTab from URL path: /admin/materials -> "materials"
  const pathSuffix = location.pathname.replace(/^\/admin\/?/, '').replace(/\/$/, '');
  const tabParam = (pathSuffix || null) as TabKey | null;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Redirect to login if not authenticated (only after auth has been verified)
  useEffect(() => {
    if (authLoading || !hasHydrated) return;
    if (!user) {
      navigate('/login');
    }
  }, [user, authLoading, hasHydrated, navigate]);

  // Set default tab from URL or role when no tab param present
  useEffect(() => {
    if (!user) return;
    if (tabParam) return; // URL already has a tab
    const isVendorOrAdmin = isVendor(user) || !!user.is_admin;
    const defaultTab = isVendorOrAdmin ? 'dashboard' : 'profile';
    navigate(`/admin/${defaultTab}`, { replace: true });
  }, [user, tabParam, navigate]);

  const activeTab: TabKey = tabParam || 'profile';

  if (authLoading || !hasHydrated || !user) return null;

  const isVendorOrAdmin = isVendor(user) || !!user.is_admin;
  const userIsSuperAdmin = isSuperAdmin(user);

  // Build navigation items based on role
  const personalItems: NavItem[] = [
    { key: 'profile', label: 'Profile', icon: UserIcon },
    { key: 'my-orders', label: 'My Orders', icon: Package },
    { key: 'my-designs', label: 'My Designs', icon: ImageIcon },
    { key: 'my-invoices', label: 'My Invoices', icon: Receipt },
    { key: 'billing-addresses', label: 'Billing Addresses', icon: MapPin },
    { key: 'my-settings', label: 'Settings', icon: Settings },
  ];

  const vendorItems: NavItem[] = isVendorOrAdmin
    ? [
        { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { key: 'orders', label: 'Orders', icon: Package },
        { key: 'quotes', label: 'Quotes', icon: FileText },
        { key: 'customers', label: 'Customers', icon: UserIcon },
        { key: 'team', label: 'Team', icon: Users },
        { key: 'materials-inventory', label: 'Materials & Inventory', icon: Layers },
        { key: 'reports', label: 'Reports', icon: BarChart2 },
        { key: 'invoices', label: 'Invoices', icon: FileText },
        { key: 'payments', label: 'Payments', icon: CreditCard },
      ]
    : [];

  const superAdminItems: NavItem[] = userIsSuperAdmin
    ? [
        { key: 'sa-overview', label: 'Platform Overview', icon: LayoutDashboard },
        { key: 'sa-users', label: 'Users', icon: Users },
        { key: 'sa-vendors', label: 'Vendors', icon: Store },
        { key: 'sa-designs', label: 'Designs', icon: Palette },
        { key: 'sa-orders', label: 'All Orders', icon: Package },
        { key: 'sa-stats', label: 'Platform Stats', icon: BarChart3 },
      ]
    : [];

  const getInitials = (name: string) =>
    name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/');
  };

  // Determine the title for the sidebar
  const sidebarTitle = userIsSuperAdmin ? 'Admin Panel' : isVendorOrAdmin ? 'Vendor Dashboard' : 'My Account';

  // Render the active tab content
  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return <ProfileTabContent />;
      case 'my-orders':
        return <MyOrdersTabContent />;
      case 'my-designs':
        return <MyDesignsTabContent />;
      case 'my-invoices':
        return <CustomerInvoiceList />;
      case 'billing-addresses':
        return <BillingAddressBook />;
      case 'my-settings':
        return <MySettingsTabContent />;
      case 'dashboard':
        return <AdminDashboard />;
      case 'orders':
        return <OrderKanban />;
      case 'quotes':
        return <QuoteBuilder />;
      case 'customers':
        return <CustomersCRM />;
      case 'team':
        return <TeamPanel />;
      case 'materials-inventory':
        return <MaterialsInventory />;
      case 'reports':
        return <BusinessReports />;
      case 'invoices':
        return <InvoicesPage />;
      case 'payments':
        return <PaymentSettings />;
      case 'sa-overview':
        return <SuperAdminTabWrapper tab="overview" />;
      case 'sa-users':
        return <SuperAdminTabWrapper tab="users" />;
      case 'sa-vendors':
        return <SuperAdminTabWrapper tab="vendors" />;
      case 'sa-designs':
        return <SuperAdminTabWrapper tab="designs" />;
      case 'sa-orders':
        return <SuperAdminTabWrapper tab="orders" />;
      case 'sa-stats':
        return <SuperAdminTabWrapper tab="stats" />;
      default:
        return <ProfileTabContent />;
    }
  };

  const renderNavSection = (items: NavItem[], sectionLabel?: string) => (
    <>
      {sectionLabel && (
        <div className="adm-nav-section-label">{sectionLabel}</div>
      )}
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            to={`/admin/${item.key}`}
            className={`adm-nav-link ${activeTab === item.key ? 'adm-nav-link--active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            <Icon size={18} />
            <span className="adm-nav-label">{item.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="adm-shell">
      <button
        className="adm-mobile-toggle"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label="Toggle sidebar"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`adm-sidebar ${mobileOpen ? 'adm-sidebar--open' : ''}`}>
        <div className="adm-sidebar-brand">
          <div className="adm-sidebar-logo" style={{
            width: 36, height: 36, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem',
            fontWeight: 700, background: 'var(--primary-color)', color: '#fff',
          }}>
            {getInitials(user.name)}
          </div>
          <div className="adm-sidebar-brand-text">
            <span className="adm-sidebar-title">{user.name}</span>
            <span className="adm-sidebar-sub">{sidebarTitle}</span>
          </div>
        </div>

        <nav className="adm-sidebar-nav">
          {renderNavSection(personalItems)}

          {vendorItems.length > 0 && (
            <>
              <div className="adm-nav-divider" />
              {renderNavSection(vendorItems, 'Vendor')}
            </>
          )}

          {superAdminItems.length > 0 && (
            <>
              <div className="adm-nav-divider" />
              {renderNavSection(superAdminItems, 'Super Admin')}
            </>
          )}
        </nav>

        <div className="adm-sidebar-footer">
          <button onClick={handleLogout} className="adm-nav-link adm-nav-link--button">
            <LogOut size={18} />
            <span className="adm-nav-label">Logout</span>
          </button>
          <Link to="/" className="adm-back-link">
            <ArrowLeft size={14} />
            <span>Back to site</span>
          </Link>
        </div>
      </aside>

      {mobileOpen && <div className="adm-backdrop" onClick={() => setMobileOpen(false)} />}

      <main className="adm-main">
        {renderContent()}
      </main>
    </div>
  );
};

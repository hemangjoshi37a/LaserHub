import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Package,
  X,
  Mail,
  Calendar,
  Loader2,
  Star,
  Edit2,
  Trash2,
  Bell,
  Image as ImageIcon,
  FileText,
  Plus,
  Check,
  CheckCircle2,
  CreditCard,
} from 'lucide-react';
import { DashboardLayout } from '../components/DashboardLayout';
import { OrderKanban } from '../components/OrderKanban';
import { QuoteBuilder } from '../components/QuoteBuilder';
import { MaterialsInventory } from './MaterialsInventory';
import { BusinessReports } from './BusinessReports';
import { NotFoundPage } from './NotFoundPage';
import { Invoices as InvoicesPage } from './admin/Invoices';
import { PaymentSettings } from '../components/PaymentSettings';
import { CustomersCRM } from '../components/CustomersCRM';
import { TeamPanel } from '../components/TeamPanel';
import { ReviewModal } from '../components/ReviewModal';
import OrderTrackingPanel from '../components/OrderTrackingPanel';
import { Button, EmptyState } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { BillingAddressBook } from '../components/billing/BillingAddressBook';
import { CustomerInvoiceList } from '../components/invoicing/CustomerInvoiceList';
import { VendorShopManager } from '../components/vendor/VendorShopManager';
import { VendorDashboard } from '../components/VendorDashboard';
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
  | 'sa-stats'
  | 'storefront';



// ============================================================================
// Profile Tab Content
// ============================================================================
function ProfileTabContent() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [stats, setStats] = useState({ orders: 0, designs: 0, quotes: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!user) return;
    const loadStats = async () => {
      try {
        const [orders, designs] = await Promise.all([
          authApi.listMyOrders(),
          designApi.getMyDesigns()
        ]);
        const quotes = savedQuotesStore.load();
        setStats({
          orders: orders.length,
          designs: designs.length,
          quotes: quotes.length
        });
      } catch (err) {
        console.error('Failed to load profile stats');
      } finally {
        setLoadingStats(false);
      }
    };
    loadStats();
  }, [user]);

  if (!user) return null;

  const handleSaveName = () => {
    if (!nameDraft.trim()) return;
    setUser({ ...user, name: nameDraft.trim() });
    setEditingName(false);
    toast.success('Name updated');
  };



  const getInitials = (name: string) =>
    name.split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="adm-page animate-in profile-overview">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Project Overview</h1>
          <p className="adm-page-sub">Welcome back, {user.name.split(' ')[0]}</p>
        </div>
        <div className="adm-header-actions">
           <Button variant="primary" onClick={() => navigate('/upload')} icon={<Plus size={16} />}>New Project</Button>
        </div>
      </header>

      <div className="profile-hero">
        <div className="profile-hero-content">
          <div className="profile-avatar-lg">
            {getInitials(user.name)}
          </div>
          <div className="profile-info-main">
            {editingName ? (
              <div className="edit-name-group">
                <input
                  type="text"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  autoFocus
                />
                <button onClick={handleSaveName}><Check size={16} /></button>
                <button onClick={() => setEditingName(false)}><X size={16} /></button>
              </div>
            ) : (
              <h2 className="profile-name" onClick={() => setEditingName(true)}>
                {user.name} <Edit2 size={16} className="edit-icon" />
              </h2>
            )}
            <p className="profile-email">{user.email}</p>
            <div className="profile-badges">
              <span className="role-badge">{formatRole(user.role, user.is_admin)}</span>
              {user.is_verified && <span className="verified-badge"><CheckCircle2 size={12} /> Verified</span>}
            </div>
          </div>
        </div>
      </div>

      <div className="profile-stats-row">
        <div className="stat-item" onClick={() => navigate('/dashboard/my-orders')}>
          <div className="stat-icon"><Package size={20} /></div>
          <div className="stat-data">
            <span className="stat-value">{loadingStats ? '...' : stats.orders}</span>
            <span className="stat-label">Total Orders</span>
          </div>
        </div>
        <div className="stat-item" onClick={() => navigate('/dashboard/my-designs')}>
          <div className="stat-icon"><ImageIcon size={20} /></div>
          <div className="stat-data">
            <span className="stat-value">{loadingStats ? '...' : stats.designs}</span>
            <span className="stat-label">Design Library</span>
          </div>
        </div>
        <div className="stat-item" onClick={() => navigate('/dashboard/my-orders')}>
          <div className="stat-icon"><FileText size={20} /></div>
          <div className="stat-data">
            <span className="stat-value">{loadingStats ? '...' : stats.quotes}</span>
            <span className="stat-label">Saved Quotes</span>
          </div>
        </div>
      </div>

      <div className="profile-content-grid">
        <div className="profile-main-column">
          <div className="adm-card">
            <div className="adm-card-header">
              <h3 className="adm-card-title">Recent Activity</h3>
            </div>
            <div className="activity-list">
              {stats.orders > 0 ? (
                <div className="activity-item">
                  <div className="activity-dot"></div>
                  <div className="activity-content">
                    <p>You have <strong>{stats.orders}</strong> total orders. Keep track of your laser cutting projects here.</p>
                    <Link to="/dashboard/my-orders" className="text-link">View Order History</Link>
                  </div>
                </div>
              ) : (
                <div className="activity-empty">
                  <p>No recent activity. Start your first project today!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="profile-side-column">
          <div className="adm-card">
            <h3 className="card-title">Account Security</h3>
            <div className="security-item">
              <div className="icon-box"><Mail size={16} /></div>
              <div className="info">
                <div className="label">Email Address</div>
                <div className="value">{user.email}</div>
              </div>
            </div>
            <div className="security-item">
              <div className="icon-box"><Calendar size={16} /></div>
              <div className="info">
                <div className="label">Member Since</div>
                <div className="value">{new Date(user.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/my-settings')} fullWidth style={{ marginTop: '1rem' }}>
              Manage Settings
            </Button>
          </div>
        </div>
      </div>

      <style>{`
        .profile-hero {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 2rem;
          margin-bottom: 1.5rem;
          position: relative;
          overflow: hidden;
        }
        .profile-hero::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, var(--dash-accent), var(--dash-accent-soft));
        }
        .profile-hero-content {
          display: flex;
          align-items: center;
          gap: 2rem;
        }
        .profile-avatar-lg {
          width: 80px;
          height: 80px;
          background: var(--dash-accent-soft);
          color: var(--dash-accent);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 800;
          border: 4px solid var(--card-bg);
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}
        .profile-name {
          font-size: 1.5rem;
          font-weight: 800;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }
        .edit-icon {
          opacity: 0;
          transition: opacity 0.2s;
          color: var(--text-tertiary);
        }
        .profile-name:hover .edit-icon {
          opacity: 1;
        }
        .profile-email {
          color: var(--text-secondary);
          margin: 0.25rem 0 0.75rem 0;
        }
        .profile-badges {
          display: flex;
          gap: 0.5rem;
        }
        .role-badge {
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          background: var(--bg-secondary);
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          color: var(--text-secondary);
        }
        .verified-badge {
          font-size: 0.7rem;
          font-weight: 700;
          background: rgba(34, 197, 94, 0.15);
          color: #4ade80;
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }

        .profile-stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }
        .stat-item {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          align-items: center;
          gap: 1rem;
          cursor: pointer;
          transition: transform 0.2s, border-color 0.2s;
        }
        .stat-item:hover {
          transform: translateY(-2px);
          border-color: var(--dash-accent);
        }
        .stat-icon {
          width: 44px;
          height: 44px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .stat-value {
          display: block;
          font-size: 1.25rem;
          font-weight: 800;
        }
        .stat-label {
          font-size: 0.8rem;
          color: var(--text-tertiary);
          font-weight: 600;
        }

        .profile-content-grid {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 1.5rem;
        }
        .security-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .security-item .icon-box {
          width: 36px;
          height: 36px;
          background: var(--bg-secondary);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
        }
        .security-item .label {
          font-size: 0.7rem;
          color: var(--text-tertiary);
          font-weight: 700;
          text-transform: uppercase;
        }
        .security-item .value {
          font-size: 0.85rem;
          font-weight: 600;
          word-break: break-all;
        }

        .activity-list {
          padding: 1.5rem;
        }
        .activity-item {
          display: flex;
          gap: 1rem;
          position: relative;
        }
        .activity-dot {
          width: 10px;
          height: 10px;
          background: var(--dash-accent);
          border-radius: 50%;
          margin-top: 5px;
          flex-shrink: 0;
        }
        .activity-content p {
          font-size: 0.9rem;
          margin: 0 0 0.5rem 0;
          line-height: 1.5;
        }
        .text-link {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--dash-accent);
          text-decoration: none;
        }

        .edit-name-group {
          display: flex;
          gap: 0.5rem;
        }
        .edit-name-group input {
          font-size: 1.25rem;
          font-weight: 800;
          background: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--dash-accent);
          border-radius: 6px;
          padding: 0.25rem 0.5rem;
          width: 250px;
        }
        .edit-name-group button {
          background: var(--dash-accent);
          color: white;
          border: none;
          border-radius: 6px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }

        @media (max-width: 900px) {
          .profile-content-grid {
            grid-template-columns: 1fr;
          }
          .profile-stats-row {
            grid-template-columns: 1fr;
            gap: 0.75rem;
          }
        }
      `}</style>
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
                        {['pending_payment', 'pending'].includes(order.status) && (
                          <button
                            className="sa-btn sa-btn--primary-sm"
                            onClick={() => toast.info('Payment app not added. Please contact support for offline payment.', {
                              icon: <CreditCard size={14} />,
                              duration: 5000
                            })}
                          >
                            Pay Now
                          </button>
                        )}
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
  useDocumentTitle('Dashboard — LaserHub');
  const { user, isLoading: authLoading, hasHydrated, checkAuth } = useAuthStore();
  
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split('/').filter(Boolean);
  // If we are at exactly /admin or /dashboard, tabParam should be null to trigger redirect
  const isBaseRoute = pathParts.length === 1 && (pathParts[0] === 'admin' || pathParts[0] === 'dashboard');
  const isVendorBase = pathParts.length === 2 && pathParts[0] === 'vendor' && pathParts[1] === 'dashboard';
  
  const tabParam = (isBaseRoute || isVendorBase) ? null : (pathParts[pathParts.length - 1] as TabKey);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!hasHydrated || authLoading) return;

    if (!user) {
      navigate('/login');
      return;
    }

    // Tab authorization helper
    const isAuthorized = (t: TabKey | null) => {
      if (!user || !t) return false;
      const validTabs: TabKey[] = [
        'profile', 'my-orders', 'my-designs', 'my-invoices', 'billing-addresses', 'my-settings',
        'dashboard', 'orders', 'quotes', 'customers', 'team', 'materials-inventory', 'reports', 'invoices', 'payments',
        'sa-overview', 'sa-users', 'sa-vendors', 'sa-designs', 'sa-orders', 'sa-stats', 'storefront'
      ];
      if (!validTabs.includes(t)) return false;

      if (['profile', 'my-orders', 'my-designs', 'billing-addresses', 'my-settings', 'my-invoices'].includes(t)) return true;
      if (['dashboard', 'orders', 'quotes', 'customers', 'team', 'materials-inventory', 'reports', 'invoices', 'payments'].includes(t)) return isVendor(user);
      if (t.startsWith('sa-') || t === 'storefront') return isSuperAdmin(user);
      return true;
    };

    const basePath = location.pathname.startsWith('/vendor/dashboard') ? '/vendor/dashboard' : (location.pathname.startsWith('/admin') ? '/admin' : '/dashboard');

    // If current tab is unauthorized, redirect to default
    if (!tabParam || !isAuthorized(tabParam)) {
      console.warn(`[AdminPage] Unauthorized or invalid access to tab: ${tabParam}. Redirecting.`);
      const target = isSuperAdmin(user) ? 'sa-overview' : (isVendor(user) ? 'dashboard' : 'profile');
      navigate(`${basePath}/${target}`, { replace: true });
    }
  }, [user, tabParam, navigate, hasHydrated, authLoading]);

  const activeTab: TabKey = tabParam || 'profile';

  if (authLoading || !hasHydrated || !user) return null;

  const renderContent = (tab: TabKey) => {
    // Proactive permission check
    const isAuthorized = (t: TabKey) => {
      const validTabs: TabKey[] = [
        'profile', 'my-orders', 'my-designs', 'my-invoices', 'billing-addresses', 'my-settings',
        'dashboard', 'orders', 'quotes', 'customers', 'team', 'materials-inventory', 'reports', 'invoices', 'payments',
        'sa-overview', 'sa-users', 'sa-vendors', 'sa-designs', 'sa-orders', 'sa-stats', 'storefront'
      ];
      if (!validTabs.includes(t)) return false;

      if (!user) return false;
      if (['profile', 'my-orders', 'my-designs', 'billing-addresses', 'my-settings', 'my-invoices'].includes(t)) return true;
      if (['dashboard', 'orders', 'quotes', 'customers', 'team', 'materials-inventory', 'reports', 'invoices', 'payments'].includes(t)) return isVendor(user);
      if (t.startsWith('sa-') || t === 'storefront') return isSuperAdmin(user);
      return true;
    };

    if (!isAuthorized(tab)) {
      return <ProfileTabContent />;
    }

    switch (tab) {
      case 'dashboard':
        return <VendorDashboard />;
      case 'orders': 
        return <OrderKanban isVendorView={isVendor(user) && !isSuperAdmin(user)} />;
      case 'quotes': 
        return <QuoteBuilder />;
      case 'customers': 
        return <CustomersCRM />;
      case 'team': 
        return <TeamPanel />;
      case 'materials-inventory': 
        return <MaterialsInventory />;
      case 'reports': 
        return <BusinessReports vendorMode={isVendor(user) && !isSuperAdmin(user)} />;

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
      case 'storefront': 
        return <VendorShopManager />;
      case 'my-orders':
        return <MyOrdersTabContent />;
      case 'my-designs':
        return <MyDesignsTabContent />;
      case 'my-settings':
        return <MySettingsTabContent />;
      case 'billing-addresses':
        return <BillingAddressBook />;
      case 'my-invoices':
        return <CustomerInvoiceList />;
      case 'profile':
        return <ProfileTabContent />;
      default:
        return <NotFoundPage />;


    }
  };

  return (
    <DashboardLayout>
      <div className="dash-animate">
        {renderContent(activeTab)}
      </div>
    </DashboardLayout>
  );
};

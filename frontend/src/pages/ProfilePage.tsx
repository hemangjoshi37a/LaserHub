import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { authApi, designApi, Order, DesignItem } from '../services';
import {
  Mail,
  Calendar,
  Package,
  Clock,
  ChevronRight,
  Loader2,
  LogOut,
  Star,
  User as UserIcon,
  Settings,
  Image as ImageIcon,
  Edit2,
  Save,
  X,
  Trash2,
  Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import { ReviewModal } from '../components/ReviewModal';
import { EmptyState } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

type TabKey = 'profile' | 'orders' | 'designs' | 'settings';

export const ProfilePage: React.FC = () => {
  useDocumentTitle('Profile — LaserHub');
  const { user, isLoading: authLoading, hasHydrated, logout, checkAuth, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>('profile');

  const [orders, setOrders] = useState<Order[]>([]);
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);
  const [isLoadingDesigns, setIsLoadingDesigns] = useState(false);
  const [designsLoaded, setDesignsLoaded] = useState(false);

  const [reviewOrderId, setReviewOrderId] = useState<number | null>(null);
  const [reviewedOrders, setReviewedOrders] = useState<Set<number>>(new Set());

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  // On mount, ensure auth state is rehydrated before redirecting
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    // Wait for auth rehydration/verification before making redirect decisions
    if (authLoading || !hasHydrated) return;
    if (!user) {
      navigate('/login');
      return;
    }
    setNameDraft(user.name);
    const fetchOrders = async () => {
      try {
        const data = await authApi.listMyOrders();
        setOrders(data);
      } catch (error) {
        console.error('Failed to fetch orders:', error);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    fetchOrders();
  }, [user, authLoading, hasHydrated, navigate]);

  // Lazy-load designs when tab opens
  useEffect(() => {
    if (tab !== 'designs' || designsLoaded || !user) return;
    setIsLoadingDesigns(true);
    designApi
      .getMyDesigns()
      .then((d) => setDesigns(d))
      .catch((e) => console.error('Failed to load designs:', e))
      .finally(() => {
        setIsLoadingDesigns(false);
        setDesignsLoaded(true);
      });
  }, [tab, designsLoaded, user]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const handleSaveName = () => {
    if (!user || !nameDraft.trim()) return;
    // Optimistic local-only update (backend endpoint not yet wired)
    setUser({ ...user, name: nameDraft.trim() });
    setEditingName(false);
    toast.success('Name updated');
  };

  const handleDeleteAccount = () => {
    const confirmed = window.confirm(
      'Delete your account? This cannot be undone and will remove your orders and designs.'
    );
    if (!confirmed) return;
    toast.error('Account deletion is not yet available. Contact support.');
  };

  if (authLoading || !hasHydrated || !user) return null;

  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'profile', label: 'Profile', icon: <UserIcon size={16} /> },
    { key: 'orders', label: 'Orders', icon: <Package size={16} /> },
    { key: 'designs', label: 'Designs', icon: <ImageIcon size={16} /> },
    { key: 'settings', label: 'Settings', icon: <Settings size={16} /> },
  ];

  return (
    <div className="profile-page prof-page">
      <div className="profile-container prof-container">
        <div className="profile-header-card prof-header">
          <div className="profile-avatar-large prof-avatar">{getInitials(user.name)}</div>
          <div className="profile-header-info prof-header-info">
            <h1>{user.name}</h1>
            <div className="profile-meta prof-meta">
              <span>
                <Mail size={14} /> {user.email}
              </span>
              <span>
                <Calendar size={14} /> Joined{' '}
                {new Date(user.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {user.is_admin && <span className="profile-admin-badge prof-badge">Admin</span>}
            </div>
          </div>
        </div>

        <div className="prof-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              className={`prof-tab ${tab === t.key ? 'prof-tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Profile tab */}
        {tab === 'profile' && (
          <div className="prof-panel">
            <div className="prof-field">
              <label>Name</label>
              {editingName ? (
                <div className="prof-field-edit">
                  <input
                    type="text"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                  <button className="prof-btn prof-btn-primary" onClick={handleSaveName}>
                    <Save size={14} /> Save
                  </button>
                  <button
                    className="prof-btn"
                    onClick={() => {
                      setEditingName(false);
                      setNameDraft(user.name);
                    }}
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              ) : (
                <div className="prof-field-view">
                  <span>{user.name}</span>
                  <button className="prof-btn" onClick={() => setEditingName(true)}>
                    <Edit2 size={14} /> Edit
                  </button>
                </div>
              )}
            </div>

            <div className="prof-field">
              <label>Email</label>
              <div className="prof-field-view">
                <span>{user.email}</span>
                <span className="prof-field-hint">Contact support to change</span>
              </div>
            </div>

            <div className="prof-field">
              <label>Joined</label>
              <div className="prof-field-view">
                <span>
                  {new Date(user.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>

            <div className="prof-field">
              <label>Role</label>
              <div className="prof-field-view">
                <span className="prof-badge">{user.is_admin ? 'Admin' : 'Customer'}</span>
              </div>
            </div>

            <div className="prof-panel-footer">
              <button onClick={handleLogout} className="prof-btn prof-btn-ghost">
                <LogOut size={14} /> Logout
              </button>
            </div>
          </div>
        )}

        {/* Orders tab */}
        {tab === 'orders' && (
          <div className="prof-panel">
            <div className="profile-section-header">
              <h2>
                <Package size={20} /> Order History
              </h2>
              <span className="profile-order-count">{orders.length} orders</span>
            </div>
            {isLoadingOrders ? (
              <div className="profile-loading">
                <Loader2 className="animate-spin" size={32} />
                <p>Loading orders...</p>
              </div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon={<Package size={40} />}
                title="No orders yet"
                description="Upload a design, pick a material, and place your first order."
                action={
                  <Link to="/upload" className="prof-btn prof-btn-primary">
                    Start a new order
                  </Link>
                }
              />
            ) : (
              <div className="orders-list">
                {orders.map((order) => (
                  <div key={order.id} className="order-card">
                    <div className="order-info">
                      <div className="order-main">
                        <span className="order-number">#{order.order_number}</span>
                        <span className={`order-status status-${order.status}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="order-meta">
                        <span>
                          <Calendar size={14} />
                          {new Date(order.created_at).toLocaleDateString()}
                        </span>
                        <span>
                          <Clock size={14} />
                          {order.material_name} ({order.thickness_mm}mm)
                        </span>
                      </div>
                    </div>
                    <div className="order-actions-col">
                      {order.status === 'completed' && !reviewedOrders.has(order.id) && (
                        <button
                          className="review-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReviewOrderId(order.id);
                          }}
                          title="Leave a review"
                        >
                          <Star size={14} /> Review
                        </button>
                      )}
                      {reviewedOrders.has(order.id) && (
                        <span className="review-submitted-badge">Reviewed</span>
                      )}
                      <div className="order-total">
                        <span>{formatPrice(order.total_amount)}</span>
                        <ChevronRight size={20} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Designs tab */}
        {tab === 'designs' && (
          <div className="prof-panel">
            <div className="profile-section-header">
              <h2>
                <ImageIcon size={20} /> My Designs
              </h2>
              <span className="profile-order-count">{designs.length} designs</span>
            </div>
            {isLoadingDesigns ? (
              <div className="profile-loading">
                <Loader2 className="animate-spin" size={32} />
                <p>Loading designs...</p>
              </div>
            ) : designs.length === 0 ? (
              <EmptyState
                icon={<ImageIcon size={40} />}
                title="No saved designs"
                description="Upload a design and save it to reuse later or share with the community."
                action={
                  <Link to="/upload" className="prof-btn prof-btn-primary">
                    Upload a design
                  </Link>
                }
              />
            ) : (
              <div className="prof-designs-grid">
                {designs.map((d) => (
                  <Link
                    key={d.id}
                    to={`/design/${d.id}`}
                    className="prof-design-card"
                  >
                    <div className="prof-design-thumb">
                      {d.thumbnail_url ? (
                        <img src={d.thumbnail_url} alt={d.title} />
                      ) : (
                        <ImageIcon size={32} />
                      )}
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
        )}

        {/* Settings tab */}
        {tab === 'settings' && (
          <div className="prof-panel">
            <h2 className="prof-panel-title">
              <Settings size={18} /> Settings
            </h2>

            <div className="prof-settings-group">
              <h3>
                <Bell size={14} /> Notifications
              </h3>
              <label className="prof-toggle">
                <input
                  type="checkbox"
                  checked={emailNotifs}
                  onChange={(e) => setEmailNotifs(e.target.checked)}
                />
                <span>Order updates &amp; shipping notifications</span>
              </label>
              <label className="prof-toggle">
                <input
                  type="checkbox"
                  checked={marketingEmails}
                  onChange={(e) => setMarketingEmails(e.target.checked)}
                />
                <span>Product updates and newsletter</span>
              </label>
            </div>

            <div className="prof-settings-group prof-danger-zone">
              <h3>Danger zone</h3>
              <p>Permanently delete your LaserHub account and all associated data.</p>
              <button className="prof-btn prof-btn-danger" onClick={handleDeleteAccount}>
                <Trash2 size={14} /> Delete account
              </button>
            </div>
          </div>
        )}

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
      </div>
    </div>
  );
};

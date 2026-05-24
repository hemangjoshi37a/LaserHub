import React, { useEffect, useState, useMemo } from 'react';
import { 
  Package,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus
} from 'lucide-react';
import { vendorApi, type VendorMaterialItem, type VendorProfile } from '../services';
import { api } from '../services/api';
import { toast } from 'sonner';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { Skeleton } from './Skeleton';
import { Button } from './ui';
import { Link, useNavigate } from 'react-router-dom';

export const VendorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [materials, setMaterials] = useState<VendorMaterialItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currency } = useCurrencyStore();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, ordersData] = await Promise.all([
        vendorApi.getVendorStats(),
        vendorApi.getVendorOrders()
      ]);
      setStats(statsData);
      setOrders(ordersData);

      // Profile (turnaround, rating) + inventory are best-effort: if these
      // secondary calls fail we still render the dashboard with neutral
      // placeholders instead of a hard error.
      try {
        const { data: profileData } = await api.get<VendorProfile>('/vendors/me');
        setProfile(profileData);
        try {
          const mats = await vendorApi.getVendorMaterials(profileData.id);
          setMaterials(mats);
        } catch {
          setMaterials(null);
        }
      } catch {
        setProfile(null);
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      console.error('VendorDashboard load error:', detail);
      setError(detail);
      toast.error(`Failed to load dashboard: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // Real metrics derived from loaded data ---------------------------------
  const COMPLETED_STATUSES = ['completed', 'delivered', 'shipped'];

  // Fulfillment rate = completed orders / total orders. No orders => no data.
  const fulfillment = useMemo(() => {
    if (!orders || orders.length === 0) return null;
    const done = orders.filter((o) =>
      COMPLETED_STATUSES.includes(String(o.status || '').toLowerCase())
    ).length;
    return Math.round((done / orders.length) * 100);
  }, [orders]);

  // Average turnaround comes from the vendor profile (real field).
  const turnaround = profile?.avg_turnaround_days ?? null;

  // Customer rating (out of 5) from real review data.
  const rating = profile?.rating ?? stats?.rating ?? 0;
  const totalReviews = profile?.total_reviews ?? stats?.total_reviews ?? 0;
  const hasReviews = totalReviews > 0 && rating > 0;

  // Out-of-stock materials for inventory alerts.
  const outOfStock = useMemo(
    () => (materials ? materials.filter((m) => !m.is_in_stock) : []),
    [materials]
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'warning';
      case 'paid': return 'success';
      case 'in_production': return 'info';
      case 'completed': return 'success';
      case 'cancelled': return 'error';
      default: return 'default';
    }
  };

  if (error) {
    return (
      <div className="adm-page animate-in">
        <div className="adm-card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <AlertCircle size={48} color="var(--color-danger)" style={{ marginBottom: '1.5rem', opacity: 0.8 }} />
          <h2 className="adm-card-title">Dashboard Unavailable</h2>
          <p className="adm-page-sub" style={{ marginBottom: '2rem', maxWidth: '400px', margin: '0 auto 2rem' }}>
            {error}
          </p>
          <Button onClick={loadData} variant="primary">Retry Loading</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="adm-page animate-in">
        <header className="adm-page-header">
          <Skeleton width="200px" height="2rem" />
        </header>
        <div className="adm-stats-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="100px" borderRadius="12px" />
          ))}
        </div>
        <div className="adm-card">
          <Skeleton height="300px" borderRadius="12px" />
        </div>
      </div>
    );
  }

  return (
    <div className="adm-page animate-in vendor-dashboard">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Mission Control</h1>
          <p className="adm-page-sub">Operational overview of your shop</p>
        </div>
        <div className="adm-header-actions">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/vendor/dashboard/reports')}
          >
            Export Report
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => navigate('/upload')}
          >
            Manual Order
          </Button>
        </div>
      </header>

      <div className="adm-stats-grid">
        <div className="adm-stat-card">
          <div className="adm-stat-icon"><Package size={20} /></div>
          <div>
            <p className="adm-stat-label">Active Orders</p>
            <p className="adm-stat-value">{stats?.pending_orders || 0}</p>
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-icon success"><DollarSign size={20} /></div>
          <div>
            <p className="adm-stat-label">Revenue</p>
            <p className="adm-stat-value">{formatPrice(stats?.total_revenue || 0, currency)}</p>
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-icon info"><Clock size={20} /></div>
          <div>
            <p className="adm-stat-label">Avg. Turnaround</p>
            <p className="adm-stat-value">
              {turnaround != null ? `${turnaround.toFixed(1)} Days` : '—'}
            </p>
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-icon warning"><AlertCircle size={20} /></div>
          <div>
            <p className="adm-stat-label">Avg. Rating</p>
            <p className="adm-stat-value">
              {hasReviews ? `${rating.toFixed(1)}/5` : 'No reviews yet'}
            </p>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="adm-card recent-orders">
          <div className="adm-card-header">
            <h2 className="adm-card-title">Recent Orders</h2>
            <Link to="/vendor/dashboard/orders" className="view-all">View All <ArrowRight size={14} /></Link>
          </div>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>Payout</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 5).map((order) => (
                  <tr key={order.id}>
                    <td className="adm-cell-accent">{order.order_number}</td>
                    <td>
                      <div className="adm-cell-bold">{order.customer_name}</div>
                      <div className="adm-cell-sub">{new Date(order.created_at).toLocaleDateString()}</div>
                    </td>
                    <td>
                      <span className={`adm-status-badge adm-status-badge--${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="adm-cell-bold">{formatPrice(order.vendor_cost, currency)}</td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="adm-empty-row">No orders yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-side">
          <div className="adm-card performance-card">
            <h3 className="card-title">Shop Performance</h3>
            <div className="perf-metric">
              <div className="label">Fulfillment Rate</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${fulfillment ?? 0}%` }}></div>
              </div>
              <div className="value">{fulfillment != null ? `${fulfillment}%` : 'No data yet'}</div>
            </div>
            <div className="perf-metric">
              <div className="label">On-time Delivery</div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: '0%', background: '#10b981' }}></div>
              </div>
              <div className="value">No data yet</div>
            </div>
            <div className="perf-metric">
              <div className="label">Customer Satisfaction</div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${hasReviews ? (rating / 5) * 100 : 0}%`, background: '#6366f1' }}
                ></div>
              </div>
              <div className="value">
                {hasReviews ? `${rating.toFixed(1)}/5 (${totalReviews})` : 'No reviews yet'}
              </div>
            </div>
          </div>

          <div className="adm-card inventory-alert-card">
            <h3 className="card-title">Inventory Alerts</h3>
            <div className="alert-list">
              {materials == null ? (
                <div className="alert-item">
                  <AlertCircle size={16} />
                  <span>No inventory data</span>
                </div>
              ) : outOfStock.length > 0 ? (
                outOfStock.map((m) => (
                  <div key={m.id} className="alert-item warning">
                    <AlertCircle size={16} />
                    <span>
                      {(m.material_name || 'Material')} {m.thickness_mm}mm is out of stock
                    </span>
                  </div>
                ))
              ) : (
                <div className="alert-item">
                  <CheckCircle2 size={16} />
                  <span>All materials in stock</span>
                </div>
              )}
            </div>
            <Link to="/vendor/dashboard/materials-inventory" className="btn-link">Manage Inventory</Link>
          </div>
        </div>
      </div>

      <style>{`
        .vendor-dashboard .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          margin-top: 1.5rem;
        }
        
        .recent-orders {
          margin: 0;
        }

        .dashboard-side {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .card-title {
          font-size: 1rem;
          font-weight: 700;
          margin-bottom: 1.25rem;
        }

        .view-all {
          font-size: 0.85rem;
          color: var(--dash-accent);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          text-decoration: none;
          font-weight: 700;
        }

        .perf-metric {
          margin-bottom: 1rem;
        }
        .perf-metric .label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 0.4rem;
        }
        .progress-bar {
          height: 6px;
          background: var(--bg-secondary);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 0.25rem;
        }
        .progress-fill {
          height: 100%;
          background: var(--dash-accent);
        }
        .perf-metric .value {
          font-size: 0.85rem;
          font-weight: 700;
          text-align: right;
        }

        .alert-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }
        .alert-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .alert-item.warning {
          color: #b45309;
        }
        
        .btn-link {
          font-size: 0.85rem;
          color: var(--dash-accent);
          text-decoration: none;
          font-weight: 700;
        }

        @media (max-width: 1024px) {
          .vendor-dashboard .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

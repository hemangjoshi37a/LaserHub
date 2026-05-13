import React, { useEffect, useMemo, useState } from 'react';
import {
  Package,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CalendarDays,
} from 'lucide-react';
import { adminApi, type Order } from '../services';
import { api, API_URL } from '../services/api';
import type { AxiosError } from 'axios';
import { toast } from 'sonner';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { Skeleton } from './Skeleton';
import { ErrorState } from './ErrorState';
import OrderTrackingPanel from './OrderTrackingPanel';

type StatusFilter = 'all' | 'pending' | 'in_production' | 'completed' | 'cancelled' | 'paid';

function displayCustomer(name?: string | null, email?: string | null): { primary: string; secondary: string | null } {
  const cleanName = (name || '').trim();
  const looksLikeGibberish = cleanName.length < 3
    || /^[a-z]{1,6}$/i.test(cleanName)        // very short alphabetical
    || /^[qwertyuiopasdfghjklzxcvbnm]+$/i.test(cleanName) && cleanName.length < 10  // keyboard mash
    || cleanName === 'Test User';
  if (looksLikeGibberish) {
    return { primary: email || '—', secondary: cleanName || null };
  }
  return { primary: cleanName, secondary: email || null };
}

const STATUS_CHIPS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'paid', label: 'Paid' },
  { key: 'in_production', label: 'In Production' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const { currency } = useCurrencyStore();

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const hasDateParams = Object.keys(params).length > 0;
      // When a date range is set, pass through to the dashboard endpoint so the
      // backend can scope the recent_orders list. When none is set, fall back
      // to the existing wrapper for backwards compatibility.
      const data = hasDateParams
        ? (await api.get('/admin/dashboard', { params })).data
        : await adminApi.getDashboard();
      setStats(data);
    } catch (error) {
      setLoadError(true);
      const axErr = error as AxiosError<{ detail?: string }>;
      toast.error("Couldn't load dashboard", {
        description: axErr?.response?.data?.detail,
      });
    } finally {
      setLoading(false);
    }
  };

  const buildExportUrl = () => {
    const qs = new URLSearchParams();
    if (dateFrom) qs.set('from', dateFrom);
    if (dateTo) qs.set('to', dateTo);
    if (statusFilter && statusFilter !== 'all') qs.set('status', statusFilter);
    const query = qs.toString();
    return `${API_URL}/admin/orders/export${query ? `?${query}` : ''}`;
  };

  const handleExportCsv = () => {
    // Navigate to the export URL; browser will download the CSV directly.
    window.location.href = buildExportUrl();
  };

  const updateOrderStatus = async (orderId: number, status: string) => {
    try {
      let trackingData = {};
      if (status === 'completed') {
        const carrier = window.prompt('Enter carrier (e.g. UPS):', 'UPS');
        const tracking = window.prompt('Enter tracking number:');
        if (carrier && tracking) {
          trackingData = { carrier, tracking_number: tracking };
        }
      }
      await adminApi.updateOrder(orderId, { status, ...trackingData });
      toast.success('Order updated');
      loadDashboard();
    } catch (error) {
      const axErr = error as AxiosError<{ detail?: string }>;
      toast.error("Couldn't update order", {
        description: axErr?.response?.data?.detail,
      });
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'warning',
      quoted: 'info',
      accepted: 'info',
      paid: 'success',
      in_production: 'info',
      shipped: 'info',
      completed: 'success',
      cancelled: 'error',
      rejected: 'error',
    };
    return colors[status] || 'default';
  };

  const filteredOrders = useMemo<Order[]>(() => {
    if (!stats?.recent_orders) return [];
    const recent = stats.recent_orders as Order[];
    if (statusFilter === 'all') return recent;
    return recent.filter((o) => o.status === statusFilter);
  }, [stats, statusFilter]);

  if (loading) {
    return (
      <div className="adm-page animate-in" aria-busy="true" aria-label="Loading dashboard">
        <header className="adm-page-header">
          <div>
            <h1 className="adm-page-title">Dashboard</h1>
            <p className="adm-page-sub">Overview of your orders and revenue</p>
          </div>
        </header>
        <div className="adm-stats-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="adm-stat-card">
              <Skeleton width="40px" height="40px" borderRadius="8px" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <Skeleton height="0.8rem" width="50%" />
                <Skeleton height="1.25rem" width="70%" />
              </div>
            </div>
          ))}
        </div>
        <div className="adm-card">
          <div className="adm-card-header">
            <h2 className="adm-card-title"><CalendarDays size={18} /> Recent Orders</h2>
          </div>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height="2.5rem" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="adm-page animate-in">
        <ErrorState message="Couldn't load dashboard" onRetry={() => loadDashboard()} />
      </div>
    );
  }

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Dashboard</h1>
          <p className="adm-page-sub">Overview of your orders and revenue</p>
        </div>
      </header>

      <div className="adm-stats-grid">
        <div className="adm-stat-card">
          <div className="adm-stat-icon"><Package size={20} /></div>
          <div>
            <p className="adm-stat-label">Total Orders</p>
            <p className="adm-stat-value">{stats?.total_orders || 0}</p>
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-icon adm-stat-icon--warning"><AlertCircle size={20} /></div>
          <div>
            <p className="adm-stat-label">Pending</p>
            <p className="adm-stat-value">{stats?.pending_orders || 0}</p>
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-icon adm-stat-icon--success"><DollarSign size={20} /></div>
          <div>
            <p className="adm-stat-label">Revenue</p>
            <p className="adm-stat-value">{formatPrice(stats?.total_revenue || 0, currency)}</p>
          </div>
        </div>
        <div className="adm-stat-card">
          <div className="adm-stat-icon adm-stat-icon--info"><TrendingUp size={20} /></div>
          <div>
            <p className="adm-stat-label">This Month</p>
            <p className="adm-stat-value">{formatPrice(stats?.monthly_revenue || 0, currency)}</p>
          </div>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h2 className="adm-card-title">
            <CalendarDays size={18} /> Recent Orders
          </h2>
        </div>

        <div
          className="adm-filter-chips"
          style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}
        >
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.key}
              className={`adm-chip ${statusFilter === chip.key ? 'adm-chip--active' : ''}`}
              onClick={() => setStatusFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginLeft: 'auto',
              flexWrap: 'wrap',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="adm-status-select"
                aria-label="Filter orders from date"
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
              To
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="adm-status-select"
                aria-label="Filter orders to date"
              />
            </label>
            <button
              type="button"
              className="sa-btn sa-btn--ghost-sm"
              onClick={handleExportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Order #</th>
                <th style={{ width: '22%' }}>Customer</th>
                <th style={{ width: '22%' }}>Details</th>
                <th style={{ width: '12%' }}>Amount</th>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ width: '10%' }}>Date</th>
                <th style={{ width: '8%' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="adm-empty-row">No orders to show.</td>
                </tr>
              )}
              {filteredOrders.map((order) => (
                <tr key={order.id} className="adm-row">
                  <td className="adm-cell-accent">{order.order_number}</td>
                  <td>
                    {(() => {
                      const { primary, secondary } = displayCustomer(order.customer_name, order.customer_email);
                      return (
                        <>
                          <div className="adm-cell-bold">{primary}</div>
                          {secondary && <div className="adm-cell-sub">{secondary}</div>}
                        </>
                      );
                    })()}
                  </td>
                  <td>
                    <div className="adm-cell-medium">{order.material_name}</div>
                    <div className="adm-cell-sub">{order.thickness_mm}mm / Qty: {order.quantity}</div>
                  </td>
                  <td className="adm-cell-bold">{formatPrice(order.total_amount, currency)}</td>
                  <td>
                    <span className={`adm-status-badge adm-status-badge--${getStatusColor(order.status)}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="adm-cell-sub">{new Date(order.created_at).toLocaleDateString()}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <select
                        value={order.status}
                        onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                        className="adm-status-select"
                      >
                        <option value="pending">Pending</option>
                        <option value="quoted">Quoted</option>
                        <option value="accepted">Accepted</option>
                        <option value="paid">Paid</option>
                        <option value="in_production">In Production</option>
                        <option value="shipped">Shipped</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="rejected">Rejected</option>
                      </select>
                      <button
                        className="sa-btn sa-btn--ghost-sm"
                        onClick={() => setTrackingOrderId(order.id)}
                        title="Track / post update"
                      >
                        Track
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {trackingOrderId !== null && (
        <OrderTrackingPanel
          orderId={trackingOrderId}
          isVendorView
          onClose={() => setTrackingOrderId(null)}
        />
      )}
    </div>
  );
};

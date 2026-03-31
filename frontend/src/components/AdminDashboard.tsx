import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  DollarSign, 
  TrendingUp,
  LogOut,
  AlertCircle,
  Loader,
  BarChart2,
  Layers,
} from 'lucide-react';
import { adminApi } from '../services';
import { toast } from 'sonner';

export const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const data = await adminApi.getDashboard();
      setStats(data);
    } catch (error: any) {
      toast.error('Failed to load dashboard');
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    navigate('/admin');
    toast.success('Logged out successfully');
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
    } catch (error: any) {
      toast.error('Failed to update order');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'warning',
      paid: 'success',
      in_production: 'info',
      completed: 'success',
      cancelled: 'error',
    };
    return colors[status] || 'default';
  };

  if (loading) {
    return (
      <div className="admin-dashboard loading">
        <Loader className="spinner" size={48} />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard animate-in">
      <header className="admin-header">
        <div className="header-left">
          <LayoutDashboard size={28} />
          <h1>Admin Dashboard</h1>
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => navigate('/admin/analytics')} className="analytics-btn" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: 'rgba(14, 165, 233, 0.1)',
            color: 'var(--accent-color)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: 700,
            transition: 'all 0.2s'
          }}>
            <BarChart2 size={18} />
            Analytics
          </button>
          <button onClick={() => navigate('/admin/materials')} className="materials-btn" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: 'rgba(168, 85, 247, 0.1)',
            color: '#a855f7',
            border: '1px solid rgba(168, 85, 247, 0.2)',
            borderRadius: '12px',
            cursor: 'pointer',
            fontWeight: 700,
            transition: 'all 0.2s'
          }}>
            <Layers size={18} />
            Materials
          </button>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Package size={28} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Orders</p>
            <p className="stat-value">{stats?.total_orders || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon warning">
            <AlertCircle size={28} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Pending Orders</p>
            <p className="stat-value">{stats?.pending_orders || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon success">
            <DollarSign size={28} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Revenue</p>
            <p className="stat-value">${stats?.total_revenue?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon info">
            <TrendingUp size={28} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Monthly Sales</p>
            <p className="stat-value">${stats?.monthly_revenue?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</p>
          </div>
        </div>
      </div>

      <div className="recent-orders card">
        <h2>Recent Orders</h2>
        <div className="orders-table">
          <table>
            <thead>
              <tr>
                <th>Order #</th>
                <th>Customer</th>
                <th>Details</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {stats?.recent_orders?.map((order: any) => (
                <tr key={order.id}>
                  <td className="order-number" style={{ color: 'var(--accent-color)', fontWeight: 800 }}>{order.order_number}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{order.customer_name}</div>
                    <div className="email" style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>{order.customer_email}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{order.material_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{order.thickness_mm}mm • Qty: {order.quantity}</div>
                  </td>
                  <td className="amount" style={{ fontWeight: 800 }}>${order.total_amount.toFixed(2)}</td>
                  <td>
                    <span className={`status-badge ${getStatusColor(order.status)}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <select
                      value={order.status}
                      onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                      className="status-select"
                      style={{
                        padding: '0.4rem',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        fontWeight: 600
                      }}
                    >
                      <option value="pending">Pending</option>
                      <option value="paid">Paid</option>
                      <option value="in_production">In Production</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

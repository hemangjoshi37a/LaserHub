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
  CreditCard,
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
        <Loader className="spinner" size={32} />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard animate-in">
      <header className="admin-header">
        <div className="header-left">
          <LayoutDashboard size={20} />
          <h1>Dashboard</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => navigate('/admin/analytics')} className="header-nav-btn header-nav-btn--analytics">
            <BarChart2 size={15} />
            Analytics
          </button>
          <button onClick={() => navigate('/admin/materials')} className="header-nav-btn header-nav-btn--materials">
            <Layers size={15} />
            Materials
          </button>
          <button onClick={() => navigate('/admin/payments')} className="header-nav-btn header-nav-btn--payments">
            <CreditCard size={15} />
            Payments
          </button>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Package size={20} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Orders</p>
            <p className="stat-value">{stats?.total_orders || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon warning">
            <AlertCircle size={20} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Pending</p>
            <p className="stat-value">{stats?.pending_orders || 0}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon success">
            <DollarSign size={20} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Revenue</p>
            <p className="stat-value">${stats?.total_revenue?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon info">
            <TrendingUp size={20} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Monthly</p>
            <p className="stat-value">${stats?.monthly_revenue?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || '0.00'}</p>
          </div>
        </div>
      </div>

      <div className="recent-orders card">
        <h2>Recent Orders</h2>
        <div className="orders-table-wrap">
          <table className="orders-table">
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
                  <td className="cell-accent cell-bold">{order.order_number}</td>
                  <td>
                    <div className="cell-bold">{order.customer_name}</div>
                    <div className="cell-sub">{order.customer_email}</div>
                  </td>
                  <td>
                    <div className="cell-medium">{order.material_name}</div>
                    <div className="cell-sub">{order.thickness_mm}mm / Qty: {order.quantity}</div>
                  </td>
                  <td className="cell-bold">${order.total_amount.toFixed(2)}</td>
                  <td>
                    <span className={`status-badge ${getStatusColor(order.status)}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="cell-sub">
                    {new Date(order.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <select
                      value={order.status}
                      onChange={(e) => updateOrderStatus(order.id, e.target.value)}
                      className="status-select"
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

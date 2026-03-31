import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  Package, 
  Download, 
  ArrowLeft,
  Loader,
  BarChart2
} from 'lucide-react';
import { adminApi, AnalyticsData } from '../services';
import { toast } from 'sonner';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];

export const Analytics: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const result = await adminApi.getAnalytics();
      setData(result);
    } catch (error) {
      toast.error('Failed to load analytics data');
      navigate('/admin');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const blob = await adminApi.exportOrders();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Orders exported successfully');
    } catch (error) {
      toast.error('Failed to export orders');
    }
  };

  if (loading) {
    return (
      <div className="admin-dashboard loading">
        <Loader className="spinner" size={48} />
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <div className="header-left">
          <button onClick={() => navigate('/admin')} className="back-btn-icon">
            <ArrowLeft size={24} />
          </button>
          <div style={{ marginLeft: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart2 size={24} color="#0ea5e9" />
              <h1>Analytics Dashboard</h1>
            </div>
            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Business insights and performance metrics</p>
          </div>
        </div>
        <div className="analytics-actions">
          <button onClick={handleExport} className="export-btn">
            <Download size={18} />
            Export CSV
          </button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon info">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Revenue</p>
            <p className="stat-value">${data?.total_revenue.toFixed(2)}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon success">
            <Package size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Total Orders</p>
            <p className="stat-value">{data?.total_orders}</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon warning">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <p className="stat-label">Avg. Order Value</p>
            <p className="stat-value">${data?.average_order_value.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h2>Revenue over Time (30 Days)</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.sales_over_time}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 12 }} 
                  tickFormatter={(value) => value.split('-').slice(1).join('/')}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Revenue']}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#0ea5e9" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: '#0ea5e9' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card">
          <h2>Popular Materials</h2>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.popular_materials}
                  dataKey="count"
                  nameKey="material_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ material_name, percent }) => `${material_name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data?.popular_materials.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="analytics-tables">
        <div className="table-card">
          <h2>Top Customers</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th className="value-cell">Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {data?.top_customers.map((customer, idx) => (
                <tr key={idx}>
                  <td>
                    <div className="name-cell">{customer.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{customer.email}</div>
                  </td>
                  <td>{customer.order_count}</td>
                  <td className="value-cell">${customer.total_spent.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="table-card">
          <h2>Material Performance</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Orders</th>
                <th className="value-cell">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data?.popular_materials.map((material, idx) => (
                <tr key={idx}>
                  <td className="name-cell">{material.material_name}</td>
                  <td>{material.count}</td>
                  <td className="value-cell">${material.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

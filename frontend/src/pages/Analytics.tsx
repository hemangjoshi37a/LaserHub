import React, { useEffect, useMemo, useState } from 'react';
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Package,
  Download,
  Loader,
  BarChart2,
} from 'lucide-react';
import { adminApi, vendorApi } from '../services';

import { toast } from 'sonner';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { StatCard, RevenueChart } from '../components';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];

type RangeKey = '7d' | '30d' | '90d' | 'all';

const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
];

export const Analytics: React.FC<{ vendorMode?: boolean }> = ({ vendorMode }) => {
  useDocumentTitle(vendorMode ? 'Shop Analytics — LaserHub' : 'Analytics — LaserHub');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('30d');
  const { currency } = useCurrencyStore();

  useEffect(() => {
    loadAnalytics();
  }, [vendorMode]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      if (vendorMode) {
        const result = await vendorApi.getVendorAnalytics();
        // Map vendor analytics structure to match AnalyticsData partially
        const mappedData = {
          sales_over_time: result.revenue_timeline,
          popular_materials: result.popular_materials.map((m: any) => ({
            material_name: m.name,
            count: m.count,
            revenue: 0
          })),
          top_customers: result.top_customers,
          total_orders: result.orders_count.total,
          total_revenue: result.revenue.year, // Using year revenue as a fallback for total
          average_order_value: result.avg_order_value
        };

        setData(mappedData);
      } else {
        const result = await adminApi.getAnalytics();
        setData(result);
      }
    } catch (error) {
      toast.error('Failed to load analytics data');
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

  const filteredSales = useMemo(() => {
    if (!data?.sales_over_time) return [];
    const cfg = RANGES.find((r) => r.key === range);
    if (!cfg?.days) return data.sales_over_time;
    const cutoff = Date.now() - cfg.days * 24 * 60 * 60 * 1000;
    return data.sales_over_time.filter((row: any) => {
      const t = new Date(row.date).getTime();
      return !Number.isNaN(t) && t >= cutoff;
    });
  }, [data, range]);

  if (loading) {
    return (
      <div className="adm-loading">
        <Loader className="spinner" size={32} />
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title"><BarChart2 size={22} /> Analytics</h1>
          <p className="adm-page-sub">Business insights and performance</p>
        </div>
        <button onClick={handleExport} className="adm-btn adm-btn--primary">
          <Download size={15} /> Export CSV
        </button>
      </header>

      <div className="adm-toolbar">
        <div className="adm-filter-chips">
          {RANGES.map((r) => (
            <button
              key={r.key}
              className={`adm-chip ${range === r.key ? 'adm-chip--active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="adm-stats-grid">
        <StatCard
          label="Total Revenue"
          value={formatPrice(data?.total_revenue || 0, currency)}
          icon={<TrendingUp size={20} />}
          tone="info"
        />
        <StatCard
          label="Total Orders"
          value={(data?.total_orders || 0).toString()}
          icon={<Package size={20} />}
          tone="success"
        />
        <StatCard
          label="Avg. Order Value"
          value={formatPrice(data?.average_order_value || 0, currency)}
          icon={<TrendingUp size={20} />}
          tone="warning"
        />
      </div>

      <div className="adm-charts-grid">
        <div className="adm-card">
          <h3 className="adm-card-title">Revenue over Time</h3>
          <div className="adm-chart-container">
            <RevenueChart data={filteredSales} />
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title">Popular Materials</h3>
          <div className="adm-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.popular_materials}
                  dataKey="count"
                  nameKey="material_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={50}
                  paddingAngle={4}
                  label={({ material_name, percent }: any) => `${material_name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data?.popular_materials.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string, props: any) => {
                    const rev = props?.payload?.revenue;
                    const revText = typeof rev === 'number' ? ` (${formatPrice(rev, currency)})` : '';
                    return [`${value} orders${revText}`, name];
                  }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="adm-charts-grid">
        <div className="adm-card">
          <h3 className="adm-card-title">Top Customers</h3>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Orders</th>
                  <th>Total Spent</th>
                </tr>
              </thead>
              <tbody>
                {(data?.top_customers || []).length === 0 && (
                  <tr><td colSpan={3} className="adm-empty-row">No customer data yet.</td></tr>
                )}
                {data?.top_customers.map((customer: any, idx: number) => (
                  <tr key={idx}>
                    <td>
                      <div className="adm-cell-bold">{customer.name || '—'}</div>
                      <div className="adm-cell-sub">{customer.email}</div>
                    </td>
                    <td className="adm-cell-medium">{customer.order_count}</td>
                    <td className="adm-cell-accent">{formatPrice(customer.total_spent, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title">Material Performance</h3>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Orders</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {(data?.popular_materials || []).length === 0 && (
                  <tr><td colSpan={3} className="adm-empty-row">No material data yet.</td></tr>
                )}
                {data?.popular_materials.map((material: any, idx: number) => (
                  <tr key={idx}>
                    <td className="adm-cell-bold">{material.material_name}</td>
                    <td className="adm-cell-medium">{material.count}</td>
                    <td className="adm-cell-accent">{formatPrice(material.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

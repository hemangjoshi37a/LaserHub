import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  TrendingUp,
  DollarSign,
  Download,
  Loader,
  PieChart as PieIcon,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, vendorApi, FinancialsSummary } from '../services';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { StatCard, RevenueChart } from '../components';

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#6366f1', '#ec4899'];

export const FinancialsDashboard: React.FC<{ vendorMode?: boolean }> = ({ vendorMode }) => {
  useDocumentTitle(vendorMode ? 'Shop Financials — LaserHub' : 'Financials — LaserHub');
  const { currency } = useCurrencyStore();
  const [data, setData] = useState<FinancialsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const [startDate, setStartDate] = useState<string>(firstOfMonth.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(today.toISOString().split('T')[0]);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (vendorMode) {
          const result = await vendorApi.getFinancialsSummary();
          setData(result);
        } else {
          const result = await adminApi.getFinancialsSummary();
          setData(result);
        }
      } catch {
        toast.error('Failed to load financials');
      } finally {
        setLoading(false);
      }
    })();
  }, [vendorMode]);


  const handleDownloadTaxReport = async () => {
    setDownloading(true);
    try {
      const blob = await adminApi.downloadTaxReport(startDate, endDate);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `tax_report_${startDate}_${endDate}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Tax report downloaded');
    } catch {
      toast.error('Failed to download tax report');
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="adm-loading">
        <Loader className="spinner" size={32} />
        <p>Loading financials...</p>
      </div>
    );
  }

  if (!data) return null;

  const costBreakdown = [
    { name: 'Material', value: data.cogs.material },
    { name: 'Laser', value: data.cogs.laser },
    { name: 'Energy', value: data.cogs.energy },
  ].filter((x) => x.value > 0);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title"><DollarSign size={22} /> Financials</h1>
          <p className="adm-page-sub">Revenue, profit, and tax reporting</p>
        </div>
      </header>

      {/* Top revenue stats */}
      <div className="adm-stats-grid">
        <StatCard label="Today" value={formatPrice(data.revenue.today, currency)} sub={`${data.orders_count.today} orders`} tone="info" />
        <StatCard label="This Week" value={formatPrice(data.revenue.week, currency)} sub={`${data.orders_count.week} orders`} tone="success" />
        <StatCard label="This Month" value={formatPrice(data.revenue.month, currency)} sub={`${data.orders_count.month} orders`} tone="warning" />
        <StatCard label="This Year" value={formatPrice(data.revenue.year, currency)} sub={`${data.orders_count.year} orders`} tone="info" />
        <StatCard
          label="Profit Margin"
          value={`${data.profit_margin_pct.toFixed(1)}%`}
          sub={`Profit ${formatPrice(data.profit, currency)}`}
          tone="success"
        />
        <StatCard
          label="Avg Order"
          value={formatPrice(data.avg_order_value, currency)}
          sub={`${data.orders_count.total} total orders`}
          tone="info"
        />
      </div>

      {/* Revenue timeline */}
      <div className="adm-card" style={{ marginTop: '1rem' }}>
        <h3 className="adm-card-title"><TrendingUp size={16} /> Revenue — Last 30 Days</h3>
        <div className="adm-chart-container" style={{ height: 280 }}>
          <RevenueChart data={data.revenue_timeline} />
        </div>
      </div>

      <div className="adm-charts-grid" style={{ marginTop: '1rem' }}>
        {/* Cost breakdown donut */}
        <div className="adm-card">
          <h3 className="adm-card-title"><PieIcon size={16} /> Cost Breakdown</h3>
          <div className="adm-chart-container" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={costBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {costBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatPrice(v, currency)} />
                <Legend verticalAlign="bottom" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment methods */}
        <div className="adm-card">
          <h3 className="adm-card-title">Payment Methods</h3>
          <div className="adm-chart-container" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.payment_methods}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                <XAxis dataKey="method" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatPrice(v, currency)} />
                <Tooltip formatter={(v: number) => formatPrice(v, currency)} />
                <Bar dataKey="total" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top customers + tax report */}
      <div className="adm-charts-grid" style={{ marginTop: '1rem' }}>
        <div className="adm-card">
          <h3 className="adm-card-title"><Users size={16} /> Top Customers</h3>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Orders</th>
                  <th>Spent</th>
                </tr>
              </thead>
              <tbody>
                {data.top_customers.length === 0 && (
                  <tr><td colSpan={3} className="adm-empty-row">No data yet.</td></tr>
                )}
                {data.top_customers.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <div className="adm-cell-bold">{c.name || '—'}</div>
                      <div className="adm-cell-sub">{c.email}</div>
                    </td>
                    <td>{c.order_count}</td>
                    <td className="adm-cell-accent">{formatPrice(c.total_spent, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="adm-card">
          <h3 className="adm-card-title"><Download size={16} /> Tax Report</h3>
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Download a CSV of orders with per-line tax breakdown for the selected range.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <label>
                <span style={{ fontSize: '0.75rem', display: 'block' }}>Start</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{ padding: '0.45rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
                />
              </label>
              <label>
                <span style={{ fontSize: '0.75rem', display: 'block' }}>End</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{ padding: '0.45rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
                />
              </label>
            </div>
            <button
              className="adm-btn adm-btn--primary"
              onClick={handleDownloadTaxReport}
              disabled={downloading}
              style={{ alignSelf: 'flex-start' }}
            >
              <Download size={14} /> {downloading ? 'Preparing…' : 'Download CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* COGS by material */}
      <div className="adm-card" style={{ marginTop: '1rem' }}>
        <h3 className="adm-card-title">COGS by Material</h3>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Material</th>
                <th>Cost of Goods Sold</th>
              </tr>
            </thead>
            <tbody>
              {data.cogs.by_material.length === 0 && (
                <tr><td colSpan={2} className="adm-empty-row">No data yet.</td></tr>
              )}
              {data.cogs.by_material.map((m, i) => (
                <tr key={i}>
                  <td className="adm-cell-bold">{m.name}</td>
                  <td className="adm-cell-accent">{formatPrice(m.total, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
export default FinancialsDashboard;

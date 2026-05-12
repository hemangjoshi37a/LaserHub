import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Users,
  Store,
  BarChart3,
  CheckCircle,
  Palette,
  Package,
  ExternalLink,
  UserPlus,
} from 'lucide-react';
import { superAdminApi, SAUser, SAVendor, SAStats, SADesign } from '../../services';
import { useCurrencyStore, formatPrice } from '../../store/currencyStore';
import type { SuperAdminTab } from './_shared';

import { StatCard } from '../../components/StatCard';

export function OverviewTab({ goTo }: { goTo: (t: SuperAdminTab) => void }) {
  const { currency } = useCurrencyStore();
  const [stats, setStats] = useState<SAStats | null>(null);
  const [users, setUsers] = useState<SAUser[]>([]);
  const [vendors, setVendors] = useState<SAVendor[]>([]);
  const [designs, setDesigns] = useState<SADesign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, u, v, d] = await Promise.all([
          superAdminApi.getStats(),
          superAdminApi.getUsers(),
          superAdminApi.getVendors(),
          superAdminApi.getDesigns(),
        ]);
        setStats(s);
        setUsers(u);
        setVendors(v);
        setDesigns(d);
      } catch {
        toast.error('Failed to load overview');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const recentSignups = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users
      .filter((u) => new Date(u.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);
  }, [users]);

  const pendingVendors = useMemo(
    () => vendors.filter((v) => !v.is_verified),
    [vendors]
  );

  if (loading) return <div className="sa-loading">Loading overview...</div>;

  const cards: { label: string; value: string | number; icon: JSX.Element; tone: 'info' | 'success' | 'warning' | 'error' }[] = [
    {
      label: 'Total Users',
      value: stats?.total_users ?? 0,
      icon: <Users size={22} />,
      tone: 'info',
    },
    {
      label: 'Total Vendors',
      value: stats?.total_vendors ?? 0,
      icon: <Store size={22} />,
      tone: 'info',
    },
    {
      label: 'Total Designs',
      value: designs.length,
      icon: <Palette size={22} />,
      tone: 'info',
    },
    {
      label: 'Total Orders',
      value: stats?.total_orders ?? 0,
      icon: <Package size={22} />,
      tone: 'warning',
    },
    {
      label: 'Total Revenue',
      value: formatPrice(stats?.total_revenue ?? 0, currency),
      icon: <BarChart3 size={22} />,
      tone: 'success',
    },
    {
      label: 'New This Month',
      value: stats?.users_this_month ?? 0,
      icon: <UserPlus size={22} />,
      tone: 'info',
    },
  ];

  return (
    <div className="sa-overview">
      <div className="sa-stats-grid">
        {cards.map((c) => (
          <StatCard
            key={c.label}
            label={c.label}
            value={String(c.value)}
            icon={c.icon}
            tone={c.tone}
          />
        ))}
      </div>

      <div className="sa-overview-grid">
        <div className="sa-panel">
          <div className="sa-panel__header">
            <h3>Recent Signups</h3>
            <span className="sa-panel__subtitle">Last 7 days</span>
          </div>
          {recentSignups.length === 0 ? (
            <div className="sa-panel__empty">No new users in the last 7 days.</div>
          ) : (
            <ul className="sa-recent-list">
              {recentSignups.map((u) => (
                <li key={u.id}>
                  <div className="sa-avatar-sm">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="sa-recent-list__body">
                    <div className="sa-recent-list__name">{u.name}</div>
                    <div className="sa-recent-list__meta">{u.email}</div>
                  </div>
                  <span className="sa-badge">{u.role.replace('_', ' ')}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="sa-panel__cta" onClick={() => goTo('users')}>
            View all users <ExternalLink size={14} />
          </button>
        </div>

        <div className="sa-panel">
          <div className="sa-panel__header">
            <h3>Pending Vendor Approvals</h3>
            <span className="sa-panel__subtitle">{pendingVendors.length} waiting</span>
          </div>
          {pendingVendors.length === 0 ? (
            <div className="sa-panel__empty">
              <CheckCircle size={28} />
              <div>All vendors are approved.</div>
            </div>
          ) : (
            <ul className="sa-recent-list">
              {pendingVendors.slice(0, 8).map((v) => (
                <li key={v.id}>
                  <div className="sa-avatar-sm sa-avatar-sm--purple">
                    {v.shop_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="sa-recent-list__body">
                    <div className="sa-recent-list__name">{v.shop_name}</div>
                    <div className="sa-recent-list__meta">{v.owner_name}</div>
                  </div>
                  <span className="sa-badge sa-badge--warning">Pending</span>
                </li>
              ))}
            </ul>
          )}
          <button className="sa-panel__cta" onClick={() => goTo('vendors')}>
            Manage vendors <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

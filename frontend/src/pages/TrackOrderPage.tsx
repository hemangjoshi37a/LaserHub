import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Package, UserPlus, AlertCircle } from 'lucide-react';
import { ordersApi, type Order } from '../services';
import { Skeleton } from '../components/Skeleton';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

export const TrackOrderPage: React.FC = () => {
  useDocumentTitle('Track Order — LaserHub');
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    ordersApi.getGuestOrder(token)
      .then((o) => setOrder(o))
      .catch((e) => setError(e?.response?.data?.detail || 'Order not found'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div className="adm-page animate-in" style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title"><Package size={24} /> Track Your Order</h1>
          <p className="adm-page-sub">Your guest order details and status</p>
        </div>
      </header>

      {loading ? (
        <div className="adm-card" style={{ padding: '1.5rem' }}>
          <Skeleton height="1.5rem" width="50%" />
          <Skeleton height="1rem" width="80%" />
          <Skeleton height="1rem" width="70%" />
        </div>
      ) : error ? (
        <div className="adm-card" style={{ padding: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : order ? (
        <>
          <div className="adm-card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Order number</div>
                <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{order.order_number}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Status</div>
                <span className={`adm-status-badge adm-status-badge--${
                  order.status === 'completed' ? 'success' :
                  order.status === 'cancelled' ? 'error' :
                  order.status === 'paid' ? 'success' :
                  order.status === 'in_production' ? 'info' : 'warning'
                }`}>{order.status.replace('_', ' ')}</span>
              </div>
            </div>

            <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '0.35rem 1rem', fontSize: '0.9rem' }}>
              <dt style={{ color: 'var(--text-secondary)' }}>Material</dt>
              <dd>{order.material_name} · {order.thickness_mm}mm</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Quantity</dt>
              <dd>{order.quantity}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Total</dt>
              <dd><strong>{formatPrice(order.total_amount)}</strong></dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Customer</dt>
              <dd>{order.customer_name} · {order.customer_email}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Ship to</dt>
              <dd>{order.shipping_address}</dd>
              <dt style={{ color: 'var(--text-secondary)' }}>Placed</dt>
              <dd>{new Date(order.created_at).toLocaleString()}</dd>
              {order.vendor_name && (
                <>
                  <dt style={{ color: 'var(--text-secondary)' }}>Vendor</dt>
                  <dd>{order.vendor_name}</dd>
                </>
              )}
            </dl>
          </div>

          <div className="adm-card" style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--color-primary-50, #eff6ff)' }}>
            <UserPlus size={28} style={{ marginBottom: '0.5rem' }} />
            <h3 style={{ margin: '0 0 0.5rem' }}>Create an account to manage your orders</h3>
            <p style={{ margin: '0 0 1rem', color: 'var(--text-secondary)' }}>
              Sign up with <strong>{order.customer_email}</strong> and this order will auto-link to your account.
            </p>
            <Link to="/register" className="sa-btn sa-btn--primary-sm">Create Account</Link>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default TrackOrderPage;

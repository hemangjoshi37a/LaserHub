import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import { trackingApi, type OrderTimeline } from '../services/tracking';
import { useAuthStore } from '../store/authStore';
import OrderTimeline_ from '../components/OrderTimeline';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const OrderTrackingPage: React.FC = () => {
  useDocumentTitle('Order Tracking — LaserHub');
  const { identifier } = useParams<{ identifier: string }>();
  const { user } = useAuthStore();
  const [data, setData] = useState<OrderTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!identifier) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Guest flow for UUID tokens or order numbers (ORD-...)
        const looksGuest = UUID_RE.test(identifier) || identifier.startsWith('ORD-');
        if (looksGuest || !user) {
          try {
            const d = await trackingApi.getGuestTracking(identifier);
            setData(d);
            return;
          } catch {
            // fall through to authed fetch below when logged in
          }
        }
        if (user) {
          const asNum = Number(identifier);
          if (!Number.isNaN(asNum)) {
            const d = await trackingApi.getOrderTimeline(asNum);
            setData(d);
            return;
          }
        }
        setError('Order not found');
      } catch (e: any) {
        setError(e?.response?.data?.detail || 'Failed to load order');
      } finally {
        setLoading(false);
      }
    })();
  }, [identifier, user]);

  return (
    <div className="otp-page" style={{ maxWidth: 960, margin: '0 auto', padding: '2rem 1rem' }}>
      <Link to="/" className="sa-btn sa-btn--ghost-sm" style={{ marginBottom: '1rem' }}>
        <ArrowLeft size={14} /> Home
      </Link>

      {loading && (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Loader2 className="spinner" size={32} />
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
            Loading your order…
          </p>
        </div>
      )}

      {error && (
        <div className="adm-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h2>Order not found</h2>
          <p style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Double-check your tracking link or contact support if the problem persists.
          </p>
        </div>
      )}

      {data && (
        <div className="adm-card" style={{ padding: '1.25rem' }}>
          <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
            <div>
              <h1 style={{ margin: 0 }}>Order {data.order_number}</h1>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Placed {new Date(data.created_at).toLocaleString()}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {data.vendor_name && (
                <>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Vendor</div>
                  <div style={{ fontWeight: 600 }}>{data.vendor_name}</div>
                  {data.vendor_email && (
                    <a
                      href={`mailto:${data.vendor_email}?subject=Regarding order ${data.order_number}`}
                      className="sa-btn sa-btn--ghost-sm"
                      style={{ marginTop: '0.4rem' }}
                    >
                      <Mail size={14} /> Contact Vendor
                    </a>
                  )}
                </>
              )}
            </div>
          </header>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '0.5rem 0', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', marginTop: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Material</div>
              <div style={{ fontWeight: 600 }}>{data.material_name || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Thickness</div>
              <div style={{ fontWeight: 600 }}>{data.thickness_mm}mm</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Quantity</div>
              <div style={{ fontWeight: 600 }}>{data.quantity}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Total</div>
              <div style={{ fontWeight: 600 }}>{formatPrice(data.total_amount)}</div>
            </div>
          </div>

          <OrderTimeline_ data={data} />
        </div>
      )}

      <style>{`.spinner { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default OrderTrackingPage;

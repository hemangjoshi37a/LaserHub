import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, X, Loader2, FileText } from 'lucide-react';
import { quotesApi, Quote } from '../services';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

export const PublicQuotePage: React.FC = () => {
  useDocumentTitle('Quote — LaserHub');
  const { quote_number } = useParams<{ quote_number: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!quote_number) return;
    quotesApi.getPublic(quote_number)
      .then(setQuote)
      .catch((err) => setError(err?.response?.data?.detail || "Couldn't load quote"))
      .finally(() => setLoading(false));
  }, [quote_number]);

  const handleAccept = async () => {
    if (!quote_number) return;
    setActing(true);
    try {
      const q = await quotesApi.acceptPublic(quote_number);
      setQuote(q);
      toast.success('Quote accepted — the vendor has been notified');
    } catch (err: any) {
      toast.error("Couldn't accept", { description: err?.response?.data?.detail });
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!quote_number) return;
    if (!window.confirm('Reject this quote?')) return;
    setActing(true);
    try {
      const q = await quotesApi.rejectPublic(quote_number);
      setQuote(q);
    } catch (err: any) {
      toast.error("Couldn't reject", { description: err?.response?.data?.detail });
    } finally {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <Loader2 className="spinner" size={24} /> Loading quote...
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h2>Quote not available</h2>
        <p style={{ color: 'var(--text-secondary)' }}>{error || 'This quote could not be found.'}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '2rem auto', padding: '1rem' }}>
      <div className="adm-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FileText size={24} /> Quote {quote.quote_number}
            </h1>
            <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0' }}>
              Prepared for {quote.customer_name}
            </p>
          </div>
          <span className={`adm-status-badge adm-status-badge--${
            quote.status === 'accepted' ? 'success' :
            quote.status === 'rejected' || quote.status === 'expired' ? 'error' :
            quote.status === 'sent' ? 'info' : 'warning'
          }`}>{quote.status}</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Item</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Material</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Qty</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Unit</th>
              <th style={{ textAlign: 'right', padding: '0.5rem' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((item, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '0.5rem' }}>{item.description || '—'}</td>
                <td style={{ padding: '0.5rem' }}>{item.material}{item.thickness ? ` (${item.thickness}mm)` : ''}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{item.qty}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatPrice(item.unit_price)}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatPrice(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginLeft: 'auto', maxWidth: 320 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
            <span>Subtotal</span><strong>{formatPrice(quote.subtotal)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
            <span>Setup fee</span><strong>{formatPrice(quote.setup_fee)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
            <span>Tax</span><strong>{formatPrice(quote.tax)}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', fontSize: '1.2rem', borderTop: '2px solid var(--border-color)', marginTop: '0.5rem' }}>
            <span>Total</span><strong>{formatPrice(quote.total)}</strong>
          </div>
        </div>

        {quote.notes && (
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 6 }}>
            <h3 style={{ marginTop: 0, fontSize: '0.875rem' }}>Notes</h3>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{quote.notes}</div>
          </div>
        )}

        {quote.valid_until && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '1rem' }}>
            Valid until {new Date(quote.valid_until).toLocaleDateString()}
          </p>
        )}

        {quote.status === 'sent' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
            <button className="sa-btn sa-btn--ghost-sm" onClick={handleReject} disabled={acting}>
              <X size={14} /> Reject
            </button>
            <button className="sa-btn sa-btn--primary-sm" onClick={handleAccept} disabled={acting}>
              <Check size={14} /> Accept Quote
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PublicQuotePage;

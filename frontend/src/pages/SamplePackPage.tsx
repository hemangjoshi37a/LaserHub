import React, { useState } from 'react';
import { Package, CheckCircle, Truck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ordersApi } from '../services';

const SAMPLE_PRICE_INR = 299;

export const SamplePackPage: React.FC = () => {
  useDocumentTitle('Sample Pack — LaserHub');
  const [form, setForm] = useState({
    name: '',
    email: '',
    address: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.address) {
      toast.error('Please fill in all fields');
      return;
    }
    
    setIsSubmitting(true);
    try {
      await ordersApi.createSamplePackOrder({
        customer_name: form.name,
        customer_email: form.email,
        shipping_address: form.address,
        amount: SAMPLE_PRICE_INR,
      });
      setSubmitted(true);
      toast.success('Sample pack ordered!', {
        description: 'We\'ll email you shipping confirmation within 24 hours.',
      });
    } catch (error) {
      toast.error('Failed to place order. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };


  if (submitted) {
    return (
      <div className="container" style={{ maxWidth: 600, margin: '0 auto', padding: '3rem 1rem', textAlign: 'center' }}>
        <CheckCircle size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
        <h1 style={{ fontSize: '1.6rem' }}>Thanks for your order!</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Your sample pack (₹{SAMPLE_PRICE_INR}) is on its way. You'll receive a shipping confirmation at
          <strong> {form.email}</strong> within 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <Package size={36} style={{ margin: '0 auto 0.5rem' }} />
        <h1 style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>LaserHub Sample Pack</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          New to laser cutting? Order swatches of all our top materials and see + touch
          the real thing before you commit.
        </p>
      </div>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>What's included</h2>
        <ul style={{ paddingLeft: '1.2rem', lineHeight: 1.7 }}>
          <li>Clear & black acrylic (3 mm)</li>
          <li>MDF (3 mm) and Baltic birch plywood (3 mm)</li>
          <li>Genuine leather (2 mm)</li>
          <li>Cardstock (0.5 mm)</li>
          <li>Aluminum sheet (1 mm) and stainless steel (0.5 mm)</li>
        </ul>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <Truck size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Ships in 2–3 business days · Free delivery
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-color, #0ea5e9)' }}>
            ₹{SAMPLE_PRICE_INR}
          </div>
        </div>
      </div>

      <form className="card" style={{ padding: '1.5rem' }} onSubmit={handleSubmit}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Shipping details</h2>
        <label style={{ display: 'block', marginBottom: '0.8rem' }}>
          <span style={{ fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Full name</span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--border-color,#cbd5e1)', borderRadius: 6 }}
            required
          />
        </label>
        <label style={{ display: 'block', marginBottom: '0.8rem' }}>
          <span style={{ fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--border-color,#cbd5e1)', borderRadius: 6 }}
            required
          />
        </label>
        <label style={{ display: 'block', marginBottom: '1rem' }}>
          <span style={{ fontSize: '0.85rem', display: 'block', marginBottom: 4 }}>Shipping address</span>
          <textarea
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            rows={3}
            style={{ width: '100%', padding: '0.55rem', border: '1px solid var(--border-color,#cbd5e1)', borderRadius: 6 }}
            required
          />
        </label>
        <button type="submit" className="calculate-btn" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : null}
          {isSubmitting ? 'Ordering...' : `Place sample pack order (₹${SAMPLE_PRICE_INR})`}
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.6rem', textAlign: 'center' }}>
          This is a demo checkout — no payment will be taken.
        </p>
      </form>
    </div>
  );
};

export default SamplePackPage;

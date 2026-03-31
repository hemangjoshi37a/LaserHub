import React, { useState, useEffect } from 'react';
import { adminApi } from '../services';
import { toast } from 'sonner';
import { CreditCard, Eye, EyeOff, Save, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Setting {
  id?: number;
  key: string;
  value: string;
  category: string;
  is_secret: boolean;
}

export const PaymentSettings: React.FC = () => {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const navigate = useNavigate();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // First seed defaults, then load
      try { await adminApi.seedPaymentSettings(); } catch {}
      const data = await adminApi.getSettings('payment');
      setSettings(data);
    } catch {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings(settings);
      toast.success('Payment settings saved');
      loadSettings();
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const gateway = settings.find(s => s.key === 'payment_gateway')?.value || 'stripe';

  // Group settings for display
  const stripeSettings = settings.filter(s => s.key.startsWith('stripe_'));
  const razorpaySettings = settings.filter(s => s.key.startsWith('razorpay_'));
  const generalSettings = settings.filter(s => !s.key.startsWith('stripe_') && !s.key.startsWith('razorpay_') && s.key !== 'payment_gateway');

  const renderField = (setting: Setting) => {
    const isVisible = showSecrets[setting.key];
    const label = setting.key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
      <div key={setting.key} className="form-group">
        <label>{label}</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input
            type={setting.is_secret && !isVisible ? 'password' : 'text'}
            value={setting.value}
            onChange={(e) => handleChange(setting.key, e.target.value)}
            placeholder={`Enter ${label.toLowerCase()}`}
          />
          {setting.is_secret && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowSecrets(prev => ({ ...prev, [setting.key]: !prev[setting.key] }))}
            >
              {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div className="loading">Loading settings...</div>;

  return (
    <div className="payment-settings animate-in">
      <div className="manager-header">
        <h2><CreditCard size={20} /> Payment Settings</h2>
        <button onClick={() => navigate('/admin/dashboard')} className="back-btn">
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="settings-section card">
        <h3>Payment Gateway</h3>
        <div className="gateway-selector">
          <button
            className={`gateway-btn ${gateway === 'stripe' ? 'active' : ''}`}
            onClick={() => handleChange('payment_gateway', 'stripe')}
          >Stripe</button>
          <button
            className={`gateway-btn ${gateway === 'razorpay' ? 'active' : ''}`}
            onClick={() => handleChange('payment_gateway', 'razorpay')}
          >Razorpay</button>
        </div>
      </div>

      {gateway === 'stripe' && (
        <div className="settings-section card">
          <h3>Stripe Configuration</h3>
          {stripeSettings.map(renderField)}
        </div>
      )}

      {gateway === 'razorpay' && (
        <div className="settings-section card">
          <h3>Razorpay Configuration</h3>
          {razorpaySettings.map(renderField)}
        </div>
      )}

      <div className="settings-section card">
        <h3>General</h3>
        {generalSettings.map(renderField)}
      </div>

      <button className="save-btn" onClick={handleSave} disabled={saving}>
        <Save size={16} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>
    </div>
  );
};

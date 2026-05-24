import React, { useEffect, useMemo, useState } from 'react';
import { Users, Mail, X, Loader2, Send, Tag, Search, Ticket, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  crmApi,
  type CrmCustomer,
  type CrmCustomerDetail,
  type CustomerTier,
} from '../services';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';

const TIER_STYLES: Record<CustomerTier, { bg: string; color: string; label: string }> = {
  bronze: { bg: '#f1e3d3', color: '#7c4a1e', label: 'Bronze' },
  silver: { bg: '#e5e7eb', color: '#4b5563', label: 'Silver' },
  gold: { bg: '#fef3c7', color: '#a16207', label: 'Gold' },
  platinum: { bg: '#ede9fe', color: '#6d28d9', label: 'Platinum' },
};

function TierBadge({ tier }: { tier: CustomerTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        borderRadius: 999,
        padding: '0.15rem 0.55rem',
        fontSize: '0.75rem',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      {s.label}
    </span>
  );
}

// Slider bounds in the same (USD) base unit as Order.total_amount on the backend.
const MIN_SPENT_MAX = 5000;
const MIN_SPENT_STEP = 50;

export const CustomersCRM: React.FC = () => {
  const { currency } = useCurrencyStore();
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<CustomerTier | ''>('');
  const [search, setSearch] = useState('');
  const [minSpent, setMinSpent] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [detail, setDetail] = useState<CrmCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const data = await crmApi.listCustomers({
        tier: tier || undefined,
        search: search || undefined,
        min_spent: minSpent > 0 ? minSpent : undefined,
      });
      setCustomers(data);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();

  }, [tier, minSpent]);

  useEffect(() => {
    const t = setTimeout(() => loadCustomers(), 300);
    return () => clearTimeout(t);

  }, [search]);

  useEffect(() => {
    if (!selectedEmail) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    crmApi
      .getCustomer(selectedEmail)
      .then((d) => {
        setDetail(d);
        setNotesDraft(d.notes || '');
        setTagsDraft((d.tags || []).join(', '));
      })
      .catch(() => toast.error('Failed to load customer'))
      .finally(() => setDetailLoading(false));
  }, [selectedEmail]);

  const handleSaveNotes = async () => {
    if (!selectedEmail) return;
    try {
      const tags = tagsDraft
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await crmApi.updateNotes(selectedEmail, notesDraft, tags);
      toast.success('Saved');
    } catch {
      toast.error('Save failed');
    }
  };

  const stats = useMemo(() => {
    const total = customers.length;
    const totalRev = customers.reduce((s, c) => s + c.total_spent, 0);
    const platinum = customers.filter((c) => c.tier === 'platinum').length;
    return { total, totalRev, platinum };
  }, [customers]);

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Customers</h1>
          <p className="adm-page-sub">
            {stats.total} customers · {formatPrice(stats.totalRev, currency)} lifetime revenue ·{' '}
            {stats.platinum} platinum
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="sa-btn sa-btn--ghost-sm" onClick={() => setShowDiscount(true)}>
            <Ticket size={14} /> Discount Code
          </button>
          <button className="sa-btn sa-btn--primary-sm" onClick={() => setShowBroadcast(true)}>
            <Mail size={14} /> Bulk Email
          </button>
        </div>
      </header>

      <div className="adm-card" style={{ marginBottom: '1rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            padding: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
            <Search
              size={14}
              style={{ position: 'absolute', left: 8, top: 10, color: 'var(--text-secondary)' }}
            />
            <input
              type="text"
              placeholder="Search name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.5rem 0.5rem 1.75rem',
                borderRadius: 6,
                border: '1px solid var(--border-color)',
              }}
            />
          </div>
          <select
            value={tier}
            onChange={(e) => setTier((e.target.value || '') as CustomerTier | '')}
            style={{ padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
          >
            <option value="">All tiers</option>
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="platinum">Platinum</option>
          </select>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.875rem',
            }}
          >
            Min spent: {formatPrice(minSpent, currency)}
            <input
              type="range"
              min={0}
              max={MIN_SPENT_MAX}
              step={MIN_SPENT_STEP}
              value={minSpent}
              onChange={(e) => setMinSpent(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h2 className="adm-card-title">
            <Users size={18} /> Customer list
          </h2>
        </div>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>
            <Loader2 className="spinner" size={28} />
          </div>
        ) : customers.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No customers match these filters.
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Orders</th>
                  <th>Total Spent</th>
                  <th>Avg Order</th>
                  <th>Tier</th>
                  <th>Last Order</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.email}
                    className="adm-row"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedEmail(c.email)}
                  >
                    <td className="adm-cell-medium">{c.name || '—'}</td>
                    <td className="adm-cell-sub">{c.email}</td>
                    <td>{c.order_count}</td>
                    <td className="adm-cell-bold">{formatPrice(c.total_spent, currency)}</td>
                    <td>{formatPrice(c.avg_order_value, currency)}</td>
                    <td>
                      <TierBadge tier={c.tier} />
                    </td>
                    <td className="adm-cell-sub">
                      {c.days_since_last_order !== null
                        ? `${c.days_since_last_order}d ago`
                        : '—'}
                    </td>
                    <td>
                      <a
                        href={`mailto:${c.email}`}
                        className="sa-btn sa-btn--ghost-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Mail size={14} /> Email
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedEmail && (
        <CustomerDetailPanel
          email={selectedEmail}
          detail={detail}
          loading={detailLoading}
          notesDraft={notesDraft}
          tagsDraft={tagsDraft}
          setNotesDraft={setNotesDraft}
          setTagsDraft={setTagsDraft}
          onSave={handleSaveNotes}
          onClose={() => setSelectedEmail(null)}
        />
      )}

      {showBroadcast && (
        <BroadcastModal onClose={() => setShowBroadcast(false)} />
      )}

      {showDiscount && (
        <DiscountModal onClose={() => setShowDiscount(false)} />
      )}
    </div>
  );
};

function CustomerDetailPanel(props: {
  email: string;
  detail: CrmCustomerDetail | null;
  loading: boolean;
  notesDraft: string;
  tagsDraft: string;
  setNotesDraft: (v: string) => void;
  setTagsDraft: (v: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const { email, detail, loading, notesDraft, tagsDraft, setNotesDraft, setTagsDraft, onSave, onClose } = props;
  const { currency } = useCurrencyStore();
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 1000,
        }}
      />
      <aside
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(480px, 100%)',
          background: 'var(--bg-primary, #fff)',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 1001,
          overflowY: 'auto',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Customer</h3>
          <button className="sa-btn sa-btn--ghost-sm" onClick={onClose}>
            <X size={14} />
          </button>
        </div>

        {loading || !detail ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Loader2 className="spinner" size={24} />
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <h4 style={{ margin: 0 }}>{detail.name || email}</h4>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{email}</div>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <TierBadge tier={detail.tier} />
                <span style={{ fontSize: '0.875rem' }}>
                  {detail.order_count} orders · {formatPrice(detail.total_spent, currency)} spent
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem' }}>Private notes</label>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={onSave}
                rows={4}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)', marginTop: 4 }}
                placeholder="Internal notes on this customer…"
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Tag size={13} /> Tags (comma-separated)
              </label>
              <input
                type="text"
                value={tagsDraft}
                onChange={(e) => setTagsDraft(e.target.value)}
                onBlur={onSave}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)', marginTop: 4 }}
                placeholder="vip, recurring, b2b"
              />
            </div>

            <a href={`mailto:${email}`} className="sa-btn sa-btn--primary-sm" style={{ marginBottom: '1rem' }}>
              <Mail size={14} /> Send Email
            </a>

            <h4 style={{ marginTop: '1rem', marginBottom: '0.5rem' }}>Order timeline</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {detail.orders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    border: '1px solid var(--border-color)',
                    borderRadius: 6,
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.875rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{o.order_number}</strong>
                    <span>{formatPrice(o.total_amount, currency)}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                    {o.created_at ? new Date(o.created_at).toLocaleDateString() : '—'} ·{' '}
                    {o.status} · Qty {o.quantity} · {o.thickness_mm}mm
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function BroadcastModal({ onClose }: { onClose: () => void }) {
  const { currency } = useCurrencyStore();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [tier, setTier] = useState<CustomerTier | ''>('');
  const [minSpent, setMinSpent] = useState(0);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !body.trim()) {
      toast.error('Subject and body required');
      return;
    }
    setSending(true);
    try {
      const res = await crmApi.broadcast(subject, body, {
        tier: tier || undefined,
        min_spent: minSpent > 0 ? minSpent : undefined,
      });
      toast.success(`Queued to ${res.count} recipients`);
      onClose();
    } catch {
      toast.error('Broadcast failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary, #fff)',
          borderRadius: 8,
          width: 'min(520px, 95%)',
          padding: '1.25rem',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Bulk Email</h3>
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
        />
        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
          Body
        </label>
        <textarea
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
        />
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', alignItems: 'center' }}>
          <select
            value={tier}
            onChange={(e) => setTier((e.target.value || '') as CustomerTier | '')}
            style={{ padding: '0.4rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
          >
            <option value="">All tiers</option>
            <option value="bronze">Bronze</option>
            <option value="silver">Silver</option>
            <option value="gold">Gold</option>
            <option value="platinum">Platinum</option>
          </select>
          <label style={{ fontSize: '0.875rem' }}>
            Min spent: {formatPrice(minSpent, currency)}
            <input
              type="range"
              min={0}
              max={MIN_SPENT_MAX}
              step={MIN_SPENT_STEP}
              value={minSpent}
              onChange={(e) => setMinSpent(Number(e.target.value))}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
          <button className="sa-btn sa-btn--ghost-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="sa-btn sa-btn--primary-sm" onClick={handleSend} disabled={sending}>
            {sending ? <Loader2 size={14} className="spinner" /> : <Send size={14} />} Send
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscountModal({ onClose }: { onClose: () => void }) {
  const [percentOff, setPercentOff] = useState(10);
  const [tier, setTier] = useState<CustomerTier | ''>('');
  const [expiresDays, setExpiresDays] = useState(30);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  const handleCreate = async () => {
    if (percentOff <= 0 || percentOff > 100) {
      toast.error('Discount must be between 1 and 100%');
      return;
    }
    setCreating(true);
    try {
      const res = await crmApi.createDiscountCode({
        percent_off: percentOff,
        tier: tier || undefined,
        expires_days: expiresDays,
      });
      setCode(res.code);
      toast.success('Discount code created');
    } catch {
      toast.error('Failed to create code');
    } finally {
      setCreating(false);
    }
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary, #fff)',
          borderRadius: 8,
          width: 'min(420px, 95%)',
          padding: '1.25rem',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Create Discount Code</h3>
        {code ? (
          <>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Share this code with customers for {percentOff}% off.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: '0.6rem 0.75rem',
                fontFamily: 'monospace',
                fontSize: '1.1rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              <span style={{ flex: 1 }}>{code}</span>
              <button className="sa-btn sa-btn--ghost-sm" onClick={copyCode}>
                <Copy size={14} /> Copy
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="sa-btn sa-btn--primary-sm" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
              Percent off
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={percentOff}
              onChange={(e) => setPercentOff(Number(e.target.value))}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
            />
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
              Restrict to tier (optional)
            </label>
            <select
              value={tier}
              onChange={(e) => setTier((e.target.value || '') as CustomerTier | '')}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
            >
              <option value="">All customers</option>
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
              <option value="platinum">Platinum</option>
            </select>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginTop: '0.75rem' }}>
              Expires in (days)
            </label>
            <input
              type="number"
              min={1}
              value={expiresDays}
              onChange={(e) => setExpiresDays(Number(e.target.value))}
              style={{ width: '100%', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border-color)' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="sa-btn sa-btn--ghost-sm" onClick={onClose}>
                Cancel
              </button>
              <button className="sa-btn sa-btn--primary-sm" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 size={14} className="spinner" /> : <Ticket size={14} />} Create
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

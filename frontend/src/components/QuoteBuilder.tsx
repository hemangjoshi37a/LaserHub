import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Send, FileText, X, Copy, Loader2 } from 'lucide-react';
import { quotesApi, Quote, QuoteLineItem, QuoteCreatePayload, materialsApi, Material } from '../services';
import { toast } from 'sonner';
import { formatPrice, useCurrencyStore } from '../store/currencyStore';

const STATUS_CHIPS: { key: string | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'expired', label: 'Expired' },
];

const emptyItem = (): QuoteLineItem => ({
  description: '',
  material: '',
  thickness: undefined,
  qty: 1,
  unit_price: 0,
  subtotal: 0,
});

export const QuoteBuilder: React.FC = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);
  const [editor, setEditor] = useState<null | { mode: 'new' } | { mode: 'edit'; quote: Quote }>(null);
  const { currency } = useCurrencyStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, mats] = await Promise.all([
        quotesApi.list(filter ?? undefined),
        materialsApi.listMaterials().catch(() => [] as Material[]),
      ]);
      setQuotes(qs);
      setMaterials(mats);
    } catch (err: any) {
      toast.error("Couldn't load quotes", { description: err?.response?.data?.detail });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const handleCopyLink = (q: Quote) => {
    const url = `${window.location.origin}/q/${q.quote_number}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Public link copied'),
      () => toast.error("Couldn't copy link"),
    );
  };

  const handleDelete = async (q: Quote) => {
    if (!window.confirm(`Delete draft quote ${q.quote_number}?`)) return;
    try {
      await quotesApi.remove(q.id);
      toast.success('Deleted');
      load();
    } catch (err: any) {
      toast.error("Couldn't delete", { description: err?.response?.data?.detail });
    }
  };

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Quote Builder</h1>
          <p className="adm-page-sub">Create custom quotes for off-platform inquiries</p>
        </div>
        <button className="sa-btn sa-btn--primary-sm" onClick={() => setEditor({ mode: 'new' })}>
          <Plus size={14} /> New Quote
        </button>
      </header>

      <div className="adm-filter-chips" style={{ marginBottom: '1rem' }}>
        {STATUS_CHIPS.map((chip) => (
          <button
            key={chip.key ?? 'all'}
            className={`adm-chip ${filter === chip.key ? 'adm-chip--active' : ''}`}
            onClick={() => setFilter(chip.key)}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="adm-card">
        <div className="adm-card-header">
          <h2 className="adm-card-title"><FileText size={18} /> Quotes</h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{quotes.length} total</span>
        </div>

        {loading ? (
          <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <Loader2 className="spinner" size={18} /> Loading...
          </div>
        ) : quotes.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No quotes yet. Click “New Quote” to create one.
          </div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Quote #</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="adm-row">
                    <td className="adm-cell-accent">{q.quote_number}</td>
                    <td>
                      <div className="adm-cell-bold">{q.customer_name}</div>
                      <div className="adm-cell-sub">{q.customer_email}</div>
                    </td>
                    <td>{q.items.length}</td>
                    <td className="adm-cell-bold">{formatPrice(q.total, currency)}</td>
                    <td>
                      <span className={`adm-status-badge adm-status-badge--${
                        q.status === 'accepted' ? 'success' :
                        q.status === 'rejected' || q.status === 'expired' ? 'error' :
                        q.status === 'sent' ? 'info' : 'warning'
                      }`}>{q.status}</span>
                    </td>
                    <td className="adm-cell-sub">{new Date(q.created_at).toLocaleDateString()}</td>
                    <td style={{ display: 'flex', gap: '0.35rem' }}>
                      {/* Backend only allows editing draft/sent quotes — avoid a dead-end Edit button on terminal statuses */}
                      <button className="sa-btn sa-btn--ghost-sm" onClick={() => setEditor({ mode: 'edit', quote: q })}>
                        {q.status === 'draft' || q.status === 'sent' ? 'Edit' : 'View'}
                      </button>
                      {q.status === 'sent' || q.status === 'accepted' ? (
                        <button className="sa-btn sa-btn--ghost-sm" onClick={() => handleCopyLink(q)}>
                          <Copy size={12} /> Link
                        </button>
                      ) : null}
                      {q.status === 'draft' && (
                        <button className="sa-btn sa-btn--danger-sm" onClick={() => handleDelete(q)} aria-label="Delete quote">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editor && (
        <QuoteEditor
          materials={materials}
          initial={editor.mode === 'edit' ? editor.quote : null}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
        />
      )}
    </div>
  );
};

const QuoteEditor: React.FC<{
  initial: Quote | null;
  materials: Material[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ initial, materials, onClose, onSaved }) => {
  const { currency } = useCurrencyStore();
  // Backend rejects updates to accepted/rejected/expired quotes — render those read-only.
  const readOnly = !!initial && initial.status !== 'draft' && initial.status !== 'sent';
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? '');
  const [customerEmail, setCustomerEmail] = useState(initial?.customer_email ?? '');
  const [items, setItems] = useState<QuoteLineItem[]>(initial?.items ?? [emptyItem()]);
  const [setupFee, setSetupFee] = useState(initial?.setup_fee ?? 0);
  const [taxPct, setTaxPct] = useState(() => {
    if (!initial) return 8;
    if (!initial.subtotal) return 0;
    return Math.round((initial.tax / initial.subtotal) * 10000) / 100;
  });
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [validUntil, setValidUntil] = useState<string>(initial?.valid_until ? initial.valid_until.slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const updateItem = (idx: number, patch: Partial<QuoteLineItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      const merged = { ...copy[idx], ...patch };
      merged.subtotal = Number(((merged.qty || 0) * (merged.unit_price || 0)).toFixed(2));
      copy[idx] = merged;
      return copy;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const taxAmount = subtotal * (taxPct / 100);
  const total = subtotal + (setupFee || 0) + taxAmount;

  const buildPayload = (): QuoteCreatePayload => ({
    customer_name: customerName,
    customer_email: customerEmail,
    items,
    setup_fee: Number(setupFee) || 0,
    tax: Number(taxAmount.toFixed(2)),
    notes,
    valid_until: validUntil ? new Date(validUntil).toISOString() : null,
  });

  const validate = () => {
    if (!customerName.trim() || !customerEmail.trim()) {
      toast.error('Customer name and email are required');
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      toast.error('Enter a valid customer email');
      return false;
    }
    if (items.length === 0) {
      toast.error('Add at least one line item');
      return false;
    }
    return true;
  };

  const saveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      if (initial) {
        await quotesApi.update(initial.id, buildPayload());
        toast.success('Quote updated');
      } else {
        await quotesApi.create(buildPayload());
        toast.success('Draft saved');
      }
      onSaved();
    } catch (err: any) {
      toast.error("Couldn't save", { description: err?.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  };

  const sendQuote = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      let q: Quote;
      if (initial) {
        q = await quotesApi.update(initial.id, buildPayload());
      } else {
        q = await quotesApi.create(buildPayload());
      }
      await quotesApi.send(q.id);
      toast.success('Quote sent', { description: `Public link: /q/${q.quote_number}` });
      onSaved();
    } catch (err: any) {
      toast.error("Couldn't send", { description: err?.response?.data?.detail });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 95vw)', height: '100%', background: 'var(--bg-primary, #fff)',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.1)', padding: '1.5rem', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>{initial ? `${readOnly ? 'View' : 'Edit'} ${initial.quote_number}` : 'New Quote'}</h2>
          <button className="sa-btn sa-btn--ghost-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
          <label>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Customer name</div>
            <input className="sa-input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} style={inputStyle} disabled={readOnly} />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Customer email</div>
            <input className="sa-input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} style={inputStyle} disabled={readOnly} />
          </label>
        </div>

        <h3 style={{ fontSize: '0.875rem', margin: '1rem 0 0.5rem' }}>Line items</h3>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 6, padding: '0.5rem' }}>
          {items.map((item, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 0.7fr 1fr 1fr auto', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
              <input placeholder="Description" value={item.description} onChange={(e) => updateItem(idx, { description: e.target.value })} style={inputStyle} disabled={readOnly} />
              <select value={item.material} onChange={(e) => updateItem(idx, { material: e.target.value })} style={inputStyle} disabled={readOnly}>
                <option value="">Material...</option>
                {materials.map((m) => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <input placeholder="mm" type="number" step="0.1" value={item.thickness ?? ''} onChange={(e) => updateItem(idx, { thickness: e.target.value ? Number(e.target.value) : undefined })} style={inputStyle} disabled={readOnly} />
              <input placeholder="Qty" type="number" min={1} value={item.qty} onChange={(e) => updateItem(idx, { qty: Number(e.target.value) || 0 })} style={inputStyle} disabled={readOnly} />
              <input placeholder="Unit price" type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(idx, { unit_price: Number(e.target.value) || 0 })} style={inputStyle} disabled={readOnly} />
              <div style={{ textAlign: 'right', fontWeight: 600 }}>{formatPrice(item.subtotal, currency)}</div>
              {!readOnly && (
                <button className="sa-btn sa-btn--ghost-sm" onClick={() => removeItem(idx)} aria-label="Remove"><Trash2 size={12} /></button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button className="sa-btn sa-btn--ghost-sm" onClick={addItem}><Plus size={12} /> Add item</button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
          <label>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Setup fee</div>
            <input type="number" step="0.01" value={setupFee} onChange={(e) => setSetupFee(Number(e.target.value) || 0)} style={inputStyle} disabled={readOnly} />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Tax %</div>
            <input type="number" step="0.01" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value) || 0)} style={inputStyle} disabled={readOnly} />
          </label>
          <label>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Valid until</div>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={inputStyle} disabled={readOnly} />
          </label>
        </div>

        <label style={{ display: 'block', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 4 }}>Notes</div>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} disabled={readOnly} />
        </label>

        <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary, #f5f5f5)', borderRadius: 6, fontSize: '0.875rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><strong>{formatPrice(subtotal, currency)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Setup fee</span><strong>{formatPrice((Number(setupFee) || 0), currency)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Tax ({taxPct}%)</span><strong>{formatPrice(taxAmount, currency)}</strong></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: '0.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.4rem' }}>
            <span>Total</span><strong>{formatPrice(total, currency)}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="sa-btn sa-btn--ghost-sm" onClick={onClose} disabled={saving}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <>
              <button className="sa-btn sa-btn--ghost-sm" onClick={saveDraft} disabled={saving}>Save Draft</button>
              <button className="sa-btn sa-btn--primary-sm" onClick={sendQuote} disabled={saving}>
                <Send size={12} /> {initial?.status === 'sent' ? 'Re-send' : 'Send to Customer'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.4rem 0.55rem',
  border: '1px solid var(--border-color)',
  borderRadius: 4,
  fontSize: '0.85rem',
  background: 'var(--bg-primary, #fff)',
  color: 'var(--text-primary, inherit)',
};

export default QuoteBuilder;

import React, { useEffect, useState, useCallback } from 'react';
import { Package, AlertTriangle, X, Clock, User, Box, Loader2 } from 'lucide-react';
import { adminApi, vendorApi, KanbanCard } from '../services';
import { toast } from 'sonner';
import { formatPrice, useCurrencyStore } from '../store/currencyStore';

type Columns = Record<string, KanbanCard[]>;

const COLUMN_DEFS: { key: string; label: string; tone: string }[] = [
  { key: 'pending', label: 'Pending', tone: 'warning' },
  { key: 'accepted', label: 'Accepted', tone: 'info' },
  { key: 'in_production', label: 'In Production', tone: 'info' },
  { key: 'shipped', label: 'Shipped', tone: 'info' },
  { key: 'completed', label: 'Completed', tone: 'success' },
  { key: 'cancelled', label: 'Cancelled', tone: 'error' },
];

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isUrgent(card: KanbanCard): boolean {
  if (!card.deadline) return false;
  const deadline = new Date(card.deadline).getTime();
  return deadline - Date.now() < 2 * 24 * 60 * 60 * 1000;
}

// Build the "Material • Nmm × Qty" spec line from whatever the order actually
// exposes. Some sources (e.g. the vendor /orders endpoint) omit material,
// thickness and/or quantity, so we only render the tokens that are present
// rather than emitting an empty "• mm ×" placeholder.
function buildSpecLine(card: KanbanCard): string | null {
  const tokens: string[] = [];

  const material = (card.material_name ?? '').toString().trim();
  if (material) tokens.push(material);

  if (card.thickness_mm !== null && card.thickness_mm !== undefined) {
    tokens.push(`${card.thickness_mm}mm`);
  }

  if (card.quantity !== null && card.quantity !== undefined) {
    tokens.push(`× ${card.quantity}`);
  }

  if (tokens.length === 0) return null;
  return tokens.join(' • ');
}

interface OrderKanbanProps {
  isVendorView?: boolean;
}

export const OrderKanban: React.FC<OrderKanbanProps> = ({ isVendorView = false }) => {
  const [columns, setColumns] = useState<Columns>({});
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [detail, setDetail] = useState<KanbanCard | null>(null);
  const { currency } = useCurrencyStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isVendorView) {
        // Vendor API returns a flat list, we need to group it by status
        const orders: any[] = await vendorApi.getVendorOrders();
        const grouped: Columns = {
          pending: [],
          accepted: [],
          in_production: [],
          shipped: [],
          completed: [],
          cancelled: [],
        };

        orders.forEach((o) => {
          let bucket = o.status.toLowerCase();
          if (bucket === 'paid') bucket = 'accepted';
          if (!grouped[bucket]) bucket = 'pending';
          
          const card: KanbanCard = {
            id: o.id,
            order_number: o.order_number,
            customer_name: o.customer_name,
            customer_email: o.customer_email || '',
            total_amount: o.vendor_cost || o.total_amount, // Use vendor cost for vendor view
            material_name: o.material_name,
            thickness_mm: o.thickness_mm,
            quantity: o.quantity,
            status: o.status,
            deadline: o.estimated_completion || null,
            notes: o.vendor_notes || o.notes,
            created_at: o.created_at,
          };
          grouped[bucket].push(card);
        });
        setColumns(grouped);
      } else {
        const data = await adminApi.getKanban();
        setColumns(data);
      }
    } catch (error: any) {
      const detail = error.response?.data?.detail || error.message;
      console.error('Failed to load orders:', detail);
      toast.error(`Failed to load orders: ${detail}`);
    } finally {
      setLoading(false);
    }
  }, [isVendorView]);

  useEffect(() => { void load(); }, [load]);

  const handleDragStart = (e: React.DragEvent, card: KanbanCard, fromCol: string) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: card.id, fromCol }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== col) setDragOver(col);
  };

  const handleDragLeave = () => setDragOver(null);

  const handleDrop = async (e: React.DragEvent, toCol: string) => {
    e.preventDefault();
    setDragOver(null);
    let data: { id: number; fromCol: string };
    try {
      data = JSON.parse(e.dataTransfer.getData('application/json'));
    } catch {
      return;
    }
    if (data.fromCol === toCol) return;

    // Optimistic update
    const prev = columns;
    const next: Columns = { ...columns };
    const fromList = [...(next[data.fromCol] || [])];
    const idx = fromList.findIndex((c) => c.id === data.id);
    if (idx < 0) return;
    const [moved] = fromList.splice(idx, 1);
    moved.status = toCol;
    next[data.fromCol] = fromList;
    next[toCol] = [moved, ...(next[toCol] || [])];
    setColumns(next);

    try {
      await adminApi.patchOrderStatus(data.id, toCol);
      toast.success(`Moved to ${toCol.replace('_', ' ')}`);
    } catch (err: any) {
      setColumns(prev);
      toast.error("Couldn't update status", { description: err?.response?.data?.detail });
    }
  };

  if (loading) {
    return (
      <div className="adm-page animate-in">
        <header className="adm-page-header">
          <div>
            <h1 className="adm-page-title">Orders</h1>
            <p className="adm-page-sub">Drag cards between columns to update status</p>
          </div>
        </header>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)' }}>
          <Loader2 className="spinner" size={18} /> Loading board...
        </div>
      </div>
    );
  }

  return (
    <div className="adm-page animate-in">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Orders</h1>
          <p className="adm-page-sub">Drag cards between columns to update status</p>
        </div>
      </header>

      <div
        className="kanban-board"
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.75rem',
          overflowX: 'auto',
          overflowY: 'hidden',
          paddingBottom: '1rem',
          // Constrain to the container so the board's own horizontal scroll
          // engages instead of the row overflowing the page (which previously
          // left the right-most columns unreachable). minWidth:0 lets it shrink
          // inside flex/grid parents.
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {COLUMN_DEFS.map((col) => {
          const cards = columns[col.key] || [];
          const active = dragOver === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key)}
              style={{
                background: 'var(--bg-secondary, #f5f5f5)',
                border: active ? '2px dashed var(--primary-color)' : '1px solid var(--border-color)',
                borderRadius: 8,
                padding: '0.75rem',
                minHeight: 200,
                width: 280,
                flex: '0 0 280px',
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                transition: 'border 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{col.label}</span>
                <span className={`adm-status-badge adm-status-badge--${col.tone}`} style={{ fontSize: '0.7rem' }}>{cards.length}</span>
              </div>

              {cards.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', padding: '1rem 0' }}>
                  No orders
                </div>
              )}

              {cards.map((card) => {
                const urgent = isUrgent(card);
                const specLine = buildSpecLine(card);
                return (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card, col.key)}
                    onClick={() => setDetail(card)}
                    style={{
                      background: 'var(--bg-primary, #fff)',
                      border: '1px solid var(--border-color)',
                      borderLeft: urgent ? '3px solid #ef4444' : '3px solid var(--primary-color)',
                      borderRadius: 6,
                      padding: '0.625rem 0.75rem',
                      cursor: 'grab',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.8rem' }}>{card.order_number}</strong>
                      {urgent && (
                        <span title="Deadline within 2 days" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#ef4444', fontSize: '0.7rem' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                          Urgent
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                      <User size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                      {card.customer_name || card.customer_email}
                    </div>
                    {specLine && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <Box size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                        {specLine}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{formatPrice(card.total_amount, currency)}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <Clock size={11} /> {timeAgo(card.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {detail && <OrderDetailPanel card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
};

const OrderDetailPanel: React.FC<{ card: KanbanCard; onClose: () => void }> = ({ card, onClose }) => {
  const { currency } = useCurrencyStore();
  return (
    <div
      role="dialog"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
        display: 'flex', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(480px, 90vw)', height: '100%', background: 'var(--bg-primary, #fff)',
          boxShadow: '-4px 0 12px rgba(0,0,0,0.1)', padding: '1.5rem', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={18} /> {card.order_number}
          </h2>
          <button onClick={onClose} className="sa-btn sa-btn--ghost-sm" aria-label="Close"><X size={16} /></button>
        </div>

        <section style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Customer</h3>
          <div><strong>{card.customer_name}</strong></div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{card.customer_email}</div>
        </section>

        <section style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Order details</h3>
          {card.material_name && <div>Material: <strong>{card.material_name}</strong></div>}
          {card.thickness_mm !== null && card.thickness_mm !== undefined && <div>Thickness: {card.thickness_mm}mm</div>}
          {card.quantity !== null && card.quantity !== undefined && <div>Quantity: {card.quantity}</div>}
          <div>Amount: <strong>{formatPrice(card.total_amount, currency)}</strong></div>
          <div>Status: <span className="adm-status-badge">{card.status}</span></div>
        </section>

        {(card.carrier || card.tracking_number) && (
          <section style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Shipping</h3>
            {card.carrier && <div>Carrier: {card.carrier}</div>}
            {card.tracking_number && <div>Tracking: {card.tracking_number}</div>}
          </section>
        )}

        {card.notes && (
          <section style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Notes</h3>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{card.notes}</div>
          </section>
        )}

        <section style={{ marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Activity</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.8rem' }}>
            <li style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Created {new Date(card.created_at).toLocaleString()}
            </li>
            {card.updated_at && card.updated_at !== card.created_at && (
              <li style={{ padding: '0.35rem 0', borderBottom: '1px solid var(--border-color)' }}>
                <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Updated {new Date(card.updated_at).toLocaleString()}
              </li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default OrderKanban;

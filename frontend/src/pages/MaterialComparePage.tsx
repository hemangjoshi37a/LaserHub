import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, X, Star, Sparkles, GitCompare } from 'lucide-react';
import { materialsApi } from '../services';
import type { Material } from '../services';
import { toast } from 'sonner';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatPrice } from '../utils/formatPrice';

function strengthLabel(rating: number = 3): string {
  return '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating));
}

export const MaterialComparePage: React.FC = () => {
  useDocumentTitle('Compare Materials — LaserHub');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    materialsApi
      .listMaterials()
      .then((data) => setMaterials(data))
      .catch(() => toast.error('Failed to load materials'))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      else toast.info('You can compare up to 4 materials at a time');
      return next;
    });
  };

  const comparisonList = useMemo(
    () => materials.filter((m) => selected.has(m.id)),
    [materials, selected],
  );

  if (loading) return <div className="container" style={{ padding: '2rem' }}>Loading materials…</div>;

  return (
    <div className="container" style={{ padding: '2rem 1rem', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.8rem' }}>
          <GitCompare size={22} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Compare Materials
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Tick up to 4 materials to compare side-by-side, or try our{' '}
          <Link to="/material-wizard">
            <Sparkles size={12} style={{ verticalAlign: 'middle' }} /> material wizard
          </Link>
          .
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: '0.8rem',
          marginBottom: '2rem',
        }}
      >
        {materials.map((m) => {
          const isSel = selected.has(m.id);
          return (
            <div
              key={m.id}
              onClick={() => toggle(m.id)}
              className={`material-card ${isSel ? 'selected' : ''}`}
              style={{ cursor: 'pointer', padding: '0.9rem', position: 'relative' }}
            >
              <div style={{ position: 'absolute', top: 8, right: 8 }}>
                <input type="checkbox" readOnly checked={isSel} />
              </div>
              <div
                style={{
                  width: '100%',
                  height: 80,
                  borderRadius: 6,
                  background: m.color_hex || '#0ea5e9',
                  marginBottom: '0.6rem',
                  backgroundImage: m.image_url ? `url(${m.image_url})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              />
              <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{m.name}</h4>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {formatPrice(m.rate_per_cm2_mm)}/cm² · <Star size={10} style={{ verticalAlign: 'middle' }} /> {strengthLabel(m.strength_rating)}
              </div>
            </div>
          );
        })}
      </div>

      {comparisonList.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="comparison-table" style={{ width: '100%', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Property</th>
                {comparisonList.map((m) => (
                  <th key={m.id}>{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Cost / cm²</strong></td>
                {comparisonList.map((m) => <td key={m.id}>{formatPrice(m.rate_per_cm2_mm)}</td>)}
              </tr>
              <tr>
                <td><strong>Max thickness</strong></td>
                {comparisonList.map((m) => <td key={m.id}>{m.max_thickness_mm ?? m.available_thicknesses.slice(-1)[0] ?? '—'} mm</td>)}
              </tr>
              <tr>
                <td><strong>Strength</strong></td>
                {comparisonList.map((m) => <td key={m.id}>{strengthLabel(m.strength_rating)}</td>)}
              </tr>
              <tr>
                <td><strong>Outdoor safe</strong></td>
                {comparisonList.map((m) => (
                  <td key={m.id}>{m.outdoor_safe ? <Check size={16} color="#10b981" /> : <X size={16} color="#ef4444" />}</td>
                ))}
              </tr>
              <tr>
                <td><strong>Food safe</strong></td>
                {comparisonList.map((m) => (
                  <td key={m.id}>{m.food_safe ? <Check size={16} color="#10b981" /> : <X size={16} color="#ef4444" />}</td>
                ))}
              </tr>
              <tr>
                <td><strong>Burn behavior</strong></td>
                {comparisonList.map((m) => <td key={m.id}>{m.burn_behavior || '—'}</td>)}
              </tr>
              <tr>
                <td><strong>Finish options</strong></td>
                {comparisonList.map((m) => <td key={m.id}>{m.finish_options || '—'}</td>)}
              </tr>
              <tr>
                <td><strong>Best for</strong></td>
                {comparisonList.map((m) => (
                  <td key={m.id}>{(m.best_use_cases || []).join(', ') || '—'}</td>
                ))}
              </tr>
              <tr>
                <td><strong>Thicknesses</strong></td>
                {comparisonList.map((m) => (
                  <td key={m.id}>{m.available_thicknesses.join(', ')} mm</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Select at least one material to start comparing.
        </div>
      )}
    </div>
  );
};

export default MaterialComparePage;

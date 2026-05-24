import React, { Suspense, useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Heart, Download, Grid, Star, ShoppingCart, Ruler, Layers, FileCode2 } from 'lucide-react';
import { api, resolveMediaUrl } from '../services/api';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { Button, PageHeader, EmptyState } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useAuthStore } from '../store/authStore';
import { toast } from 'sonner';

// Lazy-load the 3D preview so Three.js is only fetched when a user opens a
// design detail page (same as the upload wizard — see OBS-04 in the plan).
const DesignPreview3D = React.lazy(() =>
  import('../components/DesignPreview3D').then((m) => ({ default: m.DesignPreview3D }))
);

interface DesignDetail {
  id: number;
  title: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  file_url: string | null;
  file_id: string | null;
  likes_count: number;
  downloads_count: number;
  creator_name: string;
  is_featured: boolean;
  created_at: string;
  tags: string[];
  dimensions?: { width_mm: number; height_mm: number };
  area_cm2?: number;
  complexity?: string;
  file_format?: string;
}

interface VendorListing {
  id: number;
  vendor_name: string;
  vendor_slug: string;
  material_name: string;
  thickness_mm: number;
  price: number;
  turnaround_days: number;
  eta_days?: number;
  eta_date?: string;
  active_orders?: number;
  rating: number;
}

interface RelatedDesign {
  id: number;
  title: string;
  category: string;
  thumbnail_url: string | null;
  likes_count: number;
  min_price?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  signage: 'Signage',
  jewelry: 'Jewelry',
  home_decor: 'Home Decor',
  art: 'Art',
  mechanical: 'Mechanical',
  packaging: 'Packaging',
  stencils: 'Stencils',
  educational: 'Education',
};

export const DesignDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);
  const [design, setDesign] = useState<DesignDetail | null>(null);
  const [listings, setListings] = useState<VendorListing[]>([]);
  const [related, setRelated] = useState<RelatedDesign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { isAuthenticated } = useAuthStore();

  // Always reflect the design name in the browser tab so it never gets stuck
  // on the app's default title. Fall back gracefully while loading or if a
  // design happens to have a blank title.
  const designTitle = design?.title?.trim();
  useDocumentTitle(designTitle ? `${designTitle} — LaserHub` : 'Design — LaserHub');

  useEffect(() => {
    if (id) loadDesign();
  }, [id]);

  const loadDesign = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/marketplace/designs/${id}`);
      const d: DesignDetail = data.design || data;
      setDesign(d);
      setListings(data.listings || []);

      // Fetch related designs from same category (exclude current)
      if (d?.category) {
        try {
          const relRes = await api.get('/marketplace/designs', {
            params: { category: d.category, limit: 8 },
          });
          const raw: any[] = Array.isArray(relRes.data)
            ? relRes.data
            : relRes.data.designs || [];
          setRelated(raw.filter((r) => r.id !== d.id).slice(0, 4));
        } catch {
          setRelated([]);
        }
      }
    } catch {
      setError('Design not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="public-page" aria-busy="true" aria-label="Loading design">
        <div className="design-detail-layout public-design-layout">
          <div className="design-detail-image">
            <Skeleton height="360px" borderRadius="8px" />
          </div>
          <div className="design-detail-info" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Skeleton height="1.5rem" width="60%" />
            <Skeleton height="1rem" width="40%" />
            <Skeleton height="0.9rem" width="100%" />
            <Skeleton height="0.9rem" width="90%" />
            <Skeleton height="0.9rem" width="80%" />
          </div>
        </div>
        <div style={{ marginTop: '2rem' }}>
          <Skeleton height="1.25rem" width="180px" />
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height="3rem" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (error || !design) {
    return (
      <div className="public-page">
        <ErrorState
          message={error || "Couldn't load design"}
          onRetry={() => loadDesign()}
        />
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/browse">
            <Button variant="secondary">Browse designs</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Hide turnaround column entirely if all rows are blank/zero
  const showTurnaround = listings.some((l) => l.turnaround_days && l.turnaround_days > 0);
  // Hide rating column if every vendor has a 0.0 rating
  const showRating = listings.some((l) => (l.rating || 0) > 0);

  // Route the visitor into the upload/quote flow, pre-seeding this design so
  // the file is auto-loaded there (HomePage reads `design_id`). Optionally
  // carries a specific vendor/material/thickness when ordering a listing.
  // Mirrors the auth gate used elsewhere — `/upload` is a protected route.
  const goToUpload = (listing?: VendorListing) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to continue');
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?returnTo=${returnUrl}`);
      return;
    }
    const params = new URLSearchParams({ design_id: String(design.id) });
    if (design.file_id) params.set('file_id', design.file_id);
    if (listing) {
      params.set('vendor', listing.vendor_slug);
      params.set('material', listing.material_name);
      params.set('thickness', String(listing.thickness_mm));
    }
    // Skip the upload step — the design file is loaded automatically.
    params.set('step', '2');
    navigate(`/upload?${params.toString()}`);
  };

  return (
    <div className="design-detail-page public-page">
      <PageHeader
        title={design.title}
        breadcrumbs={[
          { label: 'Marketplace', to: '/' },
          { label: 'Browse', to: '/browse' },
          { label: design.title },
        ]}
      />

      <div className="design-detail-layout public-design-layout">
        <div className="design-detail-image">
          {design.file_id ? (
            <Suspense
              fallback={
                design.thumbnail_url ? (
                  <img src={resolveMediaUrl(design.thumbnail_url)!} alt={design.title} />
                ) : (
                  <div className="mp-design-placeholder large">
                    <Grid size={48} />
                  </div>
                )
              }
            >
              <DesignPreview3D fileId={design.file_id} thicknessMm={3} />
            </Suspense>
          ) : design.thumbnail_url ? (
            <img src={resolveMediaUrl(design.thumbnail_url)!} alt={design.title} />
          ) : (
            <div className="mp-design-placeholder large">
              <Grid size={48} />
            </div>
          )}
        </div>

        <div className="design-detail-info">
          <p className="mp-design-creator">by {design.creator_name}</p>
          {design.description && <p className="design-description">{design.description}</p>}

          <div className="design-detail-stats">
            <span><Heart size={14} /> {design.likes_count} likes</span>
            <span><Download size={14} /> {design.downloads_count} downloads</span>
            <span className="design-category">
              {CATEGORY_LABELS[design.category] || design.category.replace(/_/g, ' ')}
            </span>
          </div>

          {design.tags && design.tags.length > 0 ? (
            <div className="design-tags">
              {design.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/browse?tag=${encodeURIComponent(tag)}`}
                  className="design-tag tag-pill tag-pill-clickable"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          ) : (
            <p className="design-tags-empty" style={{ color: 'var(--text-muted, #888)', fontSize: '0.85rem', margin: 0 }}>
              No tags yet
            </p>
          )}

          {/* Primary action — always present so the page is never a dead-end,
              even when no vendor has listed a ready-to-buy price. */}
          <div className="design-detail-cta" style={{ marginTop: '1.25rem' }}>
            <Button
              size="lg"
              icon={<ShoppingCart size={18} />}
              onClick={() => goToUpload()}
            >
              {listings.length > 0 ? 'Customize & order' : 'Get a quote'}
            </Button>
          </div>
        </div>

        {/* Specs card (right column on wide screens) */}
        <aside className="public-specs-card">
          <h3>Specs</h3>
          <ul>
            {design.dimensions && (
              <li>
                <Ruler size={14} />
                <span className="spec-label">Dimensions</span>
                <span className="spec-value">
                  {design.dimensions.width_mm}mm × {design.dimensions.height_mm}mm
                </span>
              </li>
            )}
            {design.area_cm2 != null && (
              <li>
                <Layers size={14} />
                <span className="spec-label">Area</span>
                <span className="spec-value">{design.area_cm2.toFixed(2)} cm²</span>
              </li>
            )}
            {design.complexity && (
              <li>
                <Layers size={14} />
                <span className="spec-label">Complexity</span>
                <span className="spec-value">{design.complexity}</span>
              </li>
            )}
            {design.file_format && (
              <li>
                <FileCode2 size={14} />
                <span className="spec-label">Format</span>
                <span className="spec-value">{design.file_format.toUpperCase()}</span>
              </li>
            )}
            <li>
              <span className="spec-label">Category</span>
              <span className="spec-value">
                {CATEGORY_LABELS[design.category] || design.category.replace(/_/g, ' ')}
              </span>
            </li>
          </ul>
        </aside>
      </div>

      <section className="design-listings">
        <h2>Order from a Vendor</h2>
        {listings.length > 0 && (
          <p
            className="design-listings-note"
            style={{ color: 'var(--text-muted, #888)', fontSize: '0.85rem', margin: '0 0 1rem' }}
          >
            Prices shown are indicative starting points. Your final quote is calculated
            from this design's cut length and the material, thickness and quantity you choose.
          </p>
        )}
        {listings.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart size={40} />}
            title="No vendor listings yet"
            description="No shops have listed a ready-to-buy price for this design. You can still order it — customize the material, thickness and quantity to get an instant quote."
            action={
              <div
                className="design-empty-actions"
                style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}
              >
                <Button icon={<ShoppingCart size={16} />} onClick={() => goToUpload()}>
                  Customize &amp; order
                </Button>
                <Link to="/browse">
                  <Button variant="secondary">Browse designs</Button>
                </Link>
              </div>
            }
          />
        ) : (
          <div className="design-listings-table-wrap">
            <table className="public-listings-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Material</th>
                  <th>Thickness</th>
                  <th className="ta-right" title="Indicative starting price — your final quote depends on the design's cut length, material, thickness and quantity">From</th>
                  {showTurnaround && <th title="Based on vendor lead time + current workload">ETA</th>}
                  {showRating && <th>Rating</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link to={`/vendor/${l.vendor_slug}`} className="listing-vendor">
                        {l.vendor_name}
                      </Link>
                    </td>
                    <td>{l.material_name}</td>
                    <td>{l.thickness_mm}mm</td>
                    <td className="ta-right mp-price">from {fp(l.price)}</td>
                    {showTurnaround && (
                      <td className="listing-eta">
                        {l.turnaround_days ? (
                          <>
                            <div className="listing-eta-days">
                              {l.turnaround_days} day{l.turnaround_days === 1 ? '' : 's'}
                            </div>
                            {l.eta_date && (
                              <div className="listing-eta-date">
                                by {new Date(l.eta_date).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </div>
                            )}
                            {typeof l.active_orders === 'number' && l.active_orders >= 5 && (
                              <div className="listing-eta-busy" title={`${l.active_orders} active orders in queue`}>
                                Busy queue
                              </div>
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    {showRating && (
                      <td>
                        <Star size={12} /> {(l.rating || 0).toFixed(1)}
                      </td>
                    )}
                    <td className="ta-right">
                      <Button
                        size="sm"
                        icon={<ShoppingCart size={14} />}
                        onClick={() => goToUpload(l)}
                      >
                        Get quote
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className="public-related">
          <h2>Related Designs</h2>
          <div className="mp-design-grid">
            {related.map((r) => (
              <Link key={r.id} to={`/design/${r.id}`} className="mp-design-card">
                <div className={`mp-design-thumb cat-${r.category}`}>
                  {r.thumbnail_url ? (
                    <img src={resolveMediaUrl(r.thumbnail_url)!} alt={r.title} />
                  ) : (
                    <div className="mp-design-placeholder">
                      <Grid size={40} />
                    </div>
                  )}
                </div>
                <div className="mp-design-info">
                  <h4>{r.title}</h4>
                  <div className="mp-design-meta">
                    <span><Heart size={12} /> {r.likes_count}</span>
                    {r.min_price && <span className="mp-price">From {fp(r.min_price)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

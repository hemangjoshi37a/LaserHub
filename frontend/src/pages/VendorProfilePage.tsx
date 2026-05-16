import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Star,
  MapPin,
  Clock,
  BadgeCheck,
  Mail,
  Calendar,
  Package,
  MessageSquare,
  Info,
  LayoutGrid,
  ShoppingBag,
  Phone,
  Globe,
  FileText,
  Store,
  ShieldCheck,
  MapPinned,
  CreditCard,
  ExternalLink,
  ImageIcon,
} from 'lucide-react';
import { marketplaceApi, vendorApi, VendorProfile, VendorMaterialItem, VendorListingItem } from '../services/index';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { Avatar, Button, EmptyState, PageHeader } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Tab = 'materials' | 'listings' | 'reviews' | 'details' | 'about';
type DetailsSubTab = 'platform' | 'gmb';

// Relative time helper — keeps us off date-fns
function relativeTime(iso?: string): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  return `on ${new Date(iso).toLocaleDateString()}`;
}

interface ReviewItem {
  id: number;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

const RatingStars: React.FC<{ rating: number; size?: number }> = ({ rating, size = 14 }) => (
  <span className="vendor-rating-stars">
    {Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        size={size}
        fill={rating >= i + 1 ? 'currentColor' : 'none'}
        strokeWidth={rating >= i + 1 ? 0 : 1.5}
        className={rating >= i + 1 ? 'star-filled' : 'star-empty'}
      />
    ))}
    <span className="vendor-rating-value">{(rating || 0).toFixed(1)}</span>
  </span>
);

export const VendorProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);

  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [materials, setMaterials] = useState<VendorMaterialItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [listings, setListings] = useState<VendorListingItem[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('materials');
  const [detailsSubTab, setDetailsSubTab] = useState<DetailsSubTab>('platform');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useDocumentTitle(vendor ? `${vendor.shop_name} — LaserHub` : 'Vendor — LaserHub');

  useEffect(() => {
    if (slug) loadVendor(slug);
  }, [slug]);

  const loadVendor = async (vendorSlug: string) => {
    setLoading(true);
    try {
      const profile = await vendorApi.getVendor(vendorSlug);
      setVendor(profile);

      // Load all tabs in parallel; each failure degrades gracefully
      const [mats, revs, lists] = await Promise.allSettled([
        vendorApi.getVendorMaterials(profile.id),
        marketplaceApi.getVendorReviews(profile.id),
        vendorApi.getVendorListings(profile.id),
      ]);

      setMaterials(mats.status === 'fulfilled' ? mats.value : []);
      setReviews(revs.status === 'fulfilled' ? (revs.value as ReviewItem[]) : []);
      setListings(lists.status === 'fulfilled' ? lists.value : []);
    } catch {
      setError('Vendor not found');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="public-page" aria-busy="true" aria-label="Loading vendor profile">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <Skeleton width="96px" height="96px" borderRadius="50%" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Skeleton height="1.5rem" width="40%" />
            <Skeleton height="1rem" width="70%" />
            <Skeleton height="0.9rem" width="50%" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} width="100px" height="2rem" borderRadius="6px" />
          ))}
        </div>
        <div className="skeleton-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton-card">
              <Skeleton height="120px" borderRadius="6px" />
              <Skeleton height="1rem" width="80%" />
              <Skeleton height="0.8rem" width="60%" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error || !vendor) {
    return (
      <div className="public-page">
        <ErrorState
          message={error || "Couldn't load vendor profile"}
          onRetry={slug ? () => loadVendor(slug) : undefined}
        />
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <Link to="/vendors">
            <Button variant="secondary">Browse all vendors</Button>
          </Link>
        </div>
      </div>
    );
  }

  const memberSince = vendor.created_at
    ? new Date(vendor.created_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
      })
    : null;

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'materials', label: 'Materials', icon: <Package size={16} />, count: materials.length },
    { id: 'listings', label: 'Listings', icon: <LayoutGrid size={16} />, count: listings.length },
    { id: 'reviews', label: 'Reviews', icon: <MessageSquare size={16} />, count: reviews.length },
    { id: 'details', label: 'Details', icon: <CreditCard size={16} /> },
    { id: 'about', label: 'About', icon: <Info size={16} /> },
  ];

  const hasPlatformInfo = !!(
    vendor.phone_number ||
    vendor.business_email ||
    vendor.website ||
    vendor.business_address ||
    vendor.gst_number ||
    vendor.logo_url ||
    vendor.storefront_image_url
  );

  const hasGmbInfo = !!(
    vendor.gmb_place_id ||
    vendor.gmb_name ||
    vendor.gmb_phone ||
    vendor.gmb_address ||
    vendor.gmb_website ||
    vendor.gmb_rating != null ||
    vendor.gmb_maps_url
  );

  const gmbMapsHref =
    vendor.gmb_maps_url ||
    (vendor.gmb_place_id
      ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(vendor.gmb_place_id)}`
      : null);

  return (
    <div className="bv-vendor-profile public-page">
      {/* Banner */}
      <div className="bv-vendor-hero-banner">
        {vendor.banner_url ? (
          <img src={vendor.banner_url} alt="" />
        ) : (
          <div style={{ 
            background: `linear-gradient(135deg, #1e293b 0%, #0f172a 100%)`,
            height: '100%',
            opacity: 0.1
          }} />
        )}
      </div>

      {/* Header Card */}
      <div className="bv-vendor-profile-header">
        <div className="bv-vendor-profile-card">
          <div className="bv-vendor-profile-logo">
            <Avatar 
              src={vendor.logo_url} 
              name={vendor.shop_name} 
              size={124}
              style={{ width: '100%', height: '100%', borderRadius: '12px' }}
            />
          </div>
          
          <div className="bv-vendor-profile-main">
            <div className="bv-vendor-profile-title">
              <h1>{vendor.shop_name}</h1>
              {vendor.is_verified && (
                <BadgeCheck size={28} className="bv-vendor-profile-verified" />
              )}
            </div>

            <div className="bv-vendor-profile-meta">
              <div className="meta-item">
                <RatingStars rating={vendor.rating || 0} size={16} />
                <span>{(vendor.rating || 0).toFixed(1)} / 5.0</span>
              </div>
              <div className="meta-item">
                <ShoppingBag size={18} />
                <span>{vendor.total_orders || 0} Successful Orders</span>
              </div>
              <div className="meta-item">
                <MapPin size={18} />
                <span>{vendor.location || 'Global Operations'}</span>
              </div>
            </div>

            <div className="bv-vendor-profile-actions">
              <Link to={`/upload?vendor=${encodeURIComponent(vendor.slug)}`}>
                <button className="sa-btn sa-btn--primary">
                  <Mail size={18} />
                  Start a Project
                </button>
              </Link>
              {vendor.website && (
                <a href={vendor.website} target="_blank" rel="noopener noreferrer">
                  <button className="sa-btn sa-btn--ghost">
                    <Globe size={18} />
                    Official Website
                  </button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Navigation */}
      <nav className="bv-vendor-nav">
        <div className="bv-vendor-nav-inner">
          {tabs.map((t) => (
            <div
              key={t.id}
              className={`bv-vendor-nav-item ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {typeof t.count === 'number' && t.count > 0 && ` (${t.count})`}
            </div>
          ))}
        </div>
      </nav>

      {/* Content Area */}
      <div className="bv-vendor-content">
        <div className="bv-vendor-content-main">
          {activeTab === 'materials' && (
            <div className="adm-card">
              <div className="card-header">
                <h3 className="card-title">Available Materials</h3>
              </div>
              <div className="card-body">
                {materials.length === 0 ? (
                  <EmptyState title="No materials listed" icon={<Package size={40} />} />
                ) : (
                  <div className="bv-materials-table-wrap">
                    <table className="sa-table">
                      <thead>
                        <tr>
                          <th>Material Name</th>
                          <th>Thickness</th>
                          <th>Availability</th>
                          <th>Lead Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {materials.map(m => (
                          <tr key={m.id}>
                            <td style={{ fontWeight: 600 }}>{m.material_name}</td>
                            <td>{m.thickness_mm}mm</td>
                            <td>
                              <span className={`sa-status sa-status--${m.is_in_stock ? 'success' : 'danger'}`}>
                                {m.is_in_stock ? 'In Stock' : 'Out of Stock'}
                              </span>
                            </td>
                            <td>{m.lead_time_days} Days</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'listings' && (
            <div className="mp-design-grid">
              {listings.map((d) => (
                <Link key={d.id} to={`/design/${d.id}`} className="mp-design-card-wrapper">
                  <div className="mp-design-thumb">
                    {d.thumbnail_url ? (
                      <img src={d.thumbnail_url} alt={d.title} />
                    ) : (
                      <div className="mp-design-placeholder"><LayoutGrid size={40} /></div>
                    )}
                  </div>
                  <div className="mp-design-info">
                    <h4>{d.title}</h4>
                    <p className="mp-design-desc">{d.material_name} · {d.thickness_mm}mm</p>
                    <div className="mp-design-meta">
                      <span className="mp-price">{fp(d.price)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="bv-reviews-list">
              {reviews.map((r) => (
                <div key={r.id} className="adm-card mb-1">
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Avatar name={r.user_name} size={40} />
                        <div>
                          <div style={{ fontWeight: 700 }}>{r.user_name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <RatingStars rating={r.rating} />
                    </div>
                    <p style={{ lineHeight: 1.6 }}>{r.comment}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="adm-card">
              <div className="card-header">
                <h3 className="card-title">Workshop Story</h3>
              </div>
              <div className="card-body">
                <p style={{ fontSize: '1.1rem', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                  {vendor.description || `${vendor.shop_name} is a premier laser cutting facility specializing in high-precision components and custom fabrication services.`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Info */}
        <aside className="bv-vendor-sidebar">
          <div className="adm-card">
            <div className="card-header">
              <h3 className="card-title">Workshop Details</h3>
            </div>
            <div className="card-body">
              <div className="vd-info-list">
                <div className="vd-info-item">
                  <Clock size={16} />
                  <div>
                    <div className="label">Avg. Turnaround</div>
                    <div className="value">{vendor.avg_turnaround_days || 3} Business Days</div>
                  </div>
                </div>
                <div className="vd-info-item">
                  <ShieldCheck size={16} />
                  <div>
                    <div className="label">Verification</div>
                    <div className="value">{vendor.is_verified ? 'Verified Partner' : 'Standard Vendor'}</div>
                  </div>
                </div>
                <div className="vd-info-item">
                  <Calendar size={16} />
                  <div>
                    <div className="label">Member Since</div>
                    <div className="value">{memberSince}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="adm-card mt-1">
            <div className="card-header">
              <h3 className="card-title">Contact Information</h3>
            </div>
            <div className="card-body">
              <div className="vd-info-list">
                {vendor.business_email && (
                  <div className="vd-info-item">
                    <Mail size={16} />
                    <div className="value">{vendor.business_email}</div>
                  </div>
                )}
                {vendor.phone_number && (
                  <div className="vd-info-item">
                    <Phone size={16} />
                    <div className="value">{vendor.phone_number}</div>
                  </div>
                )}
                {vendor.business_address && (
                  <div className="vd-info-item">
                    <MapPin size={16} />
                    <div className="value" style={{ fontSize: '0.85rem' }}>{vendor.business_address}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .vd-info-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .vd-info-item {
          display: flex;
          gap: 1rem;
          align-items: flex-start;
          color: var(--text-secondary);
        }
        .vd-info-item svg {
          color: var(--dash-accent);
          flex-shrink: 0;
          margin-top: 2px;
        }
        .vd-info-item .label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
          color: var(--text-tertiary);
          margin-bottom: 2px;
        }
        .vd-info-item .value {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .mb-1 { margin-bottom: 1rem; }
        .mt-1 { margin-top: 1rem; }
      `}</style>
    </div>
  );
};

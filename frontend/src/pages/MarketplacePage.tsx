import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Upload,
  Heart,
  ArrowRight,
  Sparkles,
  Users,
  Grid,
  Zap,
  Type,
  Gem,
  Home,
  Palette,
  Cog,
  Package,
  Square,
  BookOpen,
  Star,
  MapPin,
} from 'lucide-react';
import { api, resolveMediaUrl } from '../services/api';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { Avatar, Badge } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FeaturedDesign {
  id: number;
  title: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  likes_count: number;
  downloads_count: number;
  creator_name: string;
  is_featured: boolean;
  min_price?: number;
  vendor_count?: number;
}

interface VendorInfo {
  id: number;
  shop_name: string;
  slug: string;
  rating: number;
  total_orders: number;
  location: string;
  logo_url: string | null;
  specialties?: string[];
  description?: string;
}

interface Listing {
  id: number;
  design_id: number;
  design_title: string;
  vendor_name: string;
  material_name: string;
  thickness_mm: number;
  price: number;
  sold_count: number;
  thumbnail_url: string | null;
}

const CATEGORIES = [
  { id: 'signage', name: 'Signage', Icon: Type },
  { id: 'jewelry', name: 'Jewelry', Icon: Gem },
  { id: 'home_decor', name: 'Home Decor', Icon: Home },
  { id: 'art', name: 'Art', Icon: Palette },
  { id: 'mechanical', name: 'Mechanical', Icon: Cog },
  { id: 'packaging', name: 'Packaging', Icon: Package },
  { id: 'stencils', name: 'Stencils', Icon: Square },
  { id: 'educational', name: 'Education', Icon: BookOpen },
];

// Names that are obvious demo/test data and should not be shown publicly.
// Removed isDemoVendor filter to ensure all registered vendors are shown as requested by the user.

export const MarketplacePage: React.FC = () => {
  useDocumentTitle('Marketplace — LaserHub');
  const [featured, setFeatured] = useState<FeaturedDesign[]>([]);
  const [popular, setPopular] = useState<FeaturedDesign[]>([]);
  const [vendors, setVendors] = useState<VendorInfo[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState({ total_designs: 0, total_vendors: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const navigate = useNavigate();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);

  useEffect(() => {
    loadMarketplace();
  }, []);

  const loadMarketplace = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get('/marketplace/featured');
      setFeatured(data.featured_designs || []);
      setPopular(data.popular_designs || []);
      setVendors(data.top_vendors || []);
      setListings(data.recent_listings || []);
      setStats(data.stats || { total_designs: 0, total_vendors: 0 });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const visibleVendors = vendors;

  // UI-B-01: dedupe listings by design_id. Show one card per design with the
  // lowest price and a count of material variants. Buyers pick material/thickness
  // on the design detail page.
  const groupedListings = useMemo(() => {
    const byDesign = new Map<number, Listing[]>();
    for (const l of listings) {
      const arr = byDesign.get(l.design_id);
      if (arr) arr.push(l);
      else byDesign.set(l.design_id, [l]);
    }
    return Array.from(byDesign.values()).map((group) => {
      // Use the first listing as the representative (title, vendor, thumbnail).
      const rep = group[0];
      const minPrice = Math.min(...group.map((x) => x.price));
      return { rep, minPrice, variantCount: group.length };
    });
  }, [listings]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/browse?search=${encodeURIComponent(search)}`);
    }
  };

  return (
    <div className="marketplace-page public-page">
      {/* Hero */}
      <section className="mp-hero">
        <div className="mp-hero-content">
          <h1>Laser Cutting Marketplace</h1>
          <p>Browse designs, compare vendors, get instant quotes — or upload your own.</p>
          <form className="mp-search-bar" onSubmit={handleSearch}>
            <Search size={18} />
            <input
              type="text"
              placeholder="Search designs, materials, vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          <div className="mp-hero-stats">
            <span><Sparkles size={14} /> {stats.total_designs} Designs</span>
            <span><Users size={14} /> {stats.total_vendors} Vendors</span>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="mp-actions">
        <Link to="/upload" className="mp-action-card">
          <Upload size={24} />
          <div>
            <h3>Custom Cut</h3>
            <p>Upload your design & get quotes</p>
          </div>
          <ArrowRight size={16} />
        </Link>
        <Link to="/browse" className="mp-action-card">
          <Grid size={24} />
          <div>
            <h3>Browse Designs</h3>
            <p>Ready-made designs from the community</p>
          </div>
          <ArrowRight size={16} />
        </Link>
        <Link to="/vendors" className="mp-action-card">
          <Zap size={24} />
          <div>
            <h3>Find Vendors</h3>
            <p>Compare prices & turnaround times</p>
          </div>
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Categories */}
      <section className="mp-section">
        <div className="mp-section-header">
          <h2>Categories</h2>
          <Link to="/browse">View all <ArrowRight size={14} /></Link>
        </div>
        <div className="mp-categories public-categories">
          {CATEGORIES.map(({ id, name, Icon }) => (
            <Link key={id} to={`/browse?category=${id}`} className="mp-category-card public-category-card">
              <span className="public-cat-icon"><Icon size={22} /></span>
              <span>{name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Loading skeleton for featured + vendors + listings */}
      {loading && (
        <>
          <section className="mp-section" aria-busy="true" aria-label="Loading designs">
            <div className="mp-section-header"><h2>Featured Designs</h2></div>
            <div className="mp-design-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="mp-design-card skeleton-card">
                  <Skeleton height="160px" borderRadius="6px" />
                  <Skeleton height="1rem" width="75%" />
                  <Skeleton height="0.8rem" width="50%" />
                </div>
              ))}
            </div>
          </section>
          <section className="mp-section" aria-busy="true" aria-label="Loading vendors">
            <div className="mp-section-header"><h2>Top Vendors</h2></div>
            <div className="mp-vendor-grid public-vendor-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="mp-vendor-card public-vendor-card skeleton-card">
                  <Skeleton width="56px" height="56px" borderRadius="50%" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <Skeleton height="1rem" width="60%" />
                    <Skeleton height="0.75rem" width="80%" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Error state for marketplace data */}
      {!loading && loadError && (
        <section className="mp-section">
          <ErrorState
            message="Couldn't load marketplace"
            onRetry={() => loadMarketplace()}
          />
        </section>
      )}

      {/* Featured Designs */}
      {!loading && (featured.length > 0 || popular.length > 0) && (
        <section className="mp-section">
          <div className="mp-section-header">
            <h2>{featured.length > 0 ? 'Featured Designs' : 'Popular Designs'}</h2>
            <Link to="/browse">View all <ArrowRight size={14} /></Link>
          </div>
          <div className="mp-design-grid">
            {(featured.length > 0 ? featured : popular).map(design => (
              <Link key={design.id} to={`/design/${design.id}`} className="mp-design-card">
                <div className={`mp-design-thumb cat-${design.category}`}>
                  {design.thumbnail_url ? (
                    <img src={resolveMediaUrl(design.thumbnail_url)!} alt={design.title} />
                  ) : (
                    <div className="mp-design-placeholder">
                      <Grid size={40} />
                    </div>
                  )}
                  {design.is_featured && <span className="mp-badge">Featured</span>}
                  <span className="mp-cat-pill">{design.category.replace('_', ' ')}</span>
                </div>
                <div className="mp-design-info">
                  <h4>{design.title}</h4>
                  {design.description && (
                    <p className="mp-design-desc">{design.description}</p>
                  )}
                  <p className="mp-design-creator">by {design.creator_name}</p>
                  <div className="mp-design-meta">
                    <span><Heart size={12} /> {design.likes_count}</span>
                    {design.min_price && <span className="mp-price">From {fp(design.min_price)}</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top Vendors */}
      {!loading && visibleVendors.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <h2>Top Vendors</h2>
            <Link to="/vendors">View all <ArrowRight size={14} /></Link>
          </div>
          <div className="mp-vendor-grid public-vendor-grid">
            {visibleVendors.map((v) => (
              <Link key={v.id} to={`/vendor/${v.slug}`} className="mp-vendor-card public-vendor-card">
                <div className="mp-vendor-card-header">
                  <Avatar src={resolveMediaUrl(v.logo_url)} name={v.shop_name} size={64} />
                  <div className="mp-vendor-status">
                    {v.total_orders > 10 && <Badge variant="success">Top Rated</Badge>}
                  </div>
                </div>
                <div className="mp-vendor-info">
                  <h4>{v.shop_name}</h4>
                  <div className="mp-vendor-meta">
                    <span className="rating-pill">
                      <Star size={12} fill="currentColor" /> 
                      {(v.rating || 0).toFixed(1)}
                    </span>
                    <span>{v.total_orders || 0} orders</span>
                  </div>
                  {v.location && (
                    <p className="mp-vendor-loc">
                      <MapPin size={12} /> {v.location}
                    </p>
                  )}
                  {v.specialties && v.specialties.length > 0 && (
                    <div className="public-vendor-specialties">
                      {v.specialties.slice(0, 2).map((s) => (
                        <span key={s} className="specialty-tag">{s}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Listings */}
      {!loading && groupedListings.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <h2>Ready to Buy</h2>
          </div>
          <div className="mp-listings-grid public-listings-grid">
            {groupedListings.map(({ rep, minPrice, variantCount }) => (
              <Link
                key={rep.design_id}
                to={`/design/${rep.design_id}`}
                className="mp-listing-card public-listing-card"
              >
                <div className="public-listing-thumb">
                  {rep.thumbnail_url ? (
                    <img
                      src={resolveMediaUrl(rep.thumbnail_url)!}
                      alt={rep.design_title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="public-listing-thumb-placeholder" aria-hidden>
                      <Grid size={36} />
                    </div>
                  )}
                  <span className="public-listing-badge">
                    {variantCount === 1 ? '1 material' : `${variantCount} materials`}
                  </span>
                </div>
                <div className="public-listing-body">
                  <h4 className="public-listing-title">{rep.design_title}</h4>
                  <p className="public-listing-vendor">by {rep.vendor_name}</p>
                  {variantCount === 1 && (
                    <p className="public-listing-material">{rep.material_name}</p>
                  )}
                </div>
                <div className="public-listing-bottom">
                  <div className="public-listing-price">
                    <span className="public-listing-price-label">From</span>
                    <span className="mp-price">{fp(minPrice)}</span>
                  </div>
                  <span className="cta-hint">Buy →</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA: Become a Vendor */}
      <section className="mp-cta">
        <h2>Are you a laser cutting shop?</h2>
        <p>Join LaserHub marketplace and reach thousands of customers worldwide.</p>
        <Link to="/vendor/register" className="mp-cta-btn">Become a Vendor <ArrowRight size={16} /></Link>
      </section>
    </div>
  );
};

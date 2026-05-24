import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, MapPin, Search, BadgeCheck, SearchX } from 'lucide-react';
import { api } from '../services/api';
import { Avatar, EmptyState, PageHeader } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// On-brand banner gradient used as a fallback when a vendor has no cover image.
// Stays within the app's slate/sky dark palette (rather than a random saturated
// hue) so the header reads as an intentional branded band, not a stray void.
const gradientFor = (id: number): string => {
  const hue = 200 + ((id * 47) % 40); // 200–239: cyan→blue band, always on-theme
  return `linear-gradient(135deg, hsl(${hue},45%,24%) 0%, hsl(${hue + 18},40%,15%) 100%)`;
};

interface Vendor {
  id: number;
  shop_name: string;
  slug: string;
  description: string;
  rating: number;
  total_orders: number;
  location: string;
  logo_url: string | null;
  banner_url?: string | null;
  materials_count?: number;
  is_verified?: boolean;
  specialties?: string[];
}

export const VendorsPage: React.FC = () => {
  useDocumentTitle('Laser Cutting Vendors — LaserHub');
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [specialtyFilter, setSpecialtyFilter] = useState('');

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get('/vendors/');
      setVendors(Array.isArray(data) ? data : data.vendors || []);
    } catch {
      setVendors([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const { locations, specialties } = useMemo(() => {
    const locs = new Set<string>();
    const specs = new Set<string>();
    vendors.forEach((v) => {
      if (v.location) locs.add(v.location);
      (v.specialties || []).forEach((s) => specs.add(s));
    });
    return {
      locations: Array.from(locs).sort(),
      specialties: Array.from(specs).sort(),
    };
  }, [vendors]);

  const filtered = vendors
    .filter((v) => {
      const q = searchText.toLowerCase();
      const matchesSearch =
        !q ||
        v.shop_name.toLowerCase().includes(q) ||
        (v.location || '').toLowerCase().includes(q) ||
        (v.description || '').toLowerCase().includes(q);
      const matchesLocation = !locationFilter || v.location === locationFilter;
      const matchesRating = (v.rating || 0) >= minRating;
      const matchesSpecialty =
        !specialtyFilter || (v.specialties || []).includes(specialtyFilter);
      return matchesSearch && matchesLocation && matchesRating && matchesSpecialty;
    });

  const clearFilters = () => {
    setSearchText('');
    setLocationFilter('');
    setMinRating(0);
    setSpecialtyFilter('');
  };

  return (
    <div className="vendors-page public-page">
      <PageHeader
        title="The Vendor Marketplace"
        subtitle="Discover verified laser cutting shops and precision workshops."
        breadcrumbs={[
          { label: 'Marketplace', to: '/' },
          { label: 'Shops' },
        ]}
      />

      <div className="public-vendor-toolbar">
        <div className="browse-search vendors-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Find a shop by name, city or specialty..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="public-vendor-filters">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            <option value="">All Regions</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
          >
            <option value={0}>Top Rated</option>
            <option value={3}>3.0+ Stars</option>
            <option value={4}>4.0+ Stars</option>
          </select>
          {specialties.length > 0 && (
            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
            >
              <option value="">All Specialties</option>
              {specialties.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mp-vendor-grid public-vendor-grid" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="public-vendor-card skeleton-card">
              <Skeleton height="100px" />
              <div style={{ padding: '20px' }}>
                <Skeleton height="1.2rem" width="60%" />
                <Skeleton height="0.8rem" width="90%" style={{ marginTop: '1rem' }} />
                <Skeleton height="0.8rem" width="40%" style={{ marginTop: '0.5rem' }} />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <ErrorState message="Couldn't load shops" onRetry={() => loadVendors()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={40} />}
          title="No shops found"
          description="Try adjusting your search or filters to find more vendors."
          action={<button className="vendors-clear-search" onClick={clearFilters}>Clear Filters</button>}
        />
      ) : (
        <div className="mp-vendor-grid public-vendor-grid">
          {filtered.map((v) => {
            const hasBanner = !!v.banner_url;
            return (
            <Link key={v.id} to={`/vendor/${v.slug}`} className="public-vendor-card">
              {hasBanner ? (
                // Vendor has a real cover image: keep the full banner + corner logo.
                <div className="vendor-card-banner">
                  <img src={v.banner_url!} alt="" />
                  <div className="vendor-card-logo-overlap">
                    <Avatar
                      src={v.logo_url}
                      name={v.shop_name}
                      size={56}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: 0,
                        background: '#fff',
                        fontSize: 20,
                      }}
                    />
                  </div>
                </div>
              ) : (
                // No cover image: collapse the empty banner into a compact branded
                // band with a centered logo/initials medallion so the card header
                // looks intentional instead of a large blank void.
                <div
                  className="vendor-card-banner"
                  // overflow:visible so the medallion (which intentionally straddles
                  // below the band via bottom:-22) isn't clipped by the banner's
                  // default overflow:hidden (that clip is only needed for cover imgs).
                  style={{ height: 64, width: '100%', background: gradientFor(v.id), overflow: 'visible' }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 20,
                      bottom: -22,
                      width: 52,
                      height: 52,
                      borderRadius: 12,
                      border: '3px solid var(--bg-primary)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      overflow: 'hidden',
                    }}
                  >
                    <Avatar
                      src={v.logo_url}
                      name={v.shop_name}
                      size={52}
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: 0,
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        fontSize: 18,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>
              )}

              <div
                className="vendor-card-content"
                style={hasBanner ? undefined : { paddingTop: 32 }}
              >
                <div className="vendor-card-header">
                  <div className="vendor-card-title">
                    <h4>{v.shop_name}</h4>
                  </div>
                  {v.is_verified && (
                    <BadgeCheck size={18} className="vendor-verified-badge" />
                  )}
                </div>

                <div className="vendor-card-location">
                  <MapPin size={12} />
                  <span>{v.location || 'Global Shipping'}</span>
                </div>

                <p className="vendor-card-description">
                  {v.description || 'Specialized in precision laser cutting and professional sheet metal fabrication.'}
                </p>

                <div className="vendor-card-tags">
                  {(v.specialties || ['Precision', 'QuickShip']).slice(0, 3).map(s => (
                    <span key={s} className="tag-badge">{s}</span>
                  ))}
                </div>

                <div className="vendor-card-stats">
                  <div className="stat-item">
                    <Star size={14} fill="#f59e0b" stroke="#f59e0b" />
                    <span>{(v.rating || 0).toFixed(1)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Orders:</span>
                    <span>{v.total_orders || 0}</span>
                  </div>
                </div>
              </div>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

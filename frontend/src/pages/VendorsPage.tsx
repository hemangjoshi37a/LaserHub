import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, MapPin, Search, BadgeCheck, SearchX } from 'lucide-react';
import { api } from '../services/api';
import { Avatar, Badge, EmptyState, PageHeader } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const gradientFor = (id: number): string => {
  const hue = (id * 137) % 360;
  return `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue + 60) % 360},70%,45%))`;
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
  materials_count?: number;
  is_verified?: boolean;
  specialties?: string[];
}

const RatingStars: React.FC<{ rating: number }> = ({ rating }) => (
  <span className="vendor-rating-stars">
    {Array.from({ length: 5 }, (_, i) => {
      const filled = rating >= i + 1;
      const halfFilled = !filled && rating >= i + 0.5;
      return (
        <Star
          key={i}
          size={12}
          fill={filled ? 'currentColor' : halfFilled ? 'url(#half)' : 'none'}
          strokeWidth={filled || halfFilled ? 0 : 1.5}
          className={filled || halfFilled ? 'star-filled' : 'star-empty'}
        />
      );
    })}
    <span className="vendor-rating-value">{(rating || 0).toFixed(1)}</span>
  </span>
);

// Removed isDemoVendor filter to show all registered vendors as requested by the user.

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
        title="Laser Cutting Vendors"
        subtitle="Compare verified vendors by rating, location, and specialty."
        breadcrumbs={[
          { label: 'Marketplace', to: '/' },
          { label: 'Vendors' },
        ]}
      />

      <div className="public-vendor-toolbar">
        <div className="browse-search vendors-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search vendors by name or location..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
        <div className="public-vendor-filters">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            aria-label="Filter by location"
          >
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <select
            value={minRating}
            onChange={(e) => setMinRating(Number(e.target.value))}
            aria-label="Minimum rating"
          >
            <option value={0}>Any rating</option>
            <option value={3}>3+ stars</option>
            <option value={4}>4+ stars</option>
            <option value={4.5}>4.5+ stars</option>
          </select>
          {specialties.length > 0 && (
            <select
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              aria-label="Filter by specialty"
            >
              <option value="">All specialties</option>
              {specialties.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <div className="mp-vendor-grid public-vendor-grid" aria-busy="true" aria-label="Loading vendors">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="mp-vendor-card public-vendor-card skeleton-card">
              <Skeleton width="64px" height="64px" borderRadius="50%" />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <Skeleton height="1rem" width="60%" />
                <Skeleton height="0.75rem" width="90%" />
                <Skeleton height="0.75rem" width="50%" />
              </div>
            </div>
          ))}
        </div>
      ) : loadError ? (
        <ErrorState message="Couldn't load vendors" onRetry={() => loadVendors()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={40} />}
          title="No vendors found"
          description={
            searchText || locationFilter || minRating || specialtyFilter
              ? 'Try adjusting your filters.'
              : 'No vendors available yet. Check back soon!'
          }
          action={
            <button className="vendors-clear-search" onClick={clearFilters}>
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="mp-vendor-grid public-vendor-grid">
          {filtered.map((v) => (
            <Link key={v.id} to={`/vendor/${v.slug}`} className="mp-vendor-card public-vendor-card">
              <Avatar
                src={v.logo_url}
                name={v.shop_name}
                size={64}
                style={{
                  width: 64,
                  height: 64,
                  fontSize: 24,
                  background: gradientFor(v.id),
                  color: '#fff',
                }}
              />
              <div className="mp-vendor-info">
                <div className="vendor-name-row">
                  <h4>{v.shop_name}</h4>
                  {v.is_verified && (
                    <span className="vendor-verified-badge" title="Verified vendor">
                      <BadgeCheck size={14} />
                    </span>
                  )}
                </div>
                {v.description && <p className="vendor-desc">{v.description}</p>}
                <div className="mp-vendor-meta">
                  <RatingStars rating={v.rating || 0} />
                  <span>{v.total_orders || 0} orders</span>
                  {v.location && <span><MapPin size={12} /> {v.location}</span>}
                </div>
                {v.specialties && v.specialties.length > 0 && (
                  <div className="public-vendor-specialties">
                    {v.specialties.slice(0, 4).map((s) => (
                      <Badge key={s} variant="info">{s}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

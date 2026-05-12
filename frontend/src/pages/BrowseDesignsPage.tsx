import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  Grid,
  Heart,
  ChevronDown,
  Download,
  Star,
  Users,
  Type,
  Gem,
  Home,
  Palette,
  Cog,
  Package,
  Square,
  BookOpen,
  LayoutGrid,
  SearchX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, resolveMediaUrl } from '../services/api';
import { vendorApi, VendorProfile } from '../services/index';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { EmptyState, PageHeader, Button } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { SORT_OPTIONS, CATEGORIES, CATEGORY_LABELS } from '../utils/taxonomy';

interface Design {
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
  tags?: string[];
}

interface TagCount {
  name: string;
  count: number;
}

// Icon map for category chips. Canonical ids + labels come from `utils/taxonomy.ts`;
// icons stay page-local because they are a UI concern, not taxonomy data.
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  '': LayoutGrid,
  signage: Type,
  jewelry: Gem,
  home_decor: Home,
  art: Palette,
  mechanical: Cog,
  packaging: Package,
  stencils: Square,
  educational: BookOpen,
};

export const BrowseDesignsPage: React.FC = () => {
  useDocumentTitle('Browse Designs — LaserHub');
  const [searchParams, setSearchParams] = useSearchParams();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [matchingVendors, setMatchingVendors] = useState<VendorProfile[]>([]);
  const [popularTags, setPopularTags] = useState<TagCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchText, setSearchText] = useState(searchParams.get('search') || searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'popular');
  const [activeTag, setActiveTag] = useState(searchParams.get('tag') || '');

  useEffect(() => {
    const urlSearch = searchParams.get('search') || searchParams.get('q') || '';
    setSearchText(urlSearch);
    setCategory(searchParams.get('category') || '');
    setSortBy(searchParams.get('sort') || 'popular');
    setActiveTag(searchParams.get('tag') || '');
    loadDesigns();
  }, [searchParams]);

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      const { data } = await api.get('/marketplace/tags');
      setPopularTags((data.tags || []).slice(0, 20));
    } catch {
      setPopularTags([]);
    }
  };

  const loadDesigns = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const params: Record<string, string> = {};
      const search = searchParams.get('search') || searchParams.get('q') || '';
      const cat = searchParams.get('category');
      const sort = searchParams.get('sort');
      const tag = searchParams.get('tag');
      if (search) params.search = search;
      if (cat) params.category = cat;
      if (sort) params.sort = sort;
      if (tag) params.tag = tag;

      const [designsRes] = await Promise.all([
        api.get('/marketplace/designs', { params }),
      ]);
      setDesigns(Array.isArray(designsRes.data) ? designsRes.data : designsRes.data.designs || []);

      if (search.trim()) {
        try {
          const vendors = await vendorApi.listVendors({ q: search.trim() });
          setMatchingVendors(vendors);
        } catch {
          setMatchingVendors([]);
        }
      } else {
        setMatchingVendors([]);
      }
    } catch {
      setDesigns([]);
      setMatchingVendors([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const updateParams = (overrides: Record<string, string | undefined>) => {
    const params: Record<string, string> = {};
    const s = overrides.search !== undefined ? overrides.search : searchText.trim();
    const c = overrides.category !== undefined ? overrides.category : category;
    const so = overrides.sort !== undefined ? overrides.sort : sortBy;
    const t = overrides.tag !== undefined ? overrides.tag : activeTag;
    if (s) params.search = s;
    if (c) params.category = c;
    if (so && so !== 'popular') params.sort = so;
    if (t) params.tag = t;
    setSearchParams(params);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchText.trim() });
  };

  const handleCategoryClick = (catId: string) => {
    setCategory(catId);
    updateParams({ category: catId });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
    updateParams({ sort: e.target.value });
  };

  const handleTagClick = (tagName: string) => {
    const newTag = activeTag === tagName ? '' : tagName;
    setActiveTag(newTag);
    updateParams({ tag: newTag });
  };

  const hasActiveFilters =
    !!searchParams.get('search') ||
    !!searchParams.get('q') ||
    !!category ||
    !!activeTag;

  const clearAllFilters = () => {
    setSearchText('');
    setCategory('');
    setActiveTag('');
    setSearchParams({});
  };

  return (
    <div className="browse-page public-page">
      <PageHeader
        title="Browse Designs"
        subtitle="Ready-made designs from makers around the world."
        breadcrumbs={[
          { label: 'Marketplace', to: '/' },
          { label: 'Browse' },
        ]}
      />

      <div className="browse-toolbar public-browse-toolbar">
        <form className="browse-search" onSubmit={handleSearch}>
          <Search size={18} />
          <input
            type="text"
            placeholder="Search designs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button type="submit">Search</button>
        </form>
        <div className="browse-sort">
          <select value={sortBy} onChange={handleSortChange}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="browse-sort-icon" />
        </div>
      </div>

      {/* Single icon-based category row (duplicate chip row removed) */}
      <div className="public-categories-row">
        {CATEGORIES.map((id) => {
          const Icon = CATEGORY_ICONS[id] || LayoutGrid;
          const name = id === '' ? 'All' : CATEGORY_LABELS[id] || id.replace(/_/g, ' ');
          return (
            <button
              key={id || 'all'}
              className={`public-category-chip ${category === id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(id)}
              type="button"
            >
              <Icon size={16} />
              <span>{name}</span>
            </button>
          );
        })}
      </div>

      {popularTags.length > 0 && (
        <div className="public-tag-bar" aria-label="Filter by tag">
          {activeTag && (
            <button
              className="public-tag-chip public-tag-chip-clear"
              onClick={() => handleTagClick('')}
            >
              Clear tag
            </button>
          )}
          {popularTags.slice(0, 6).map(({ name, count }) => (
            <button
              key={name}
              className={`public-tag-chip ${activeTag === name ? 'active' : ''}`}
              onClick={() => handleTagClick(name)}
              title={`${count} design${count !== 1 ? 's' : ''}`}
            >
              #{name}
            </button>
          ))}
          {popularTags.length > 6 && (
            <details className="tag-more">
              <summary>More filters</summary>
              <div className="tag-list-rest">
                {popularTags.slice(6).map(({ name, count }) => (
                  <button
                    key={name}
                    className={`public-tag-chip ${activeTag === name ? 'active' : ''}`}
                    onClick={() => handleTagClick(name)}
                    title={`${count} design${count !== 1 ? 's' : ''}`}
                  >
                    #{name}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {loading ? (
        <div className="mp-design-grid browse-grid" aria-busy="true" aria-label="Loading designs">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="mp-design-card skeleton-card">
              <Skeleton height="160px" borderRadius="6px" />
              <Skeleton height="1rem" width="80%" />
              <Skeleton height="0.8rem" width="60%" />
              <Skeleton height="0.8rem" width="40%" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <ErrorState
          message="Couldn't load designs"
          onRetry={() => loadDesigns()}
        />
      ) : (
        <>
          {matchingVendors.length > 0 && (
            <div className="browse-vendors-section">
              <div className="browse-section-heading">
                <Users size={16} />
                <h3>Matching Vendors ({matchingVendors.length})</h3>
              </div>
              <div className="browse-vendors-grid">
                {matchingVendors.map((vendor) => (
                  <Link key={vendor.id} to={`/vendor/${vendor.slug}`} className="browse-vendor-card">
                    <div className="browse-vendor-avatar">
                      {vendor.logo_url ? (
                        <img src={vendor.logo_url} alt={vendor.shop_name} />
                      ) : (
                        <span>{vendor.shop_name[0]}</span>
                      )}
                    </div>
                    <div className="browse-vendor-info">
                      <h4>{vendor.shop_name}</h4>
                      <div className="browse-vendor-meta">
                        <span><Star size={12} /> {(vendor.rating || 0).toFixed(1)}</span>
                        {vendor.location && <span>{vendor.location}</span>}
                        <span>{vendor.total_orders} orders</span>
                      </div>
                      {vendor.description && (
                        <p className="browse-vendor-desc">{vendor.description}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {designs.length === 0 ? (
            <EmptyState
              icon={<SearchX size={48} />}
              title={
                searchParams.get('search') || searchParams.get('q')
                  ? `No designs found for "${searchParams.get('search') || searchParams.get('q')}"`
                  : 'No designs match your filters'
              }
              description="Try a different search, clear a filter, or browse a different category."
              action={
                hasActiveFilters ? (
                  <Button variant="secondary" onClick={clearAllFilters}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {(searchParams.get('search') || searchParams.get('q')) && (
                <div className="browse-results-label">
                  Designs matching "{searchParams.get('search') || searchParams.get('q')}" — {designs.length} result{designs.length !== 1 ? 's' : ''}
                </div>
              )}
              <div className="mp-design-grid browse-grid">
                {designs.map((design) => (
                  <div key={design.id} className="mp-design-card-wrapper">
                    <Link to={`/design/${design.id}`} className="mp-design-card">
                      <div className={`mp-design-thumb compact cat-${design.category}`}>
                        {design.thumbnail_url ? (
                          <img src={resolveMediaUrl(design.thumbnail_url)!} alt={design.title} />
                        ) : (
                          <div className="mp-design-placeholder">
                            <Grid size={48} />
                          </div>
                        )}
                        {design.is_featured && <span className="mp-badge">Featured</span>}
                        {design.category && (
                          <span className="mp-cat-pill">
                            {CATEGORY_LABELS[design.category] || design.category.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div className="mp-design-info">
                        <h4>{design.title}</h4>
                        {design.description && (
                          <p className="mp-design-desc">{design.description}</p>
                        )}
                        <p className="mp-design-creator">by {design.creator_name}</p>
                        
                        {design.tags && design.tags.length > 0 && (
                          <div className="mp-design-tags-inline">
                            {design.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="tag-pill-sm">#{tag}</span>
                            ))}
                            {design.tags.length > 2 && <span className="tag-pill-sm">+{design.tags.length - 2}</span>}
                          </div>
                        )}

                        <div className="mp-design-meta public-card-footer">
                          <span><Heart size={12} /> {design.likes_count ?? 0}</span>
                          <span className="mp-price">
                            {design.min_price ? fp(design.min_price) : '—'}
                          </span>
                        </div>
                      </div>
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

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
  Clock,
  LayoutDashboard,
  Plus,
  Settings,
} from 'lucide-react';
import { api, resolveMediaUrl } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { Avatar, Badge, Button, Card } from '../components/ui';
import { Skeleton } from '../components/Skeleton';
import { ErrorState } from '../components/ErrorState';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { authApi, designApi, type Order, type DesignItem } from '../services';

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

export const BuyerDashboard: React.FC = () => {
  const { user } = useAuthStore();
  useDocumentTitle(`Dashboard — LaserHub`);
  
  const [featured, setFeatured] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [myDesigns, setMyDesigns] = useState<DesignItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  
  const navigate = useNavigate();
  const { currency } = useCurrencyStore();
  const fp = (usd: number) => formatPrice(usd, currency);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [mpData, ordersData, designsData] = await Promise.all([
        api.get('/marketplace/featured'),
        authApi.listMyOrders(),
        designApi.getMyDesigns()
      ]);
      
      setFeatured(mpData.data.featured_designs || []);
      setVendors(mpData.data.top_vendors || []);
      setRecentOrders(ordersData.slice(0, 3));
      setMyDesigns(designsData.slice(0, 4));
    } catch (err) {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/browse?search=${encodeURIComponent(search)}`);
    }
  };

  return (
    <div className="marketplace-page buyer-dashboard-page">
      {/* Welcome Section */}
      <section className="mp-hero buyer-hero">
        <div className="mp-hero-content">
          <div className="buyer-welcome-badge">
            <Sparkles size={14} /> Welcome back, {user?.name.split(' ')[0]}
          </div>
          <h1>What are we cutting today?</h1>
          <p>Your one-stop hub for custom laser cutting, community designs, and verified vendors.</p>
          
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
        </div>
      </section>

      {/* Primary Actions Grid */}
      <section className="mp-actions buyer-actions">
        <Link to="/upload" className="mp-action-card highlight">
          <div className="action-icon-wrap">
            <Upload size={28} />
          </div>
          <div>
            <h3>Custom Cut</h3>
            <p>Upload your design & get instant quotes</p>
          </div>
          <ArrowRight size={18} />
        </Link>
        <Link to="/browse" className="mp-action-card">
          <div className="action-icon-wrap">
            <Grid size={28} />
          </div>
          <div>
            <h3>Browse Designs</h3>
            <p>Explore 1000+ community creations</p>
          </div>
          <ArrowRight size={18} />
        </Link>
        <Link to="/vendors" className="mp-action-card">
          <div className="action-icon-wrap">
            <Zap size={28} />
          </div>
          <div>
            <h3>Find Vendors</h3>
            <p>Connect with local manufacturing shops</p>
          </div>
          <ArrowRight size={18} />
        </Link>
      </section>

      {/* User Status / Recent Activity Row */}
      {!loading && (recentOrders.length > 0 || myDesigns.length > 0) && (
        <section className="mp-section buyer-activity">
          <div className="buyer-activity-grid">
            <div className="activity-card">
              <div className="activity-card-header">
                <h3><Clock size={18} /> Recent Orders</h3>
                <Link to="/dashboard/my-orders">View All</Link>
              </div>
              {recentOrders.length > 0 ? (
                <div className="mini-order-list">
                  {recentOrders.map(order => (
                    <Link key={order.id} to={`/dashboard/my-orders`} className="mini-order-item">
                      <div className="order-info">
                        <strong>{order.order_number}</strong>
                        <span>{order.material_name} · {order.thickness_mm}mm</span>
                      </div>
                      <Badge variant={order.status === 'completed' ? 'success' : 'warning'}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="empty-text">No orders yet.</p>
              )}
            </div>

            <div className="activity-card">
              <div className="activity-card-header">
                <h3><Heart size={18} /> My Designs</h3>
                <Link to="/dashboard/my-designs">View All</Link>
              </div>
              {myDesigns.length > 0 ? (
                <div className="mini-design-grid">
                  {myDesigns.map(design => (
                    <Link key={design.id} to={`/design/${design.id}`} className="mini-design-item">
                      {design.thumbnail_url ? (
                        <img src={resolveMediaUrl(design.thumbnail_url)!} alt={design.title} />
                      ) : (
                        <div className="thumb-ph">{design.title[0]}</div>
                      )}
                    </Link>
                  ))}
                  <Link to="/upload" className="mini-design-item add-new">
                    <Plus size={20} />
                  </Link>
                </div>
              ) : (
                <p className="empty-text">Save designs here for easy reordering.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Categories */}
      <section className="mp-section">
        <div className="mp-section-header">
          <h2>Popular Categories</h2>
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

      {/* Featured Content (Marketplace Logic) */}
      {!loading && featured.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <h2>Trending Designs</h2>
            <Link to="/browse">Explore Library <ArrowRight size={14} /></Link>
          </div>
          <div className="mp-design-grid">
            {featured.map(design => (
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
                </div>
                <div className="mp-design-info">
                  <h4>{design.title}</h4>
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
      {!loading && vendors.length > 0 && (
        <section className="mp-section">
          <div className="mp-section-header">
            <h2>Recommended Shops</h2>
            <Link to="/vendors">View all vendors <ArrowRight size={14} /></Link>
          </div>
          <div className="mp-vendor-grid public-vendor-grid">
            {vendors.slice(0, 4).map((v) => (
              <Link key={v.id} to={`/vendor/${v.slug}`} className="mp-vendor-card public-vendor-card">
                <div className="mp-vendor-card-header">
                  <Avatar src={resolveMediaUrl(v.logo_url)} name={v.shop_name} size={64} />
                  <div className="mp-vendor-status">
                    <Badge variant="success">Verified</Badge>
                  </div>
                </div>
                <div className="mp-vendor-info">
                  <h4>{v.shop_name}</h4>
                  <div className="mp-vendor-meta">
                    <span className="rating-pill">
                      <Star size={12} fill="currentColor" /> 
                      {(v.rating || 0).toFixed(1)}
                    </span>
                    <span>{v.location || 'India'}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {loading && (
        <section className="mp-section">
          <div className="mp-section-header"><h2>Loading your dashboard...</h2></div>
          <div className="mp-design-grid">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height="200px" borderRadius="12px" />
            ))}
          </div>
        </section>
      )}

      <style>{`
        .buyer-dashboard-page {
          padding-bottom: 5rem;
          background: var(--bg-primary);
        }
        
        .buyer-hero {
          padding: 6rem 2rem;
          background: radial-gradient(circle at top right, rgba(var(--color-primary-rgb), 0.1), transparent 40%),
                      linear-gradient(135deg, #0a0f1d 0%, #020617 100%);
          position: relative;
          overflow: hidden;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .buyer-hero::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 150px;
          background: linear-gradient(to top, var(--bg-primary), transparent);
          pointer-events: none;
        }
        
        .buyer-welcome-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: rgba(var(--color-primary-rgb), 0.1);
          color: var(--color-primary);
          padding: 0.5rem 1.25rem;
          border-radius: 100px;
          font-size: 0.8rem;
          font-weight: 800;
          margin-bottom: 1.5rem;
          border: 1px solid rgba(var(--color-primary-rgb), 0.2);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .buyer-actions {
          margin-top: -4rem;
          position: relative;
          z-index: 10;
          padding: 0 2rem;
        }
        
        .action-icon-wrap {
          width: 60px;
          height: 60px;
          background: var(--bg-tertiary);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-primary);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: inset 0 1px 1px rgba(255,255,255,0.05);
        }
        
        .mp-action-card:hover .action-icon-wrap {
          transform: scale(1.1) rotate(5deg);
          background: var(--color-primary);
          color: white;
          box-shadow: 0 8px 24px rgba(var(--color-primary-rgb), 0.3);
        }
        
        .mp-action-card.highlight {
          border: 1px solid rgba(var(--color-primary-rgb), 0.3);
          background: rgba(var(--color-primary-rgb), 0.03);
          backdrop-filter: blur(10px);
        }
        
        .buyer-activity {
          margin-top: 4rem;
          padding: 0 2rem;
        }
        
        .buyer-activity-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
        }
        
        .activity-card {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          padding: 1.75rem;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        
        .activity-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .activity-card-header h3 {
          font-size: 1.15rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin: 0;
          color: var(--text-primary);
        }
        
        .activity-card-header a {
          font-size: 0.8rem;
          font-weight: 800;
          color: var(--color-primary);
          text-decoration: none;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        
        .mini-order-list {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        
        .mini-order-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: var(--bg-tertiary);
          border-radius: 12px;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }
        
        .mini-order-item:hover {
          transform: translateY(-2px);
          border-color: rgba(var(--color-primary-rgb), 0.2);
          background: var(--bg-secondary);
        }
        
        .mini-order-item .order-info {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        
        .mini-order-item .order-info strong {
          font-size: 0.95rem;
          color: var(--text-primary);
        }
        
        .mini-order-item .order-info span {
          font-size: 0.8rem;
          color: var(--text-tertiary);
        }
        
        .mini-design-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
          gap: 1rem;
        }
        
        .mini-design-item {
          aspect-ratio: 1;
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-tertiary);
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          border: 1px solid var(--border-color);
          transition: all 0.3s ease;
        }
        
        .mini-design-item:hover {
          transform: translateY(-4px) scale(1.05);
          border-color: var(--color-primary);
          box-shadow: 0 8px 16px rgba(0,0,0,0.2);
        }
        
        .mini-design-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .mini-design-item.add-new {
          border: 2px dashed var(--border-color);
          color: var(--text-tertiary);
          background: transparent;
        }
        
        .mini-design-item.add-new:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
          background: rgba(var(--color-primary-rgb), 0.05);
        }
        
        .empty-text {
          font-size: 0.9rem;
          color: var(--text-tertiary);
          text-align: center;
          padding: 2rem;
          background: var(--bg-tertiary);
          border-radius: 12px;
          border: 1px dashed var(--border-color);
        }
        
        @media (max-width: 900px) {
          .buyer-activity-grid {
            grid-template-columns: 1fr;
          }
          .buyer-hero {
            padding: 4rem 1.5rem;
          }
          .buyer-actions {
            margin-top: -2rem;
            padding: 0 1rem;
          }
        }
      `}</style>
    </div>
  );
};

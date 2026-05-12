import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, DollarSign, Star, Layers, Plus,
  LogOut, ShoppingCart, BarChart2, AlertCircle, Tag,
  Phone, Mail, Globe, MapPin, FileText, Store, ImageIcon,
  Upload, RefreshCw, MapPinned, Check, AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api';
import { toast } from 'sonner';
import { TagInput } from '../components/TagInput';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { vendorApi } from '../services';
import type { Material, Order, VendorMaterialItem, VendorProfile, VendorAssetType } from '../services';
import { formatPrice } from '../utils/formatPrice';

interface VendorStats {
  total_orders?: number;
  total_revenue?: number;
  rating?: number;
  total_reviews?: number;
  material_count?: number;
}

interface VendorAnalytics {
  revenue_timeline: { date: string; revenue: number; orders: number }[];
  popular_materials: { name: string; count: number }[];
  summary: { avg_order_value: number };
}

type Tab = 'overview' | 'materials' | 'orders' | 'listings' | 'profile';

const TAB_CONFIG: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <BarChart2 size={14} /> },
  { key: 'materials', label: 'Materials', icon: <Layers size={14} /> },
  { key: 'orders', label: 'Orders', icon: <Package size={14} /> },
  { key: 'listings', label: 'Listings', icon: <ShoppingCart size={14} /> },
  { key: 'profile', label: 'Profile', icon: <Tag size={14} /> },
];

const getStatusClass = (status: string): string => {
  const s = (status || '').toLowerCase();
  if (s === 'completed' || s === 'delivered') return 'success';
  if (s === 'pending' || s === 'processing') return 'warning';
  if (s === 'cancelled' || s === 'failed') return 'error';
  return 'info';
};

export const VendorDashboardPage: React.FC = () => {
  useDocumentTitle('Vendor Dashboard — LaserHub');
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [analytics, setAnalytics] = useState<VendorAnalytics | null>(null);
  const [materials, setMaterials] = useState<VendorMaterialItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [_allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorSpecialties, setVendorSpecialties] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  // Profile form state
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [profileForm, setProfileForm] = useState<Partial<VendorProfile>>({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [syncingGmb, setSyncingGmb] = useState(false);
  const [gmbManualMode, setGmbManualMode] = useState(false);
  const [uploading, setUploading] = useState<VendorAssetType | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const storefrontInputRef = useRef<HTMLInputElement>(null);
  const gstInputRef = useRef<HTMLInputElement>(null);
  // Vendor id placeholder - in production comes from auth
  const vendorId = 1;
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, analyticsRes, globalMats] = await Promise.all([
        api.get('/vendors/dashboard/stats').catch(() => ({ data: null })),
        api.get('/vendors/dashboard/analytics').catch(() => ({ data: null })),
        api.get('/materials/').catch(() => ({ data: [] })),
      ]);
      setStats(statsRes.data);
      setAnalytics(analyticsRes.data);
      setAllMaterials(globalMats.data || []);

      // Load full vendor profile (empty update body = no-op that returns current profile)
      try {
        const profile = await vendorApi.updateProfile({});
        setVendor(profile);
        setProfileForm({
          phone_country_code: profile.phone_country_code || '',
          phone_number: profile.phone_number || '',
          business_email: profile.business_email || '',
          website: profile.website || '',
          business_address: profile.business_address || '',
          gst_number: profile.gst_number || '',
          gmb_place_id: profile.gmb_place_id || '',
          gmb_name: profile.gmb_name || '',
          gmb_phone: profile.gmb_phone || '',
          gmb_address: profile.gmb_address || '',
          gmb_website: profile.gmb_website || '',
        });

        // Load vendor materials using real ID from profile
        const matsRes = await api.get(`/vendors/${profile.id}/materials`).catch(() => ({ data: [] }));
        setMaterials(matsRes.data || []);

        // Load vendor specialties
        if (profile.specialties) {
          setVendorSpecialties(profile.specialties as unknown as string[]);
        }
      } catch {
        // no-op — user may not be a vendor yet
      }
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const onProfileField = <K extends keyof VendorProfile>(field: K, value: VendorProfile[K]) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updated = await vendorApi.updateProfile(profileForm);
      setVendor(updated);
      toast.success('Profile saved');
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpload = async (assetType: VendorAssetType, file: File) => {
    setUploading(assetType);
    try {
      const { url } = await vendorApi.uploadAsset(file, assetType);
      const fieldMap: Record<VendorAssetType, keyof VendorProfile> = {
        logo: 'logo_url',
        storefront: 'storefront_image_url',
        gst: 'gst_certificate_url',
        banner: 'banner_url',
      };
      const field = fieldMap[assetType];
      setVendor((prev) => (prev ? { ...prev, [field]: url } : prev));
      toast.success(`${assetType} uploaded`);
    } catch {
      toast.error(`Failed to upload ${assetType}`);
    } finally {
      setUploading(null);
    }
  };

  const handleSyncGmb = async () => {
    const placeId = (profileForm.gmb_place_id || '').trim();
    if (!placeId) {
      toast.error('Enter a Google Place ID first');
      return;
    }
    setSyncingGmb(true);
    try {
      const updated = await vendorApi.syncGmb(placeId);
      setVendor(updated);
      setProfileForm((prev) => ({
        ...prev,
        gmb_place_id: updated.gmb_place_id || prev.gmb_place_id,
        gmb_name: updated.gmb_name || prev.gmb_name,
        gmb_phone: updated.gmb_phone || prev.gmb_phone,
        gmb_address: updated.gmb_address || prev.gmb_address,
        gmb_website: updated.gmb_website || prev.gmb_website,
      }));
      setGmbManualMode(false);
      toast.success('Synced from Google My Business');
    } catch (err: any) {
      if (err?.response?.status === 422) {
        setGmbManualMode(true);
        toast.warning('Google API not configured — fill GMB fields manually');
      } else {
        toast.error('Failed to sync from Google My Business');
      }
    } finally {
      setSyncingGmb(false);
    }
  };

  const handleSaveSpecialties = async () => {
    if (!vendor) return;
    setSavingTags(true);
    try {
      await api.put(`/vendors/${vendor.id}/tags`, { tags: vendorSpecialties });
      toast.success('Specialties saved');
    } catch {
      toast.error('Failed to save specialties');
    } finally {
      setSavingTags(false);
    }
  };

  const loadOrders = async () => {
    try {
      const { data } = await api.get('/vendors/orders');
      setOrders(data || []);
    } catch {
      toast.error('Failed to load orders');
    }
  };

  useEffect(() => {
    if (tab === 'orders') loadOrders();
  }, [tab]);

  if (loading) return <div className="loading">Loading vendor dashboard...</div>;

  return (
    <div className="vendor-dashboard">
      <div className="vd-header">
        <h1><ShoppingCart size={22} /> Vendor Dashboard</h1>
        <button onClick={() => navigate('/')} className="back-btn">
          <LogOut size={14} /> Exit
        </button>
      </div>

      <div className="vd-tabs">
        {TAB_CONFIG.map(t => (
          <button
            key={t.key}
            className={`vd-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div className="vd-overview">
          {stats ? (
            <>
              <div className="vd-stats-grid">
                <div className="vd-stat-card vd-stat-orders">
                  <div className="vd-stat-icon"><Package size={20} /></div>
                  <div>
                    <p className="vd-stat-value">{stats.total_orders}</p>
                    <p className="vd-stat-label">Total Orders</p>
                  </div>
                </div>
                <div className="vd-stat-card vd-stat-revenue">
                  <div className="vd-stat-icon"><DollarSign size={20} /></div>
                  <div>
                    <p className="vd-stat-value">{formatPrice((stats.total_revenue || 0))}</p>
                    <p className="vd-stat-label">Revenue</p>
                  </div>
                </div>
                <div className="vd-stat-card vd-stat-rating">
                  <div className="vd-stat-icon"><Star size={20} /></div>
                  <div>
                    <p className="vd-stat-value">{(stats.rating || 0).toFixed(1)}</p>
                    <p className="vd-stat-label">Rating ({stats.total_reviews || 0} reviews)</p>
                  </div>
                </div>
                <div className="vd-stat-card vd-stat-materials">
                  <div className="vd-stat-icon"><Layers size={20} /></div>
                  <div>
                    <p className="vd-stat-value">{stats.material_count}</p>
                    <p className="vd-stat-label">Materials</p>
                  </div>
                </div>
              </div>

              {analytics && (
                <div className="vd-analytics-grid" style={{ marginTop: '2rem', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                  <div className="vd-chart-card vd-profile-card">
                    <div className="vd-profile-card-header">
                      <BarChart2 size={16} />
                      <h3>Revenue (Last 30 Days)</h3>
                    </div>
                    <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', gap: '4px', padding: '1rem 0' }}>
                      {analytics.revenue_timeline.map((day, idx) => {
                        const maxRev = Math.max(...analytics.revenue_timeline.map(d => d.revenue), 1);
                        const height = (day.revenue / maxRev) * 100;
                        return (
                          <div 
                            key={idx} 
                            style={{ 
                              flex: 1, 
                              height: `${height}%`, 
                              background: 'var(--accent-color)', 
                              borderRadius: '2px',
                              opacity: 0.8,
                              minWidth: '8px'
                            }} 
                            title={`${day.date}: ${formatPrice(day.revenue)}`}
                          />
                        );
                      })}
                    </div>
                    {analytics.revenue_timeline.length === 0 && (
                      <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>No recent revenue data</p>
                    )}
                  </div>
                  
                  <div className="vd-popular-card vd-profile-card">
                    <div className="vd-profile-card-header">
                      <Layers size={16} />
                      <h3>Popular Materials</h3>
                    </div>
                    <div style={{ marginTop: '1rem' }}>
                      {analytics.popular_materials.map((mat, idx) => (
                        <div key={idx} style={{ marginBottom: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                            <span>{mat.name}</span>
                            <span style={{ fontWeight: 'bold' }}>{mat.count} orders</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${(mat.count / (analytics.revenue_timeline.reduce((acc, d) => acc + d.orders, 0) || 1)) * 100}%`, 
                              height: '100%', 
                              background: 'var(--accent-color)' 
                            }} />
                          </div>
                        </div>
                      ))}
                      {analytics.popular_materials.length === 0 && (
                        <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>No material data</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="vd-overview-empty">
              <AlertCircle size={32} />
              <p>No stats available yet.</p>
              <p>Start adding materials and fulfilling orders to see your dashboard metrics.</p>
            </div>
          )}
        </div>
      )}

      {/* Materials Tab */}
      {tab === 'materials' && (
        <div className="vd-materials">
          <div className="vd-section-header">
            <h2>Your Materials</h2>
          </div>
          {materials.length === 0 ? (
            <div className="vd-empty">
              <Layers size={32} />
              <p>No materials configured yet.</p>
              <p>Add materials from the catalog to start receiving orders.</p>
            </div>
          ) : (
            <div className="vd-table-wrap">
              <table className="orders-table vd-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Thickness</th>
                    <th>Price/cm²</th>
                    <th>Speed</th>
                    <th>Lead Time</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id}>
                      <td className="cell-bold">{m.material_name}</td>
                      <td>{m.thickness_mm}mm</td>
                      <td className="cell-accent">{formatPrice((m.custom_price_per_cm2_mm || 0))}</td>
                      <td>{m.cut_speed_mm_min} mm/min</td>
                      <td>{m.lead_time_days}d</td>
                      <td>
                        <span className={`status-badge ${m.is_in_stock ? 'success' : 'error'}`}>
                          {m.is_in_stock ? 'In Stock' : 'Out of Stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Orders Tab */}
      {tab === 'orders' && (
        <div className="vd-orders">
          <div className="vd-section-header">
            <h2>Orders</h2>
          </div>
          {orders.length === 0 ? (
            <div className="vd-empty">
              <Package size={32} />
              <p>No orders yet.</p>
              <p>Orders will appear here once customers place them.</p>
            </div>
          ) : (
            <div className="vd-table-wrap">
              <table className="orders-table vd-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="cell-accent">{o.order_number}</td>
                      <td>{o.customer_name}</td>
                      <td className="cell-bold">{formatPrice((o.total_amount || 0))}</td>
                      <td>
                        <span className={`status-badge ${getStatusClass(o.status)}`}>
                          {o.status}
                        </span>
                      </td>
                      <td>{new Date(o.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Listings Tab */}
      {tab === 'listings' && (
        <div className="vd-listings">
          <div className="vd-section-header">
            <h2>Your Listings</h2>
          </div>
          <div className="vd-empty">
            <ShoppingCart size={32} />
            <p>Create listings from designs to sell pre-configured products.</p>
            <button className="mp-cta-btn" onClick={() => navigate('/browse')}>
              <Plus size={14} /> Browse Designs to List
            </button>
          </div>
        </div>
      )}

      {/* Profile Tab */}
      {tab === 'profile' && (
        <div className="vd-profile">
          <div className="vd-section-header">
            <h2>Shop Profile</h2>
          </div>

          {/* Specialties (existing) */}
          <div className="vd-profile-card">
            <div className="vd-profile-card-header">
              <Tag size={16} />
              <h3>Specialties / Tags</h3>
            </div>
            <p className="vd-profile-hint">
              Add tags that describe your specialties (e.g. acrylic, wood, jewelry). These help customers find you.
            </p>
            <TagInput
              tags={vendorSpecialties}
              onChange={setVendorSpecialties}
              placeholder="Type a specialty and press Enter..."
              maxTags={10}
              maxTagLength={30}
            />
            <button
              className="mp-cta-btn vd-save-tags-btn"
              onClick={handleSaveSpecialties}
              disabled={savingTags}
            >
              {savingTags ? 'Saving...' : 'Save Specialties'}
            </button>
          </div>

          {/* Section A: Contact information */}
          <div className="vd-profile-card">
            <div className="vd-profile-card-header">
              <Phone size={16} />
              <h3>Contact information</h3>
            </div>
            <div className="vd-form-grid">
              <div className="vd-form-row vd-form-row-phone">
                <div className="vd-form-field vd-form-field-small">
                  <label className="vd-form-label">Country code</label>
                  <input
                    className="vd-form-input"
                    type="text"
                    value={profileForm.phone_country_code || ''}
                    onChange={(e) => onProfileField('phone_country_code', e.target.value)}
                    placeholder="+91"
                  />
                </div>
                <div className="vd-form-field">
                  <label className="vd-form-label">Phone number</label>
                  <input
                    className="vd-form-input"
                    type="tel"
                    value={profileForm.phone_number || ''}
                    onChange={(e) => onProfileField('phone_number', e.target.value)}
                    placeholder="98765 43210"
                  />
                </div>
              </div>
              <div className="vd-form-field">
                <label className="vd-form-label">
                  <Mail size={12} /> Business email
                </label>
                <input
                  className="vd-form-input"
                  type="email"
                  value={profileForm.business_email || ''}
                  onChange={(e) => onProfileField('business_email', e.target.value)}
                  placeholder="hello@yourshop.com"
                />
              </div>
              <div className="vd-form-field">
                <label className="vd-form-label">
                  <Globe size={12} /> Website
                </label>
                <input
                  className="vd-form-input"
                  type="url"
                  value={profileForm.website || ''}
                  onChange={(e) => onProfileField('website', e.target.value)}
                  placeholder="https://yourshop.com"
                />
              </div>
              <div className="vd-form-field">
                <label className="vd-form-label">
                  <MapPin size={12} /> Business address
                </label>
                <textarea
                  className="vd-form-textarea"
                  rows={3}
                  value={profileForm.business_address || ''}
                  onChange={(e) => onProfileField('business_address', e.target.value)}
                  placeholder="Street, city, state, postal code"
                />
              </div>
              <div className="vd-form-field">
                <label className="vd-form-label">
                  <FileText size={12} /> GST number
                </label>
                <input
                  className="vd-form-input"
                  type="text"
                  value={profileForm.gst_number || ''}
                  onChange={(e) => onProfileField('gst_number', e.target.value)}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
            </div>
          </div>

          {/* Section B: Images */}
          <div className="vd-profile-card">
            <div className="vd-profile-card-header">
              <ImageIcon size={16} />
              <h3>Images</h3>
            </div>
            <div className="vd-uploader-grid">
              {/* Logo */}
              <div className="vd-uploader-tile">
                <div className="vd-uploader-label">Logo</div>
                <div className="vd-uploader-preview vd-aspect-1x1">
                  {vendor?.logo_url ? (
                    <img src={vendor.logo_url} alt="Logo preview" />
                  ) : (
                    <div className="vd-uploader-placeholder">
                      <Store size={28} />
                      <span>No logo</span>
                    </div>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload('logo', f);
                    e.target.value = '';
                  }}
                />
                <button
                  className="vd-uploader-btn"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploading === 'logo'}
                >
                  <Upload size={12} />
                  {uploading === 'logo'
                    ? 'Uploading...'
                    : vendor?.logo_url
                      ? 'Replace'
                      : 'Upload'}
                </button>
              </div>

              {/* Storefront */}
              <div className="vd-uploader-tile">
                <div className="vd-uploader-label">Storefront photo</div>
                <div className="vd-uploader-preview vd-aspect-16x9">
                  {vendor?.storefront_image_url ? (
                    <img src={vendor.storefront_image_url} alt="Storefront preview" />
                  ) : (
                    <div className="vd-uploader-placeholder">
                      <ImageIcon size={28} />
                      <span>No storefront photo</span>
                    </div>
                  )}
                </div>
                <input
                  ref={storefrontInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload('storefront', f);
                    e.target.value = '';
                  }}
                />
                <button
                  className="vd-uploader-btn"
                  onClick={() => storefrontInputRef.current?.click()}
                  disabled={uploading === 'storefront'}
                >
                  <Upload size={12} />
                  {uploading === 'storefront'
                    ? 'Uploading...'
                    : vendor?.storefront_image_url
                      ? 'Replace'
                      : 'Upload'}
                </button>
              </div>

              {/* GST Certificate */}
              <div className="vd-uploader-tile">
                <div className="vd-uploader-label">GST certificate</div>
                <div className="vd-uploader-preview vd-aspect-4x3">
                  {vendor?.gst_certificate_url ? (
                    vendor.gst_certificate_url.toLowerCase().endsWith('.pdf') ? (
                      <div className="vd-uploader-placeholder">
                        <FileText size={28} />
                        <span>PDF uploaded</span>
                      </div>
                    ) : (
                      <img src={vendor.gst_certificate_url} alt="GST certificate preview" />
                    )
                  ) : (
                    <div className="vd-uploader-placeholder">
                      <FileText size={28} />
                      <span>No certificate</span>
                    </div>
                  )}
                </div>
                <input
                  ref={gstInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload('gst', f);
                    e.target.value = '';
                  }}
                />
                <button
                  className="vd-uploader-btn"
                  onClick={() => gstInputRef.current?.click()}
                  disabled={uploading === 'gst'}
                >
                  <Upload size={12} />
                  {uploading === 'gst'
                    ? 'Uploading...'
                    : vendor?.gst_certificate_url
                      ? 'Replace'
                      : 'Upload'}
                </button>
              </div>
            </div>
          </div>

          {/* Section C: Google My Business */}
          <div className="vd-profile-card">
            <div className="vd-profile-card-header">
              <MapPinned size={16} />
              <h3>Google My Business</h3>
            </div>
            <div className="vd-form-grid">
              <div className="vd-form-row vd-form-row-gmb">
                <div className="vd-form-field">
                  <label className="vd-form-label">Google Place ID</label>
                  <input
                    className="vd-form-input"
                    type="text"
                    value={profileForm.gmb_place_id || ''}
                    onChange={(e) => onProfileField('gmb_place_id', e.target.value)}
                    placeholder="ChIJ..."
                  />
                </div>
                <button
                  className="vd-sync-btn"
                  onClick={handleSyncGmb}
                  disabled={syncingGmb}
                  type="button"
                >
                  <RefreshCw size={12} className={syncingGmb ? 'vd-spin' : ''} />
                  {syncingGmb ? 'Syncing...' : 'Sync from Google'}
                </button>
              </div>
              {vendor?.gmb_last_synced && (
                <div className="vd-gmb-synced">
                  <Check size={12} /> Last synced{' '}
                  {new Date(vendor.gmb_last_synced).toLocaleString()}
                </div>
              )}
              {gmbManualMode && (
                <>
                  <div className="vd-gmb-warning">
                    <AlertTriangle size={14} />
                    <span>
                      Google API not configured — you can still fill GMB fields manually below.
                    </span>
                  </div>
                  <div className="vd-form-field">
                    <label className="vd-form-label">Business name</label>
                    <input
                      className="vd-form-input"
                      type="text"
                      value={profileForm.gmb_name || ''}
                      onChange={(e) => onProfileField('gmb_name', e.target.value)}
                    />
                  </div>
                  <div className="vd-form-field">
                    <label className="vd-form-label">Phone</label>
                    <input
                      className="vd-form-input"
                      type="tel"
                      value={profileForm.gmb_phone || ''}
                      onChange={(e) => onProfileField('gmb_phone', e.target.value)}
                    />
                  </div>
                  <div className="vd-form-field">
                    <label className="vd-form-label">Address</label>
                    <textarea
                      className="vd-form-textarea"
                      rows={2}
                      value={profileForm.gmb_address || ''}
                      onChange={(e) => onProfileField('gmb_address', e.target.value)}
                    />
                  </div>
                  <div className="vd-form-field">
                    <label className="vd-form-label">Website</label>
                    <input
                      className="vd-form-input"
                      type="url"
                      value={profileForm.gmb_website || ''}
                      onChange={(e) => onProfileField('gmb_website', e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section D: Save changes */}
          <div className="vd-profile-save-bar">
            <button
              className="mp-cta-btn"
              onClick={handleSaveProfile}
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

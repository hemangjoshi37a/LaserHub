import React, { useState, useEffect, useRef } from 'react';
import { 
  Store, 
  Image as ImageIcon, 
  MapPin, 
  Globe, 
  Save, 
  Loader2, 
  ExternalLink, 
  Camera,
  AlertCircle,
  Clock
} from 'lucide-react';
import { api } from '../../services/api';
import { vendorApi } from '../../services';
import type { VendorAssetType } from '../../services';
import { toast } from 'sonner';

// Local form state. Numeric fields are kept as strings so the controlled
// <input type="number"> can be cleared without producing NaN; they are
// coerced to numbers (or omitted) when building the save payload.
interface VendorProfile {
  shop_name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  website: string;
  location: string;
  is_verified: boolean;
  avg_turnaround_days: string;
  min_order_amount: string;
  shipping_policy: string;
}

// Only the fields a vendor is actually allowed to edit. Read-only/computed
// fields returned by GET /vendors/me (id, slug, rating, total_reviews,
// total_orders, created_at, gmb_*, gmb_last_synced, etc.) are intentionally
// excluded so we never echo them back on save.
interface VendorUpdatePayload {
  shop_name: string;
  description?: string;
  logo_url?: string;
  banner_url?: string;
  website?: string;
  location?: string;
  shipping_policy?: string;
  avg_turnaround_days?: number;
  min_order_amount?: number;
}

export const VendorShopManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Tracks which asset (if any) is currently uploading so we can show a
  // spinner and disable the relevant control. null = idle.
  const [uploading, setUploading] = useState<VendorAssetType | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<VendorProfile>({
    shop_name: '',
    description: '',
    logo_url: '',
    banner_url: '',
    website: '',
    location: '',
    is_verified: false,
    avg_turnaround_days: '3',
    min_order_amount: '0',
    shipping_policy: ''
  });

  useEffect(() => {
    loadProfile();
  }, []);

  // Convert a raw API value to a string for a text/number input.
  const asStr = (v: unknown): string =>
    v === null || v === undefined ? '' : String(v);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/vendors/me');
      // Map ONLY the editable fields into form state. We deliberately do not
      // spread the whole response: it carries read-only/computed fields
      // (rating, total_reviews, gmb_*, created_at, ...) that must never be
      // sent back on save, and whose null->'' coercion was producing the 422.
      setProfile({
        shop_name: asStr(data.shop_name),
        description: asStr(data.description),
        logo_url: asStr(data.logo_url),
        banner_url: asStr(data.banner_url),
        website: asStr(data.website),
        location: asStr(data.location),
        is_verified: Boolean(data.is_verified),
        avg_turnaround_days: asStr(data.avg_turnaround_days),
        min_order_amount: asStr(data.min_order_amount),
        shipping_policy: asStr(data.shipping_policy),
      });
    } catch (error) {
      toast.error('Failed to load shop profile');
    } finally {
      setLoading(false);
    }
  };

  // Coerce a numeric form string to a finite number, or undefined when the
  // field is blank/invalid so it is omitted from the payload entirely (never
  // sent as "" or NaN).
  const toNum = (v: string): number | undefined => {
    if (v === null || v === undefined || String(v).trim() === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  // Trim a text field; return undefined when empty so we omit it instead of
  // sending an empty string for optional fields.
  const toText = (v: string): string | undefined => {
    const t = (v ?? '').trim();
    return t === '' ? undefined : t;
  };

  const buildPayload = (): VendorUpdatePayload => {
    const payload: VendorUpdatePayload = {
      // shop_name is required by the backend, always send it (trimmed).
      shop_name: (profile.shop_name ?? '').trim(),
    };

    const description = toText(profile.description);
    if (description !== undefined) payload.description = description;

    const logo_url = toText(profile.logo_url);
    if (logo_url !== undefined) payload.logo_url = logo_url;

    const banner_url = toText(profile.banner_url);
    if (banner_url !== undefined) payload.banner_url = banner_url;

    const website = toText(profile.website);
    if (website !== undefined) payload.website = website;

    const location = toText(profile.location);
    if (location !== undefined) payload.location = location;

    const shipping_policy = toText(profile.shipping_policy);
    if (shipping_policy !== undefined) payload.shipping_policy = shipping_policy;

    const avg_turnaround_days = toNum(profile.avg_turnaround_days);
    if (avg_turnaround_days !== undefined) payload.avg_turnaround_days = avg_turnaround_days;

    const min_order_amount = toNum(profile.min_order_amount);
    if (min_order_amount !== undefined) payload.min_order_amount = min_order_amount;

    return payload;
  };

  const handleSave = async () => {
    if (!profile.shop_name.trim()) {
      toast.error('Shop name is required');
      return;
    }
    setSaving(true);
    try {
      await api.put('/vendors/me', buildPayload());
      toast.success('Shop profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Upload an image asset (banner or logo) to the vendor asset endpoint.
  // The backend stores the file and immediately persists the returned URL to
  // the matching column (banner_url / logo_url), so the upload is durable on
  // its own; we also mirror the URL into local form state for instant preview
  // and so a subsequent "Save Changes" keeps it.
  const handleAssetUpload = async (
    assetType: Extract<VendorAssetType, 'banner' | 'logo'>,
    file: File | undefined | null,
  ) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setUploading(assetType);
    try {
      const { url } = await vendorApi.uploadAsset(file, assetType);
      const field = assetType === 'banner' ? 'banner_url' : 'logo_url';
      setProfile((prev) => ({ ...prev, [field]: url }));
      toast.success(`${assetType === 'banner' ? 'Banner' : 'Logo'} uploaded successfully`);
    } catch (error) {
      toast.error(`Failed to upload ${assetType}`);
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="dash-loader">
        <Loader2 className="spinner" size={40} />
        <p>Loading shop manager...</p>
      </div>
    );
  }

  return (
    <div className="shop-manager dash-animate">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Storefront Management</h1>
          <p className="adm-page-sub">Customize how your shop appears to customers</p>
        </div>
        <div className="header-actions">
          <a 
            href={`/shop/${profile.shop_name.toLowerCase().replace(/\s+/g, '-')}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="sa-btn sa-btn--ghost-sm"
          >
            <ExternalLink size={16} />
            Preview Shop
          </a>
          <button 
            className="sa-btn sa-btn--primary-sm" 
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? <Loader2 className="spinner" size={16} /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      </header>

      <div className="shop-layout-grid">
        {/* Left Column - Visuals */}
        <div className="shop-visuals">
          {/* Banner Section */}
          <div className="shop-banner-card adm-card">
            <div className="card-header">
              <h3 className="card-title"><ImageIcon size={18} /> Hero Banner</h3>
            </div>
            <div className="banner-preview-container">
              {profile.banner_url ? (
                <img src={profile.banner_url} alt="Shop Banner" className="banner-preview" />
              ) : (
                <div className="banner-placeholder">
                  <ImageIcon size={48} opacity={0.2} />
                  <span>No banner uploaded</span>
                </div>
              )}
              <button
                type="button"
                className="banner-upload-overlay"
                onClick={() => bannerInputRef.current?.click()}
                disabled={uploading === 'banner'}
              >
                {uploading === 'banner' ? (
                  <>
                    <Loader2 className="spinner" size={24} />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Camera size={24} />
                    <span>{profile.banner_url ? 'Change Banner' : 'Upload Banner'}</span>
                  </>
                )}
              </button>
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  handleAssetUpload('banner', e.target.files?.[0]);
                  // Reset so selecting the same file again re-triggers onChange.
                  e.target.value = '';
                }}
              />
            </div>
            <div className="card-body">
              <p className="field-hint">Recommended size: 1200x300px. High-quality workshop photos work best.</p>
              <input 
                type="text" 
                placeholder="Banner Image URL" 
                value={profile.banner_url}
                onChange={(e) => setProfile({...profile, banner_url: e.target.value})}
                className="shop-input"
              />
            </div>
          </div>

          {/* Logo & Identity */}
          <div className="shop-identity-card adm-card">
            <div className="card-header">
              <h3 className="card-title"><Store size={18} /> Brand Identity</h3>
            </div>
            <div className="identity-flex">
              <div className="logo-upload">
                <div className="logo-preview">
                  {profile.logo_url ? (
                    <img src={profile.logo_url} alt="Logo" />
                  ) : (
                    <span>{profile.shop_name[0]}</span>
                  )}
                  <button
                    type="button"
                    className="logo-edit-btn"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploading === 'logo'}
                    title="Upload logo"
                  >
                    {uploading === 'logo' ? (
                      <Loader2 className="spinner" size={14} />
                    ) : (
                      <Camera size={14} />
                    )}
                  </button>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      handleAssetUpload('logo', e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
              </div>
              <div className="identity-fields">
                <div className="field-group">
                  <label>Shop Name</label>
                  <input 
                    type="text" 
                    value={profile.shop_name}
                    onChange={(e) => setProfile({...profile, shop_name: e.target.value})}
                    placeholder="Enter shop name"
                    className="shop-input"
                  />
                </div>
                <div className="field-group">
                  <label>Shop Slug</label>
                  <div className="slug-preview">
                    laserhub.com/shop/<span>{profile.shop_name.toLowerCase().replace(/\s+/g, '-')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="shop-details">
          <div className="adm-card">
            <div className="card-header">
              <h3 className="card-title">Shop Description</h3>
            </div>
            <div className="card-body">
              <textarea 
                placeholder="Tell customers about your workshop, machines, and expertise..."
                value={profile.description}
                onChange={(e) => setProfile({...profile, description: e.target.value})}
                rows={6}
                className="shop-textarea"
              />
            </div>
          </div>

          <div className="adm-card">
            <div className="card-header">
              <h3 className="card-title">Operations & Policies</h3>
            </div>
            <div className="card-body">
              <div className="details-grid">
                <div className="field-group">
                  <label><Clock size={14} /> Avg. Turnaround (Days)</label>
                  <input
                    type="number"
                    min={0}
                    value={profile.avg_turnaround_days}
                    onChange={(e) => setProfile({...profile, avg_turnaround_days: e.target.value})}
                    className="shop-input"
                  />
                </div>
                <div className="field-group">
                  <label><AlertCircle size={14} /> Min. Order Amount</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={profile.min_order_amount}
                    onChange={(e) => setProfile({...profile, min_order_amount: e.target.value})}
                    className="shop-input"
                  />
                </div>
              </div>
              <div className="field-group mt-1">
                <label><ImageIcon size={14} /> Shipping Policy</label>
                <textarea 
                  placeholder="Details about shipping providers, rates, and zones..."
                  value={profile.shipping_policy}
                  onChange={(e) => setProfile({...profile, shipping_policy: e.target.value})}
                  rows={3}
                  className="shop-textarea"
                />
              </div>
            </div>
          </div>

          <div className="adm-card">
            <div className="card-header">
              <h3 className="card-title">Links & Contact</h3>
            </div>
            <div className="card-body">
              <div className="field-group">
                <label><Globe size={14} /> Website</label>
                <input 
                  type="text" 
                  value={profile.website}
                  onChange={(e) => setProfile({...profile, website: e.target.value})}
                  placeholder="https://yourshop.com"
                  className="shop-input"
                />
              </div>
              <div className="field-group">
                <label><MapPin size={14} /> Location</label>
                <input 
                  type="text" 
                  value={profile.location}
                  onChange={(e) => setProfile({...profile, location: e.target.value})}
                  placeholder="e.g. Mumbai, India"
                  className="shop-input"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .shop-layout-grid {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 1.5rem;
          margin-top: 1.5rem;
        }

        .identity-flex {
          display: flex;
          gap: 1.5rem;
          padding: 1.5rem;
        }

        .logo-preview {
          width: 80px;
          height: 80px;
          background: #f1f5f9;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 800;
          color: var(--dash-accent);
          position: relative;
          border: 1px solid var(--dash-border);
        }

        .logo-preview img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 16px;
        }

        .logo-edit-btn {
          position: absolute;
          bottom: -4px;
          right: -4px;
          background: var(--card-bg);
          border: 1px solid var(--dash-border);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .banner-preview-container {
          position: relative;
          height: 180px;
          background: #f1f5f9;
          overflow: hidden;
        }

        .banner-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .banner-placeholder {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--dash-text-secondary);
          gap: 0.5rem;
        }

        .banner-upload-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.4);
          color: white;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          opacity: 0;
          transition: opacity 0.2s;
          border: none;
          cursor: pointer;
        }

        .banner-preview-container:hover .banner-upload-overlay {
          opacity: 1;
        }

        .shop-input, .shop-textarea {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--dash-border);
          border-radius: 8px;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s;
        }

        .shop-input:focus, .shop-textarea:focus {
          border-color: var(--dash-accent);
        }

        .field-group {
          margin-bottom: 1rem;
        }

        .field-group label {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--dash-text-secondary);
        }

        .field-hint {
          font-size: 0.75rem;
          color: var(--dash-text-secondary);
          margin-bottom: 0.75rem;
        }

        .slug-preview {
          font-size: 0.85rem;
          color: var(--dash-text-secondary);
          padding: 0.75rem;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px dashed var(--dash-border);
        }

        .slug-preview span {
          color: var(--dash-accent);
          font-weight: 700;
        }

        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .mt-1 { margin-top: 1rem; }

        @media (max-width: 1200px) {
          .shop-layout-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

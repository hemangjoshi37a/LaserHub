import React, { useState, useEffect } from 'react';
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
  Clock,
  ShieldCheck,
  Facebook,
  Twitter,
  Instagram,
  Linkedin
} from 'lucide-react';
import { api } from '../../services/api';
import { toast } from 'sonner';
import { useAuthStore } from '../../store/authStore';

interface VendorProfile {
  shop_name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  website: string;
  location: string;
  is_verified: boolean;
  avg_turnaround_days: number;
  min_order_amount: number;
  shipping_policy: string;
}

export const VendorShopManager: React.FC = () => {
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<VendorProfile>({
    shop_name: '',
    description: '',
    logo_url: '',
    banner_url: '',
    website: '',
    location: '',
    is_verified: false,
    avg_turnaround_days: 3,
    min_order_amount: 0,
    shipping_policy: ''
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/vendors/me');
      // Normalize null values to empty strings for controlled inputs
      const normalized = { ...data };
      for (const key in normalized) {
        if (normalized[key] === null) {
          normalized[key] = '';
        }
      }
      setProfile(normalized);
    } catch (error) {
      toast.error('Failed to load shop profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/vendors/me', profile);
      toast.success('Shop profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
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
              <button className="banner-upload-overlay">
                <Camera size={24} />
                <span>Change Banner</span>
              </button>
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
                  <button className="logo-edit-btn"><Camera size={14} /></button>
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
                    value={profile.avg_turnaround_days}
                    onChange={(e) => setProfile({...profile, avg_turnaround_days: parseInt(e.target.value)})}
                    className="shop-input"
                  />
                </div>
                <div className="field-group">
                  <label><AlertCircle size={14} /> Min. Order Amount</label>
                  <input 
                    type="number" 
                    value={profile.min_order_amount}
                    onChange={(e) => setProfile({...profile, min_order_amount: parseFloat(e.target.value)})}
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

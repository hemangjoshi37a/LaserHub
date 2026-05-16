import React, { useState, useEffect, useMemo } from 'react';
import { 
  materialsApi, 
  vendorApi, 
  Material, 
  VendorMaterialItem, 
  VendorProfile 
} from '../services';
import { useAuthStore } from '../store/authStore';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Check, 
  Layers, 
  Search, 
  Settings, 
  Package, 
  AlertCircle,
  TrendingUp,
  Clock,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Skeleton } from './Skeleton';
import { Button, Avatar, EmptyState } from './ui';

export const VendorCatalogManager: React.FC = () => {
  const { user } = useAuthStore();
  const { currency } = useCurrencyStore();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [globalMaterials, setGlobalMaterials] = useState<Material[]>([]);
  const [myMaterials, setMyMaterials] = useState<VendorMaterialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-catalog' | 'add-materials'>('my-catalog');
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Get vendor profile using current user ID (backend now supports User ID lookup)
      const vProfile = await vendorApi.getVendor(user?.id.toString() || '');
      
      if (vProfile) {
        setVendor(vProfile);
        const [globals, mine] = await Promise.all([
          materialsApi.listMaterials(),
          vendorApi.getVendorMaterials(vProfile.id)
        ]);
        setGlobalMaterials(globals);
        setMyMaterials(mine);
      }
    } catch (error) {
      toast.error('Failed to load catalog data');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStock = async (vm: VendorMaterialItem) => {
    try {
      setIsSaving(vm.id);
      await vendorApi.updateVendorMaterial(vm.id, { is_in_stock: !vm.is_in_stock });
      setMyMaterials(prev => prev.map(item => 
        item.id === vm.id ? { ...item, is_in_stock: !item.is_in_stock } : item
      ));
      toast.success(`${vm.material_name} stock updated`);
    } catch {
      toast.error('Failed to update stock');
    } finally {
      setIsSaving(null);
    }
  };

  const handleUpdatePrice = async (vm: VendorMaterialItem, price: number) => {
    try {
      setIsSaving(vm.id);
      await vendorApi.updateVendorMaterial(vm.id, { custom_price_per_cm2_mm: price });
      setMyMaterials(prev => prev.map(item => 
        item.id === vm.id ? { ...item, custom_price_per_cm2_mm: price } : item
      ));
      toast.success('Price updated');
    } catch {
      toast.error('Failed to update price');
    } finally {
      setIsSaving(null);
    }
  };

  const handleUpdateLeadTime = async (vm: VendorMaterialItem, days: number) => {
    try {
      setIsSaving(vm.id);
      await vendorApi.updateVendorMaterial(vm.id, { lead_time_days: days });
      setMyMaterials(prev => prev.map(item => 
        item.id === vm.id ? { ...item, lead_time_days: days } : item
      ));
      toast.success('Lead time updated');
    } catch {
      toast.error('Failed to update lead time');
    } finally {
      setIsSaving(null);
    }
  };

  const handleDeleteMaterial = async (vmId: number) => {
    if (!window.confirm('Remove this material from your active catalog?')) return;
    try {
      await vendorApi.deleteVendorMaterial(vmId);
      setMyMaterials(prev => prev.filter(m => m.id !== vmId));
      toast.success('Material removed from catalog');
    } catch {
      toast.error('Failed to remove material');
    }
  };

  const handleAddMaterial = async (material: Material, thickness: number) => {
    if (!vendor) return;
    try {
      const newItem = await vendorApi.addVendorMaterial({
        material_id: material.id,
        thickness_mm: thickness,
        is_in_stock: true,
        lead_time_days: 2,
      });
      setMyMaterials(prev => [...prev, newItem]);
      toast.success(`Added ${material.name} (${thickness}mm) to your catalog`);
    } catch {
      toast.error('Material already in your catalog or failed to add');
    }
  };

  const filteredMaterials = useMemo(() => {
    const q = search.toLowerCase();
    if (activeTab === 'my-catalog') {
      return myMaterials.filter(m => 
        m.material_name?.toLowerCase().includes(q)
      );
    } else {
      return globalMaterials.filter(m => 
        m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q)
      );
    }
  }, [activeTab, search, myMaterials, globalMaterials]);

  if (loading) {
    return (
      <div className="adm-page animate-in">
        <header className="adm-page-header">
          <Skeleton width="200px" height="2rem" />
        </header>
        <div className="skeleton-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height="120px" borderRadius="12px" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="adm-page animate-in vendor-catalog-manager">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title"><Layers size={22} /> Catalog Management</h1>
          <p className="adm-page-sub">Manage the materials you support and set your custom pricing.</p>
        </div>
        <div className="adm-header-actions">
          <div className={`adm-tab-pill ${activeTab === 'my-catalog' ? 'active' : ''}`} onClick={() => setActiveTab('my-catalog')}>
            My Active Catalog
          </div>
          <div className={`adm-tab-pill ${activeTab === 'add-materials' ? 'active' : ''}`} onClick={() => setActiveTab('add-materials')}>
            Browse Platform Materials
          </div>
        </div>
      </header>

      <div className="adm-toolbar">
        <div className="adm-search">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search materials..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="adm-toolbar-right">
          <Button variant="secondary" icon={<Filter size={14} />}>Filter</Button>
        </div>
      </div>

      {activeTab === 'my-catalog' && (
        <div className="catalog-grid">
          {filteredMaterials.length === 0 ? (
            <div className="full-width">
              <EmptyState 
                title="Your catalog is empty" 
                description="Subscribe to materials from the 'Browse Platform Materials' tab to start receiving orders."
                icon={<Package size={48} />}
                action={<Button onClick={() => setActiveTab('add-materials')}>Browse Materials</Button>}
              />
            </div>
          ) : (
            <div className="adm-table-wrap">
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Thickness</th>
                    <th>Availability</th>
                    <th>Lead Time</th>
                    <th>Custom Rate</th>
                    <th style={{ width: '80px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(filteredMaterials as VendorMaterialItem[]).map((vm) => (
                    <tr key={vm.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div className="material-icon-box">
                            <Layers size={16} />
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>{vm.material_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>ID: #{vm.material_id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="sa-badge sa-badge--outline">{vm.thickness_mm}mm</span>
                      </td>
                      <td>
                        <div className="stock-toggle-wrap">
                          <button 
                            className={`sa-stock-btn ${vm.is_in_stock ? 'in' : 'out'}`}
                            onClick={() => handleToggleStock(vm)}
                            disabled={isSaving === vm.id}
                          >
                            {vm.is_in_stock ? <Check size={14} /> : <AlertCircle size={14} />}
                            {vm.is_in_stock ? 'In Stock' : 'Out of Stock'}
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="inline-input-group">
                          <Clock size={12} />
                          <input 
                            type="number" 
                            defaultValue={vm.lead_time_days}
                            onBlur={(e) => handleUpdateLeadTime(vm, parseFloat(e.target.value))}
                            className="sa-inline-input"
                          />
                          <span>Days</span>
                        </div>
                      </td>
                      <td>
                        <div className="inline-input-group price">
                          <span>{formatPrice(0, currency).replace('0.00', '')}</span>
                          <input 
                            type="number" 
                            step="0.001"
                            defaultValue={vm.custom_price_per_cm2_mm || 0}
                            onBlur={(e) => handleUpdatePrice(vm, parseFloat(e.target.value))}
                            className="sa-inline-input"
                          />
                          <span className="unit">/ cm²·mm</span>
                        </div>
                      </td>
                      <td>
                        <button className="sa-icon-btn danger" onClick={() => handleDeleteMaterial(vm.id)}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'add-materials' && (
        <div className="catalog-grid browse">
          {(filteredMaterials as Material[]).map((m) => (
            <div key={m.id} className="adm-card material-browse-card">
              <div className="card-header">
                <div className="material-type-tag">{m.type}</div>
                <h3 className="card-title">{m.name}</h3>
              </div>
              <div className="card-body">
                <p className="material-desc">{m.description || 'Standard platform material for laser cutting.'}</p>
                <div className="thickness-selector">
                  <div className="label">Available Thicknesses:</div>
                  <div className="thickness-pills">
                    {m.available_thicknesses.map(t => {
                      const isAdded = myMaterials.some(mine => mine.material_id === m.id && mine.thickness_mm === t);
                      return (
                        <button 
                          key={t} 
                          className={`thickness-pill ${isAdded ? 'added' : ''}`}
                          onClick={() => !isAdded && handleAddMaterial(m, t)}
                          disabled={isAdded}
                        >
                          {t}mm
                          {isAdded ? <Check size={10} /> : <Plus size={10} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="card-footer">
                <div className="base-rate">Base Rate: {formatPrice(m.rate_per_cm2_mm, currency)}</div>
                <Button variant="ghost" size="sm" icon={<ChevronRight size={14} />}>Details</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .vendor-catalog-manager .adm-header-actions {
          display: flex;
          background: var(--bg-secondary);
          padding: 0.25rem;
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }
        .adm-tab-pill {
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-tertiary);
        }
        .adm-tab-pill.active {
          background: var(--card-bg);
          color: var(--dash-accent);
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        
        .material-icon-box {
          width: 32px;
          height: 32px;
          background: var(--dash-accent-soft);
          color: var(--dash-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
        }

        .sa-stock-btn {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.4rem 0.75rem;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.2s;
        }
        .sa-stock-btn.in {
          background: #f0fdf4;
          color: #166534;
          border-color: #bbf7d0;
        }
        .sa-stock-btn.out {
          background: #fef2f2;
          color: #991b1b;
          border-color: #fecaca;
        }

        .inline-input-group {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        .sa-inline-input {
          width: 50px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 0.2rem 0.4rem;
          font-weight: 700;
          text-align: center;
        }
        .inline-input-group.price .sa-inline-input {
          width: 70px;
          text-align: right;
        }
        .inline-input-group .unit {
          font-size: 0.7rem;
          color: var(--text-tertiary);
        }

        .material-browse-card {
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .material-type-tag {
          font-size: 0.65rem;
          text-transform: uppercase;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--dash-accent);
          margin-bottom: 0.25rem;
        }
        .material-desc {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 1rem;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .thickness-selector .label {
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        .thickness-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .thickness-pill {
          padding: 0.3rem 0.6rem;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 700;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          gap: 0.25rem;
          cursor: pointer;
        }
        .thickness-pill:hover {
          background: var(--bg-primary);
          border-color: var(--dash-accent);
        }
        .thickness-pill.added {
          background: var(--dash-accent-soft);
          color: var(--dash-accent);
          border-color: transparent;
          cursor: default;
        }
        
        .material-browse-card .card-footer {
          margin-top: auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color);
        }
        .base-rate {
          font-size: 0.85rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .catalog-grid.browse {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
        }
      `}</style>
    </div>
  );
};

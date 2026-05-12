import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Ruler, Package, FileText, Trees, Box, Wallet, CircleDot, Cpu, Sparkles, GitCompare, Gift, X } from 'lucide-react';
import { useAppStore } from '../store';
import { materialsApi, type Material } from '../services';
import { toast } from 'sonner';
import { Skeleton } from './Skeleton';
import { MaterialWizardPage } from '../pages/MaterialWizardPage';
import { formatPrice } from '../utils/formatPrice';

const MATERIAL_ICONS: Record<string, any> = {
  acrylic: CircleDot,
  wood_mdf: Trees,
  plywood: Layers,
  leather: Wallet,
  paper: FileText,
  aluminum: Cpu,
  stainless_steel: Box,
};

export const MaterialSelector: React.FC = () => {
  const { 
    materials, 
    setMaterials, 
    selectedMaterial, 
    setSelectedMaterial,
    selectedThickness,
    setSelectedThickness,
    quantity,
    setQuantity,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      const data = await materialsApi.listMaterials();
      setMaterials(data);
      
      // Select first material by default
      if (data.length > 0 && !selectedMaterial) {
        setSelectedMaterial(data[0]);
        if (data[0].available_thicknesses.length > 0) {
          setSelectedThickness(data[0].available_thicknesses[0]);
        }
      }
    } catch (error) {
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialChange = (material: Material) => {
    setSelectedMaterial(material);
    if (material.available_thicknesses.length > 0) {
      setSelectedThickness(material.available_thicknesses[0]);
    }
  };

  if (loading) {
    return (
      <div className="material-selector material-selector-compact animate-in">
        <h3>Material & Specifications</h3>
        <div className="material-grid material-grid-dense">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="material-card material-card-compact" style={{ cursor: 'default' }}>
              <Skeleton width={24} height={24} borderRadius="6px" />
              <Skeleton width="80%" height="1rem" style={{ margin: '0.5rem auto' }} />
              <Skeleton width="50%" height="0.8rem" style={{ margin: '0.25rem auto' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="material-selector material-selector-compact animate-in">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>Material & Specifications</h3>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="thickness-btn"
            style={{ fontSize: '0.75rem' }}
            title="Get a material recommendation"
          >
            <Sparkles size={12} /> Help me choose
          </button>
          <Link
            to="/materials/compare"
            className="thickness-btn"
            style={{ fontSize: '0.75rem', textDecoration: 'none' }}
            title="Compare materials"
          >
            <GitCompare size={12} /> Compare
          </Link>
        </div>
      </div>

      <div
        style={{
          margin: '0.5rem 0 0.75rem',
          padding: '0.55rem 0.8rem',
          background: 'linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)',
          border: '1px solid #facc15',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          flexWrap: 'wrap',
          fontSize: '0.82rem',
          color: '#713f12',
        }}
      >
        <span>
          <Gift size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          <strong>New to laser cutting?</strong> Order our sample pack (₹299 delivered) to see every material.
        </span>
        <Link
          to="/samples"
          className="thickness-btn"
          style={{ fontSize: '0.75rem', textDecoration: 'none', background: '#713f12', color: '#fff', borderColor: '#713f12' }}
        >
          Get sample pack
        </Link>
      </div>

      {wizardOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
          onClick={() => setWizardOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--bg-primary, #fff)', borderRadius: 12, padding: '1.2rem',
              maxWidth: 720, width: '100%', maxHeight: '90vh', overflow: 'auto', position: 'relative',
            }}
          >
            <button
              onClick={() => setWizardOpen(false)}
              aria-label="Close"
              style={{ position: 'absolute', top: 10, right: 10, background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
            <MaterialWizardPage
              embedded
              onClose={() => setWizardOpen(false)}
              onPick={(m) => {
                handleMaterialChange(m);
                setWizardOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <div className="material-grid material-grid-dense">
        {materials.map((material) => {
          const Icon = MATERIAL_ICONS[material.type] || Layers;
          const hasImage = !!material.image_url;
          return (
            <button
              type="button"
              key={material.id}
              className={`material-card material-card-compact ${selectedMaterial?.id === material.id ? 'selected' : ''} ${hasImage ? 'has-image' : ''}`}
              onClick={() => handleMaterialChange(material)}
              title={material.description || ''}
              style={hasImage ? {
                backgroundImage: `url(${material.image_url})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : undefined}
            >
              {!hasImage && (
                <div
                  className="material-color-accent"
                  style={{ backgroundColor: material.color_hex || '#0ea5e9' }}
                />
              )}
              {hasImage && <div className="material-image-overlay" />}
              <div className="material-card-icon">
                <Icon size={18} />
              </div>
              <h4>{material.name}</h4>
              <span className="material-rate">{formatPrice(material.rate_per_cm2_mm)}/cm²</span>
            </button>
          );
        })}
      </div>

      {selectedMaterial && (
        <div className="specifications specifications-inline animate-in">
          <div className="spec-group spec-group-inline">
            <label><Ruler size={14} /> Thickness</label>
            <div className="thickness-options thickness-options-compact">
              {selectedMaterial.available_thicknesses.map((thickness) => {
                const config = selectedMaterial.configs?.find(c => c.thickness_mm === thickness);
                const isOutOfStock = config && !config.is_in_stock;

                return (
                  <button
                    key={thickness}
                    className={`thickness-btn thickness-btn-sm ${selectedThickness === thickness ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !isOutOfStock && setSelectedThickness(thickness)}
                    disabled={isOutOfStock}
                    title={isOutOfStock ? 'Out of stock' : `${thickness}mm`}
                  >
                    {thickness} mm
                  </button>
                );
              })}
            </div>
          </div>

          <div className="spec-group spec-group-inline">
            <label><Package size={14} /> Qty</label>
            <div className="quantity-selector quantity-selector-compact">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >-</button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={999}
              />
              <button
                onClick={() => setQuantity(quantity + 1)}
                aria-label="Increase quantity"
              >+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

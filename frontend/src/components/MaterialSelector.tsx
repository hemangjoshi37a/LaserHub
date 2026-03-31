import React, { useEffect, useState } from 'react';
import { Layers, Ruler, Package, FileText, Trees, Box, Wallet, CircleDot, Cpu } from 'lucide-react';
import { useAppStore } from '../store';
import { materialsApi } from '../services';
import { toast } from 'sonner';
import { Skeleton } from './Skeleton';

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

  const handleMaterialChange = (material: any) => {
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
      <h3>Material & Specifications</h3>

      <div className="material-grid material-grid-dense">
        {materials.map((material) => {
          const Icon = MATERIAL_ICONS[material.type] || Layers;
          return (
            <div
              key={material.id}
              className={`material-card material-card-compact ${selectedMaterial?.id === material.id ? 'selected' : ''}`}
              onClick={() => handleMaterialChange(material)}
              title={material.description || ''}
            >
              <div
                className="material-color-accent"
                style={{ backgroundColor: material.color_hex || '#0ea5e9' }}
              />
              <div className="material-card-icon">
                <Icon size={18} />
              </div>
              <h4>{material.name}</h4>
              <span className="material-rate">${material.rate_per_cm2_mm.toFixed(3)}/cm²</span>
            </div>
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
                    {thickness}
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
                min="1"
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

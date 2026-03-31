import { useEffect, useState } from 'react';
import { Layers, Ruler, Package, Info, FileText, Trees, Box, Wallet, CircleDot, Cpu } from 'lucide-react';
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
      <div className="material-selector animate-in">
        <h2>Select Material & Specifications</h2>
        <div className="material-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="material-card" style={{ cursor: 'default' }}>
              <Skeleton width={48} height={48} borderRadius="12px" />
              <Skeleton width="80%" height="1.5rem" style={{ margin: '1rem auto' }} />
              <Skeleton width="60%" height="1rem" style={{ margin: '0.5rem auto' }} />
              <Skeleton width="40%" height="1.2rem" style={{ margin: '0.5rem auto' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="material-selector animate-in">
      <h2>Select Material & Specifications</h2>

      <div className="material-grid">
        {materials.map((material) => {
          const Icon = MATERIAL_ICONS[material.type] || Layers;
          return (
            <div
              key={material.id}
              className={`material-card ${selectedMaterial?.id === material.id ? 'selected' : ''}`}
              onClick={() => handleMaterialChange(material)}
              style={{
                '--material-color': material.color_hex || '#0ea5e9',
              } as React.CSSProperties}
            >
              <div 
                className="material-card-icon"
                style={{
                  background: `linear-gradient(135deg, ${material.color_hex}20, ${material.color_hex}40)`,
                }}
              >
                <Icon size={28} style={{ color: material.color_hex }} />
              </div>
              <div 
                className="material-color-swatch"
                style={{ backgroundColor: material.color_hex }}
                title={`Color: ${material.color_hex}`}
              />
              <h3>{material.name}</h3>
              <p className="material-type">{material.type.replace('_', ' ')}</p>
              <p className="material-rate">${material.rate_per_cm2_mm.toFixed(3)}/cm²/mm</p>
              {material.description && (
                <div className="material-info-tooltip">
                  <Info size={14} />
                  <span>{material.description}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
                  <Info size={14} />
                  <span>{material.description}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selectedMaterial && (
        <div className="specifications animate-in">
          <div className="spec-group">
            <label>
              <Ruler size={18} />
              Thickness (mm)
            </label>
            <div className="thickness-options">
              {selectedMaterial.available_thicknesses.map((thickness) => {
                const config = selectedMaterial.configs?.find(c => c.thickness_mm === thickness);
                const isOutOfStock = config && !config.is_in_stock;
                
                return (
                  <button
                    key={thickness}
                    className={`thickness-btn ${selectedThickness === thickness ? 'selected' : ''} ${isOutOfStock ? 'out-of-stock' : ''}`}
                    onClick={() => !isOutOfStock && setSelectedThickness(thickness)}
                    disabled={isOutOfStock}
                    title={isOutOfStock ? 'Currently out of stock' : ''}
                  >
                    {thickness}mm
                    {isOutOfStock && <span className="stock-tag">Out of Stock</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="spec-group">
            <label>
              <Package size={18} />
              Quantity
            </label>
            <div className="quantity-selector">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
                aria-label="Decrease quantity"
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
              />
              <button 
                onClick={() => setQuantity(quantity + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Layers, Ruler, Package } from 'lucide-react';
import { useAppStore } from '../store';
import { materialsApi } from '../services';
import { toast } from 'sonner';

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
      <div className="material-selector">
        <h2>Select Material</h2>
        <div className="loading">Loading materials...</div>
      </div>
    );
  }

  return (
    <div className="material-selector">
      <h2>Select Material & Specifications</h2>
      
      <div className="material-grid">
        {materials.map((material) => (
          <div
            key={material.id}
            className={`material-card ${selectedMaterial?.id === material.id ? 'selected' : ''}`}
            onClick={() => handleMaterialChange(material)}
          >
            <Layers size={24} />
            <h3>{material.name}</h3>
            <p className="material-type">{material.type.replace('_', ' ')}</p>
            <p className="material-rate">${material.rate_per_cm2_mm}/cm²/mm</p>
            {material.description && (
              <p className="material-description">{material.description}</p>
            )}
          </div>
        ))}
      </div>

      {selectedMaterial && (
        <div className="specifications">
          <div className="spec-group">
            <label>
              <Ruler size={18} />
              Thickness (mm)
            </label>
            <div className="thickness-options">
              {selectedMaterial.available_thicknesses.map((thickness) => (
                <button
                  key={thickness}
                  className={`thickness-btn ${selectedThickness === thickness ? 'selected' : ''}`}
                  onClick={() => setSelectedThickness(thickness)}
                >
                  {thickness}mm
                </button>
              ))}
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
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
              />
              <button onClick={() => setQuantity(quantity + 1)}>+</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { materialsApi, Material } from '../services';
import { toast } from 'sonner';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Loader,
  Layers,
  Settings
} from 'lucide-react';

export const MaterialManager: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<number | null>(null);
  const [expandedMaterial, setExpandedMaterial] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<Partial<Material>>({
    name: '',
    type: 'acrylic',
    rate_per_cm2_mm: 0.05,
    available_thicknesses: [3, 5, 10],
    description: ''
  });

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      const data = await materialsApi.listMaterials();
      setMaterials(data);
    } catch (error) {
      toast.error('Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateConfig = (configId: number, data: any) => {
    setMaterials(prev => prev.map(m => ({
      ...m,
      configs: m.configs.map(c => c.id === configId ? { ...c, ...data } : c)
    })));
  };

  const handleSaveConfig = async (configId: number) => {
    try {
      const material = materials.find(m => m.configs.some(c => c.id === configId));
      if (!material) return;
      const config = material.configs.find(c => c.id === configId);
      if (!config) return;

      await materialsApi.updateConfig(configId, config);
      toast.success('Configuration saved');
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEditing) {
        await materialsApi.updateMaterial(isEditing, formData);
        toast.success('Material updated');
      } else {
        await materialsApi.createMaterial(formData as Omit<Material, 'id'>);
        toast.success('Material created');
      }
      setIsEditing(null);
      setShowAddForm(false);
      setFormData({
        name: '',
        type: 'acrylic',
        rate_per_cm2_mm: 0.05,
        available_thicknesses: [3, 5, 10],
        description: ''
      });
      loadMaterials();
    } catch (error) {
      toast.error('Failed to save material');
    }
  };

  const handleEdit = (material: Material) => {
    setIsEditing(material.id);
    setFormData(material);
    setShowAddForm(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Are you sure you want to deactivate this material?')) {
      try {
        await materialsApi.deleteMaterial(id);
        toast.success('Material deactivated');
        loadMaterials();
      } catch (error) {
        toast.error('Failed to deactivate material');
      }
    }
  };

  const handleThicknessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const values = e.target.value.split(',').map(v => parseFloat(v.trim())).filter(v => !isNaN(v));
    setFormData({ ...formData, available_thicknesses: values });
  };

  if (loading) {
    return <div className="loading"><Loader className="spinner" /> Loading materials...</div>;
  }

  return (
    <div className="material-manager animate-in">
      <div className="manager-header">
        <h2><Layers size={20} /> Material Management</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)} className="add-btn">
            <Plus size={16} /> Add Material
          </button>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="material-form card compact-card">
          <h3>{isEditing ? 'Edit Material' : 'Add New Material'}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Acrylic Clear"
                required
              />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select
                value={formData.type}
                onChange={e => setFormData({...formData, type: e.target.value})}
              >
                <option value="acrylic">Acrylic</option>
                <option value="wood_mdf">Wood/MDF</option>
                <option value="plywood">Plywood</option>
                <option value="leather">Leather</option>
                <option value="paper">Paper</option>
                <option value="aluminum">Aluminum</option>
                <option value="stainless_steel">Stainless Steel</option>
              </select>
            </div>
            <div className="form-group">
              <label>Rate (per cm2 per mm)</label>
              <input
                type="number"
                step="0.001"
                value={formData.rate_per_cm2_mm}
                onChange={e => setFormData({...formData, rate_per_cm2_mm: parseFloat(e.target.value)})}
                required
              />
            </div>
            <div className="form-group">
              <label>Thicknesses (mm, comma separated)</label>
              <input
                type="text"
                value={formData.available_thicknesses?.join(', ')}
                onChange={handleThicknessChange}
                placeholder="e.g. 3, 5, 10"
                required
              />
            </div>
            <div className="form-group full-width">
              <label>Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Brief description of material usage..."
                rows={2}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => { setShowAddForm(false); setIsEditing(null); }} className="cancel-btn">
              <X size={15} /> Cancel
            </button>
            <button type="submit" className="save-btn">
              <Check size={15} /> {isEditing ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      )}

      <div className="materials-list card compact-card">
        <table className="orders-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Rate</th>
              <th>Thicknesses</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {materials.map(material => (
              <React.Fragment key={material.id}>
                <tr>
                  <td className="cell-bold">{material.name}</td>
                  <td className="cell-capitalize">{material.type.replace('_', ' ')}</td>
                  <td className="cell-accent cell-bold">${material.rate_per_cm2_mm.toFixed(3)}</td>
                  <td>
                    <div className="thickness-badges">
                      {material.available_thicknesses.map(t => (
                        <span key={t} className="badge">{t}mm</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="actions">
                      <button onClick={() => handleEdit(material)} className="edit-btn" title="Edit">
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => setExpandedMaterial(expandedMaterial === material.id ? null : material.id)}
                        className="edit-btn config-btn"
                        title="Manage Configs"
                      >
                        <Settings size={14} />
                      </button>
                      <button onClick={() => handleDelete(material.id)} className="delete-btn" title="Deactivate">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedMaterial === material.id && (
                  <tr>
                    <td colSpan={5}>
                      <div className="configs-manager">
                        <div className="configs-header">
                          <h4>Thickness Configs</h4>
                          <span className="configs-hint">Custom rates and speeds per thickness</span>
                        </div>
                        <table className="configs-table">
                          <thead>
                            <tr>
                              <th>Thickness</th>
                              <th>Rate ($/cm2)</th>
                              <th>Speed (mm/min)</th>
                              <th>Stock</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {material.configs.map(config => (
                              <tr key={config.id}>
                                <td className="cell-bold">{config.thickness_mm}mm</td>
                                <td>
                                  <input
                                    type="number"
                                    step="0.001"
                                    value={config.rate_per_cm2}
                                    onChange={(e) => handleUpdateConfig(config.id, { rate_per_cm2: parseFloat(e.target.value) })}
                                    className="config-input"
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number"
                                    value={config.cut_speed_mm_min}
                                    onChange={(e) => handleUpdateConfig(config.id, { cut_speed_mm_min: parseFloat(e.target.value) })}
                                    className="config-input"
                                  />
                                </td>
                                <td>
                                  <button
                                    onClick={() => handleUpdateConfig(config.id, { is_in_stock: !config.is_in_stock })}
                                    className={`stock-toggle ${config.is_in_stock ? 'in-stock' : 'out-of-stock'}`}
                                  >
                                    {config.is_in_stock ? 'In Stock' : 'Out'}
                                  </button>
                                </td>
                                <td>
                                  <button onClick={() => handleSaveConfig(config.id)} className="save-btn compact-save">
                                    Save
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

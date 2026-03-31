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
  Layers
} from 'lucide-react';

export const MaterialManager: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<number | null>(null);
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
    <div className="material-manager">
      <div className="manager-header">
        <h2><Layers size={20} /> Material Management</h2>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)} className="add-btn">
            <Plus size={18} /> Add Material
          </button>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={handleSubmit} className="material-form card">
          <h3>{isEditing ? 'Edit Material' : 'Add New Material'}</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Name</label>
              <input 
                type="text" 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
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
              <label>Rate (per cm² per mm)</label>
              <input 
                type="number" 
                step="0.01" 
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
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" onClick={() => { setShowAddForm(false); setIsEditing(null); }} className="cancel-btn">
              <X size={18} /> Cancel
            </button>
            <button type="submit" className="save-btn">
              <Check size={18} /> {isEditing ? 'Update' : 'Create'} Material
            </button>
          </div>
        </form>
      )}

      <div className="materials-list card">
        <table>
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
              <tr key={material.id}>
                <td className="font-bold">{material.name}</td>
                <td className="capitalize">{material.type.replace('_', ' ')}</td>
                <td>${material.rate_per_cm2_mm.toFixed(3)}</td>
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
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(material.id)} className="delete-btn" title="Deactivate">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .material-manager { padding: 1rem 0; }
        .manager-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .manager-header h2 { display: flex; align-items: center; gap: 0.5rem; margin: 0; }
        .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 1.5rem; margin-bottom: 1.5rem; }
        .material-form h3 { margin-top: 0; margin-bottom: 1rem; }
        .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .form-group { display: flex; flexDirection: column; gap: 0.4rem; }
        .form-group label { font-size: 0.9rem; font-weight: 600; color: #4b5563; }
        .form-group input, .form-group select, .form-group textarea { 
          padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 1rem; 
        }
        .full-width { grid-column: span 2; }
        .form-actions { display: flex; justify-content: flex-end; gap: 0.8rem; margin-top: 1.5rem; }
        .add-btn { background: #0ea5e9; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-weight: 600; }
        .save-btn { background: #10b981; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-weight: 600; }
        .cancel-btn { background: #f3f4f6; color: #4b5563; border: 1px solid #d1d5db; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.4rem; font-weight: 600; }
        .materials-list table { width: 100%; border-collapse: collapse; }
        .materials-list th { text-align: left; padding: 0.75rem; border-bottom: 2px solid #f3f4f6; color: #6b7280; font-size: 0.85rem; text-transform: uppercase; }
        .materials-list td { padding: 0.75rem; border-bottom: 1px solid #f3f4f6; }
        .thickness-badges { display: flex; flex-wrap: wrap; gap: 0.3rem; }
        .badge { background: #f3f4f6; color: #4b5563; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.8rem; }
        .actions { display: flex; gap: 0.5rem; }
        .edit-btn { color: #0ea5e9; background: #f0f9ff; border: 1px solid #bae6fd; padding: 0.3rem; border-radius: 4px; cursor: pointer; }
        .delete-btn { color: #ef4444; background: #fef2f2; border: 1px solid #fee2e2; padding: 0.3rem; border-radius: 4px; cursor: pointer; }
        .capitalize { text-transform: capitalize; }
        .font-bold { font-weight: 600; }
      `}</style>
    </div>
  );
};

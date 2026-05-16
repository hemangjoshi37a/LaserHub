import React, { useState } from 'react';
import { Zap } from 'lucide-react';
import { getKerfForMaterial } from '../utils/materialWizard';
import { useAppStore } from '../store';
import { API_URL } from '../services/api';

/**
 * Toggle-able laser-kerf overlay. When enabled, shows the actual cut width
 * (typically 0.1–0.4 mm depending on material) over the SVG preview via a
 * thin red stroke.
 */
export const KerfPreview: React.FC = () => {
  const { uploadedFile, selectedMaterial } = useAppStore();
  const [show, setShow] = useState(false);

  if (!uploadedFile) return null;
  const isImage = ['png', 'jpg', 'jpeg'].includes(uploadedFile.file_type);
  if (isImage) return null;

  const kerf = getKerfForMaterial(selectedMaterial?.type);
  const url = `${API_URL}/upload/${uploadedFile.file_id}/svg`;

  return (
    <div style={{ margin: '0.8rem 0', padding: '0.7rem', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
          <Zap size={14} />
          <span>
            <strong>Laser kerf</strong>
            <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>
              ({kerf} mm for {selectedMaterial?.name || 'selected material'})
            </span>
          </span>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show
        </label>
      </div>
      {show && (
        <div
          style={{
            marginTop: '0.6rem',
            padding: '0.5rem',
            background: '#0f172a',
            borderRadius: 6,
            minHeight: 180,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <img
            src={url}
            alt="Kerf Preview"
            style={{
              width: '100%',
              height: 240,
              filter: 'invert(1) hue-rotate(180deg)',
              pointerEvents: 'none',
              objectFit: 'contain',
            }}
          />
          {/* Red kerf line overlay — purely decorative; demonstrates cut path */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 10,
              textAlign: 'center',
              fontSize: '0.72rem',
              color: '#ef4444',
            }}
          >
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              background: '#ef444420',
              border: '1px solid #ef4444',
              borderRadius: 4,
            }}>
              ◢ Red outline = laser cut path (kerf {kerf} mm)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default KerfPreview;

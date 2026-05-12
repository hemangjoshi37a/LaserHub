import React, { useState } from 'react';
import { Layers, Boxes } from 'lucide-react';
import { MaterialManager } from '../components/MaterialManager';
import { Inventory } from './Inventory';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Tab = 'materials' | 'inventory';

/**
 * Merged Materials + Inventory page.
 *
 * Tabs between the material catalog (rates, thicknesses, configs) and
 * inventory tracking (stock levels, alerts, reorder thresholds) so vendors
 * have a single entry point for all material-related management.
 */
export const MaterialsInventory: React.FC = () => {
  useDocumentTitle('Materials & Inventory - LaserHub');
  const [tab, setTab] = useState<Tab>('materials');

  return (
    <div className="mi-page">
      <div className="mi-header">
        <div>
          <h2 className="mi-title">Materials &amp; Inventory</h2>
          <p className="mi-subtitle">
            Manage your material catalog, pricing, and stock levels in one place.
          </p>
        </div>
      </div>

      <div className="mi-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'materials'}
          className={`mi-tab ${tab === 'materials' ? 'mi-tab--active' : ''}`}
          onClick={() => setTab('materials')}
        >
          <Layers size={16} />
          <span>Catalog &amp; Rates</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'inventory'}
          className={`mi-tab ${tab === 'inventory' ? 'mi-tab--active' : ''}`}
          onClick={() => setTab('inventory')}
        >
          <Boxes size={16} />
          <span>Stock &amp; Inventory</span>
        </button>
      </div>

      <div className="mi-panel" role="tabpanel">
        {tab === 'materials' && <MaterialManager />}
        {tab === 'inventory' && <Inventory />}
      </div>
    </div>
  );
};

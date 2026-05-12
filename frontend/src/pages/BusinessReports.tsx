import React, { useState } from 'react';
import { BarChart2, DollarSign } from 'lucide-react';
import { Analytics } from './Analytics';
import { FinancialsDashboard } from './FinancialsDashboard';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Tab = 'analytics' | 'financials';

/**
 * Merged Analytics + Financials page.
 *
 * Tabs between sales/traffic analytics and revenue/tax/profit financials so
 * vendors have one "Reports" entry instead of two sibling pages.
 */
export const BusinessReports: React.FC = () => {
  useDocumentTitle('Business Reports - LaserHub');
  const [tab, setTab] = useState<Tab>('analytics');

  return (
    <div className="mi-page">
      <div className="mi-header">
        <div>
          <h2 className="mi-title">Analytics &amp; Financials</h2>
          <p className="mi-subtitle">
            Sales trends, material performance, revenue breakdowns, and profit margins.
          </p>
        </div>
      </div>

      <div className="mi-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'analytics'}
          className={`mi-tab ${tab === 'analytics' ? 'mi-tab--active' : ''}`}
          onClick={() => setTab('analytics')}
        >
          <BarChart2 size={16} />
          <span>Analytics</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'financials'}
          className={`mi-tab ${tab === 'financials' ? 'mi-tab--active' : ''}`}
          onClick={() => setTab('financials')}
        >
          <DollarSign size={16} />
          <span>Financials</span>
        </button>
      </div>

      <div className="mi-panel" role="tabpanel">
        {tab === 'analytics' && <Analytics />}
        {tab === 'financials' && <FinancialsDashboard />}
      </div>
    </div>
  );
};

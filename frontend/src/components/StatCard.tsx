import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  icon?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  sub,
  tone = 'info',
  icon,
}) => {
  return (
    <div className="adm-stat-card">
      {icon && (
        <div className={`adm-stat-icon adm-stat-icon--${tone}`}>
          {icon}
        </div>
      )}
      <div>
        <p className="adm-stat-label">{label}</p>
        <p className="adm-stat-value">{value}</p>
        {sub && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: '0.25rem 0 0' }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
};

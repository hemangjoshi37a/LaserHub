import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { useCurrencyStore, formatPrice } from '../store/currencyStore';

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  [key: string]: any;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
}

export const RevenueChart: React.FC<RevenueChartProps> = ({ data }) => {
  const { currency } = useCurrencyStore();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          tickFormatter={(value: string) => value.split('-').slice(1).join('/')}
          axisLine={{ stroke: 'var(--border-color)' }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: 'var(--text-tertiary)' }}
          axisLine={{ stroke: 'var(--border-color)' }}
          tickFormatter={(v: number) => formatPrice(v, currency)}
        />
        <Tooltip
          formatter={(value: number) => [formatPrice(value, currency), 'Revenue']}
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--card-shadow)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
          }}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke="var(--accent-color, #0ea5e9)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: 'var(--accent-color, #0ea5e9)', strokeWidth: 2, stroke: 'var(--bg-primary)' }}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: React.ReactNode;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
  variant?: 'white' | 'peach';
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  trend,
  icon,
  subtitle,
  onClick,
  className = '',
  variant = 'white',
}) => {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl p-5 sm:p-6 transition-all duration-200 border ${
        variant === 'peach'
          ? 'clay-card-peach'
          : 'clay-card'
      } ${
        onClick
          ? 'cursor-pointer hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/10'
          : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
        {icon && (
          <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 border border-orange-200/80 shadow-sm">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-bold font-mono text-slate-900 tracking-tight">
          {value}
        </span>
        {change && (
          <span
            className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend === 'up'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : trend === 'down'
                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            {trend === 'up' ? (
              <TrendingUp className="w-3 h-3 mr-1" />
            ) : trend === 'down' ? (
              <TrendingDown className="w-3 h-3 mr-1" />
            ) : (
              <Minus className="w-3 h-3 mr-1" />
            )}
            {change}
          </span>
        )}
      </div>

      {subtitle && <p className="text-xs text-slate-500 mt-1 font-medium">{subtitle}</p>}
    </div>
  );
};

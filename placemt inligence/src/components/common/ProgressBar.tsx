import React from 'react';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'cyan';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  showValue = true,
  size = 'md',
  variant = 'brand',
  className = '',
}) => {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  const sizeClasses = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  };

  const gradientClasses = {
    brand: 'bg-gradient-to-r from-orange-500 via-orange-400 to-amber-400',
    success: 'bg-gradient-to-r from-emerald-500 to-teal-400',
    warning: 'bg-gradient-to-r from-amber-500 to-orange-400',
    danger: 'bg-gradient-to-r from-rose-500 to-pink-500',
    cyan: 'bg-gradient-to-r from-cyan-500 to-blue-500',
  };

  return (
    <div className={`w-full ${className}`}>
      {(label || showValue) && (
        <div className="flex justify-between items-center text-xs mb-1.5">
          {label && <span className="text-slate-700 font-semibold">{label}</span>}
          {showValue && <span className="text-slate-600 font-mono font-bold">{percentage}%</span>}
        </div>
      )}
      <div className={`w-full bg-slate-100/90 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner ${sizeClasses[size]}`}>
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out shadow-sm ${gradientClasses[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

import React from 'react';
import { ShieldCheck, CheckCircle2, Clock } from 'lucide-react';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'cyan' | 'purple' | 'brand' | 'blue' | 'emerald';
  size?: 'sm' | 'md';
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  icon,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'text-[11px] px-2.5 py-0.5 gap-1 font-medium',
    md: 'text-xs px-3 py-1 gap-1.5 font-semibold',
  };

  const variantClasses = {
    neutral: 'bg-slate-100 text-slate-700 border border-slate-200/80 shadow-xs',
    primary: 'bg-orange-50 text-orange-700 border border-orange-200/90 shadow-xs',
    brand:   'bg-orange-50 text-orange-700 border border-orange-200/90 shadow-xs',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-xs',
    warning: 'bg-amber-50 text-amber-900 border border-amber-200/90 shadow-xs',
    danger:  'bg-rose-50 text-rose-800 border border-rose-200/90 shadow-xs',
    cyan:    'bg-sky-50 text-sky-800 border border-sky-200/90 shadow-xs',
    purple:  'bg-purple-50 text-purple-800 border border-purple-200/90 shadow-xs',
    blue:    'bg-blue-50 text-blue-700 border border-blue-200/90 shadow-xs',
    emerald: 'bg-emerald-50 text-emerald-800 border border-emerald-200/90 shadow-xs',
  };

  const dotClasses = {
    neutral: 'bg-slate-400',
    primary: 'bg-orange-500',
    brand:   'bg-orange-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger:  'bg-rose-500',
    cyan:    'bg-sky-500',
    purple:  'bg-purple-500',
    blue:    'bg-blue-600',
    emerald: 'bg-emerald-500',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full clay-badge transition-all ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotClasses[variant]}`} />}
      {icon && <span className="inline-flex shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};

export const SkillStatusBadge: React.FC<{
  status: 'extracted' | 'assessed' | 'verified';
  score?: number;
  className?: string;
}> = ({ status, score, className = '' }) => {
  if (status === 'verified') {
    return (
      <Badge variant="success" size="sm" icon={<ShieldCheck className="w-3 h-3 text-emerald-600" />} className={className}>
        Verified {score ? `(${score}%)` : ''}
      </Badge>
    );
  }
  if (status === 'assessed') {
    return (
      <Badge variant="primary" size="sm" icon={<CheckCircle2 className="w-3 h-3 text-blue-500" />} className={className}>
        Assessed {score ? `(${score}%)` : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" size="sm" icon={<Clock className="w-3 h-3 text-slate-400" />} className={className}>
      Extracted
    </Badge>
  );
};

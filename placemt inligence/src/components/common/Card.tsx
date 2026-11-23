import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'peach' | 'elevated' | 'subtle' | 'inset';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  interactive = false,
  padding = 'md',
  className = '',
  ...props
}) => {
  const variantClasses = {
    default: 'clay-card',
    peach: 'clay-card-peach',
    elevated: 'clay-card hover:shadow-xl hover:shadow-orange-500/10 border-orange-200/80',
    subtle: 'bg-white/80 backdrop-blur-md border border-orange-100 shadow-sm rounded-2xl',
    inset: 'clay-inset',
  };

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-3.5',
    md: 'p-5 sm:p-6',
    lg: 'p-5 sm:p-8',
  };

  const interactiveClass = interactive
    ? 'hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-500/10 cursor-pointer transition-all duration-200'
    : '';

  return (
    <div
      className={`rounded-2xl transition-all duration-200 ${variantClasses[variant]} ${paddingClasses[padding]} ${interactiveClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className = '' }) => (
  <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
    <div>
      <h3 className="text-base font-bold text-slate-800 tracking-tight">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

import React from 'react';

export interface ScoreRingProps {
  score: number; // 0 to 100
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  sublabel?: string;
  showTier?: boolean;
  className?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  size = 'md',
  label,
  sublabel,
  showTier = false,
  className = '',
}) => {
  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));

  const dimensions = {
    sm: { size: 68, stroke: 6, fontSize: 'text-base', labelSize: 'text-[10px]' },
    md: { size: 104, stroke: 8, fontSize: 'text-2xl', labelSize: 'text-xs' },
    lg: { size: 136, stroke: 10, fontSize: 'text-3xl', labelSize: 'text-xs' },
    xl: { size: 168, stroke: 12, fontSize: 'text-4xl', labelSize: 'text-sm' },
  };

  const { size: dim, stroke, fontSize, labelSize } = dimensions[size];
  const radius = (dim - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedScore / 100) * circumference;

  let color = '#f43f5e'; // rose (<60)
  let tierText = 'Needs Remediation';
  let tierBadgeClass = 'text-rose-700 bg-rose-50 border-rose-200';

  if (clampedScore >= 85) {
    color = '#f97316'; // peach-orange for Tier-1
    tierText = 'Tier-1 Ready';
    tierBadgeClass = 'text-orange-800 bg-orange-100 border-orange-300 shadow-xs font-bold';
  } else if (clampedScore >= 70) {
    color = '#0284c7'; // cyan-blue for Mid-tier
    tierText = 'Mid-Tier Ready';
    tierBadgeClass = 'text-sky-800 bg-sky-50 border-sky-200 font-semibold';
  } else if (clampedScore >= 55) {
    color = '#d97706'; // amber
    tierText = 'Foundation Track';
    tierBadgeClass = 'text-amber-800 bg-amber-50 border-amber-200';
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className="relative inline-flex items-center justify-center p-2 rounded-full clay-badge bg-white">
        <svg width={dim} height={dim} className="transform -rotate-90">
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke="#f1f5f9"
            strokeWidth={stroke}
            fill="transparent"
          />
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            fill="transparent"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className={`font-black font-mono text-slate-800 ${fontSize}`}>{clampedScore}</span>
          <span className="text-[10px] text-slate-400 -mt-1 font-mono">/ 100</span>
        </div>
      </div>

      {label && <p className={`font-bold text-slate-800 mt-2.5 ${labelSize}`}>{label}</p>}
      {sublabel && <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>}

      {showTier && (
        <span
          className={`inline-block mt-2 px-3 py-1 text-[11px] rounded-full border clay-badge ${tierBadgeClass}`}
        >
          {tierText}
        </span>
      )}
    </div>
  );
};

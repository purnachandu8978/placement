import React from 'react';

export interface ClayLoaderProps {
  label?: string;
  subtext?: string;
  size?: 'sm' | 'md' | 'lg';
  fullScreen?: boolean;
}

export const ClayLoader: React.FC<ClayLoaderProps> = ({
  label = 'AI Intelligence Processing...',
  subtext = 'Analyzing parameters, scoring vectors, and synchronizing workspace',
  size = 'md',
  fullScreen = false,
}) => {
  const sizeMap = {
    sm: { box: 'w-10 h-10', ring: 'w-8 h-8', orb: 'w-3 h-3' },
    md: { box: 'w-20 h-20', ring: 'w-16 h-16', orb: 'w-6 h-6' },
    lg: { box: 'w-32 h-32', ring: 'w-24 h-24', orb: 'w-10 h-10' },
  };

  const content = (
    <div className="flex flex-col items-center justify-center p-6 text-center select-none">
      {/* 3D Clay Tactile Multi-ring Floating Container */}
      <div className={`relative ${sizeMap[size].box} flex items-center justify-center mb-4`}>
        {/* Soft Peach Clay Outer Glow Ring */}
        <div
          className="absolute inset-0 rounded-full animate-ping opacity-25 bg-orange-300"
          style={{ animationDuration: '2.4s' }}
        />

        {/* Counter-rotating Tactile Peach Ring */}
        <div
          className={`absolute ${sizeMap[size].ring} rounded-full border-4 border-dashed border-orange-400/80 animate-spin`}
          style={{ animationDuration: '6s' }}
        />

        {/* Secondary Inner Cyan Ring */}
        <div
          className={`absolute ${sizeMap[size].ring} rounded-full border-2 border-t-orange-500 border-r-transparent border-b-amber-400 border-l-transparent animate-spin`}
          style={{ animationDuration: '2.5s', animationDirection: 'reverse' }}
        />

        {/* Central Tactile Clay Floating Core */}
        <div className="relative z-10 p-3 rounded-2xl bg-gradient-to-tr from-orange-500 via-orange-400 to-amber-300 text-white shadow-lg shadow-orange-500/30 flex items-center justify-center animate-bounce"
             style={{ animationDuration: '2s' }}>
          <svg className={`${sizeMap[size].orb} animate-pulse`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
          </svg>
        </div>
      </div>

      {/* Tactile Status Pills */}
      <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-orange-200/80 shadow-sm shadow-orange-500/5 mb-1.5">
        <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
        <span className="text-xs font-bold text-slate-800 tracking-tight">{label}</span>
      </div>

      {subtext && (
        <p className="text-[11px] text-slate-500 max-w-xs font-medium leading-relaxed">
          {subtext}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-md">
        <div className="clay-card-peach p-8 max-w-sm w-full mx-4 border border-orange-200 shadow-2xl">
          {content}
        </div>
      </div>
    );
  }

  return content;
};


import React from 'react';

export interface IsometricTreeProps {
  x: number;
  y: number;
  scale?: number;
  variant?: 'pine' | 'oak' | 'hedge' | 'lamp';
  color?: string;
}

export const IsometricTree: React.FC<IsometricTreeProps> = ({
  x,
  y,
  scale = 1,
  variant = 'oak',
  color = '#22A06B',
}) => {
  return (
    <g transform={`translate(${x}, ${y}) scale(${scale})`}>
      {/* Ground Shadow */}
      <ellipse cx="0" cy="2" rx="10" ry="5" fill="rgba(15, 23, 42, 0.1)" />

      {variant === 'pine' && (
        <g>
          {/* Trunk */}
          <line x1="0" y1="2" x2="0" y2="-12" stroke="#854D0E" strokeWidth="2.5" strokeLinecap="round" />
          {/* Tier 1 */}
          <polygon points="0,-32 -14,-14 14,-14" fill={color} />
          {/* Tier 2 */}
          <polygon points="0,-24 -11,-8 11,-8" fill="#16A34A" opacity="0.9" />
          {/* Highlight Edge */}
          <line x1="0" y1="-32" x2="0" y2="-8" stroke="#86EFAC" strokeWidth="0.75" opacity="0.8" />
        </g>
      )}

      {variant === 'oak' && (
        <g>
          {/* Trunk */}
          <line x1="0" y1="2" x2="0" y2="-10" stroke="#713F12" strokeWidth="3" strokeLinecap="round" />
          {/* Canopy Spheres */}
          <circle cx="-5" cy="-18" r="9" fill={color} />
          <circle cx="5" cy="-20" r="10" fill="#16A34A" />
          <circle cx="0" cy="-26" r="11" fill="#4ADE80" opacity="0.95" />
          {/* Sunlit Crest */}
          <ellipse cx="2" cy="-29" rx="6" ry="3.5" fill="#BBF7D0" opacity="0.8" />
        </g>
      )}

      {variant === 'hedge' && (
        <g>
          {/* Low planter box */}
          <polygon points="0,0 12,-6 0,-12 -12,-6" fill="#475569" />
          <polygon points="-12,-6 0,0 0,4 -12,-2" fill="#334155" />
          <polygon points="12,-6 0,0 0,4 12,-2" fill="#1E293B" />
          {/* Shrub foliage */}
          <ellipse cx="0" cy="-8" rx="10" ry="7" fill={color} />
          <ellipse cx="0" cy="-10" rx="8" ry="5" fill="#4ADE80" opacity="0.8" />
        </g>
      )}

      {variant === 'lamp' && (
        <g>
          <line x1="0" y1="1" x2="0" y2="-22" stroke="#475569" strokeWidth="1.5" />
          <circle cx="0" cy="-22" r="3.5" fill="#FDE047" />
          <circle cx="0" cy="-22" r="7" fill="#FEF08A" opacity="0.3" className="animate-pulse" />
        </g>
      )}
    </g>
  );
};

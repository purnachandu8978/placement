import React from 'react';

export interface IsometricBuildingProps {
  x: number;
  y: number;
  width?: number;
  depth?: number;
  height?: number;
  roofColor?: string;
  leftColor?: string;
  rightColor?: string;
  accentColor?: string;
  title: string;
  subtitle: string;
  zoneTag?: string;
  badgeText?: string;
  icon?: React.ReactNode;
  isActive?: boolean;
  onHover?: (active: boolean) => void;
  onClick?: () => void;
  floors?: number;
  roofType?: 'flat' | 'antenna' | 'dome' | 'solar' | 'radar';
}

export const IsometricBuilding: React.FC<IsometricBuildingProps> = ({
  x,
  y,
  width = 90,
  depth = 80,
  height = 95,
  roofColor = '#FFFFFF',
  leftColor = '#E2E8F0',
  rightColor = '#CBD5E1',
  accentColor = '#F97316',
  title,
  subtitle,
  zoneTag,
  badgeText,
  icon,
  isActive = false,
  onHover,
  onClick,
  floors = 3,
  roofType = 'flat',
}) => {
  // Isometric projection vectors:
  // dx = cos(30°) ~ 0.866, dy = sin(30°) ~ 0.5
  const isoCos = 0.866;
  const isoSin = 0.5;

  const wx = width * isoCos;
  const wy = width * isoSin;
  const dx = depth * isoCos;
  const dy = depth * isoSin;

  // Ground coordinates
  const pBottom = { x, y };
  const pRight = { x: x + wx, y: y - wy };
  const pLeft = { x: x - dx, y: y - dy };
  const pBack = { x: x + wx - dx, y: y - wy - dy };

  // Top roof coordinates (lifted by height)
  const tBottom = { x: pBottom.x, y: pBottom.y - height };
  const tRight = { x: pRight.x, y: pRight.y - height };
  const tLeft = { x: pLeft.x, y: pLeft.y - height };
  const tBack = { x: pBack.x, y: pBack.y - height };

  return (
    <g
      className="cursor-pointer transition-transform duration-300 group"
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${title}: ${subtitle}`}
    >
      {/* Soft Ground Shadow */}
      <polygon
        points={`
          ${pBottom.x},${pBottom.y + 10}
          ${pRight.x + 15},${pRight.y + 8}
          ${pBack.x + 25},${pBack.y + 5}
          ${pLeft.x - 10},${pLeft.y + 7}
        `}
        fill="rgba(15, 23, 42, 0.12)"
        filter="blur(6px)"
      />

      {/* Building Base Pedestal */}
      <polygon
        points={`
          ${pBottom.x},${pBottom.y + 4}
          ${pRight.x},${pRight.y + 4}
          ${pRight.x},${pRight.y}
          ${pBottom.x},${pBottom.y}
        `}
        fill="#94A3B8"
      />
      <polygon
        points={`
          ${pBottom.x},${pBottom.y + 4}
          ${pLeft.x},${pLeft.y + 4}
          ${pLeft.x},${pLeft.y}
          ${pBottom.x},${pBottom.y}
        `}
        fill="#64748B"
      />

      {/* Left Wall (in shadow) */}
      <polygon
        points={`
          ${pBottom.x},${pBottom.y}
          ${tBottom.x},${tBottom.y}
          ${tLeft.x},${tLeft.y}
          ${pLeft.x},${pLeft.y}
        `}
        fill={isActive ? '#E2E8F0' : leftColor}
        stroke="#CBD5E1"
        strokeWidth="0.75"
        className="transition-colors duration-200"
      />

      {/* Left Wall Windows & Louvers */}
      {Array.from({ length: floors }).map((_, i) => {
        const floorFraction = (i + 1) / (floors + 1);
        const yOffset = height * floorFraction;
        const wTopY = pBottom.y - yOffset;
        const wLeftY = pLeft.y - yOffset;

        return (
          <g key={`l-win-${i}`} opacity="0.85">
            <line
              x1={pBottom.x - dx * 0.25}
              y1={wTopY - dy * 0.25}
              x2={pBottom.x - dx * 0.75}
              y2={wLeftY + dy * 0.25}
              stroke={isActive ? accentColor : '#94A3B8'}
              strokeWidth="2.5"
              strokeDasharray="4 3"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* Right Wall (illuminated) */}
      <polygon
        points={`
          ${pBottom.x},${pBottom.y}
          ${tBottom.x},${tBottom.y}
          ${tRight.x},${tRight.y}
          ${pRight.x},${pRight.y}
        `}
        fill={isActive ? '#FFFFFF' : rightColor}
        stroke="#E2E8F0"
        strokeWidth="0.75"
        className="transition-colors duration-200"
      />

      {/* Right Wall Windows (Illuminated Glass Panels) */}
      {Array.from({ length: floors }).map((_, i) => {
        const floorFraction = (i + 1) / (floors + 1);
        const yOffset = height * floorFraction;
        const wTopY = pBottom.y - yOffset;
        const wRightY = pRight.y - yOffset;

        return (
          <g key={`r-win-${i}`}>
            <line
              x1={pBottom.x + wx * 0.2}
              y1={wTopY - wy * 0.2}
              x2={pBottom.x + wx * 0.8}
              y2={wRightY + wy * 0.2}
              stroke={isActive ? accentColor : '#60A5FA'}
              strokeWidth="3.2"
              strokeDasharray="5 3"
              strokeLinecap="round"
              opacity={isActive ? 0.95 : 0.7}
            />
          </g>
        );
      })}

      {/* Architectural Corner Accent Edge */}
      <line
        x1={pBottom.x}
        y1={pBottom.y}
        x2={tBottom.x}
        y2={tBottom.y}
        stroke={isActive ? accentColor : '#FFFFFF'}
        strokeWidth={isActive ? '2' : '1.2'}
        strokeLinecap="round"
      />

      {/* Roof Surface */}
      <polygon
        points={`
          ${tBottom.x},${tBottom.y}
          ${tRight.x},${tRight.y}
          ${tBack.x},${tBack.y}
          ${tLeft.x},${tLeft.y}
        `}
        fill={isActive ? '#FFF7ED' : roofColor}
        stroke={isActive ? accentColor : '#E2E8F0'}
        strokeWidth={isActive ? '1.5' : '1'}
        className="transition-colors duration-200"
      />

      {/* Roof Parapet Rim */}
      <polygon
        points={`
          ${tBottom.x},${tBottom.y - 2}
          ${tRight.x},${tRight.y - 2}
          ${tBack.x},${tBack.y - 2}
          ${tLeft.x},${tLeft.y - 2}
        `}
        fill="none"
        stroke={accentColor}
        strokeWidth="0.8"
        strokeDasharray="3 3"
        opacity={isActive ? 0.8 : 0.35}
      />

      {/* Roof Accessories by roofType */}
      {roofType === 'antenna' && (
        <g>
          <line
            x1={tBack.x + (tBottom.x - tBack.x) * 0.5}
            y1={tBack.y + (tBottom.y - tBack.y) * 0.5}
            x2={tBack.x + (tBottom.x - tBack.x) * 0.5}
            y2={tBack.y + (tBottom.y - tBack.y) * 0.5 - 28}
            stroke="#EA580C"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle
            cx={tBack.x + (tBottom.x - tBack.x) * 0.5}
            cy={tBack.y + (tBottom.y - tBack.y) * 0.5 - 28}
            r="3.5"
            fill="#F97316"
          />
          <circle
            cx={tBack.x + (tBottom.x - tBack.x) * 0.5}
            cy={tBack.y + (tBottom.y - tBack.y) * 0.5 - 28}
            r="7"
            fill="none"
            stroke="#F97316"
            strokeWidth="1"
            opacity="0.4"
            className="animate-ping"
          />
        </g>
      )}

      {roofType === 'dome' && (
        <ellipse
          cx={tBack.x + (tBottom.x - tBack.x) * 0.5}
          cy={tBack.y + (tBottom.y - tBack.y) * 0.5 - 8}
          rx="18"
          ry="11"
          fill="url(#domeGrad)"
          stroke="#38BDF8"
          strokeWidth="1"
          opacity="0.9"
        />
      )}

      {roofType === 'solar' && (
        <polygon
          points={`
            ${tBottom.x - 10},${tBottom.y - 4}
            ${tRight.x - 15},${tRight.y - 2}
            ${tBack.x + 8},${tBack.y - 6}
            ${tLeft.x + 12},${tLeft.y - 8}
          `}
          fill="#1E293B"
          stroke="#38BDF8"
          strokeWidth="1"
        />
      )}

      {roofType === 'radar' && (
        <g transform={`translate(${tBack.x + (tBottom.x - tBack.x) * 0.5}, ${tBack.y + (tBottom.y - tBack.y) * 0.5 - 14})`}>
          <ellipse cx="0" cy="0" rx="10" ry="5" fill="#3B82F6" stroke="#FFFFFF" strokeWidth="1" />
          <line x1="0" y1="0" x2="6" y2="-8" stroke="#1D4ED8" strokeWidth="1.5" />
          <circle cx="6" cy="-8" r="2" fill="#22C55E" />
        </g>
      )}

      {/* Floating Zone Pill Badge Above Roof */}
      <g
        transform={`translate(${tBack.x + (tBottom.x - tBack.x) * 0.5}, ${tBottom.y - (roofType === 'antenna' ? 44 : 26)})`}
        className="transition-all duration-300"
      >
        <rect
          x="-52"
          y="-13"
          width="104"
          height="24"
          rx="12"
          fill={isActive ? '#0F172A' : 'rgba(255, 255, 255, 0.94)'}
          stroke={isActive ? accentColor : '#E2E8F0'}
          strokeWidth={isActive ? '1.5' : '1'}
          filter="drop-shadow(0 4px 8px rgba(15, 23, 42, 0.08))"
        />
        <circle cx="-38" cy="-1" r="4" fill={accentColor} />
        <text
          x="-28"
          y="3"
          fill={isActive ? '#FFFFFF' : '#1E293B'}
          fontSize="9.5"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="bold"
          letterSpacing="0.2px"
        >
          {zoneTag || title}
        </text>
      </g>
    </g>
  );
};

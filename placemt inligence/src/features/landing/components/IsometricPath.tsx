import React from 'react';

export interface IsometricPathProps {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width?: number;
  variant?: 'road' | 'bridge' | 'dataPulse' | 'plaza';
  color?: string;
}

export const IsometricPath: React.FC<IsometricPathProps> = ({
  startX,
  startY,
  endX,
  endY,
  width = 16,
  variant = 'road',
  color = '#E2E8F0',
}) => {
  // Vector calculations for roadway offset
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = (-dy / length) * (width / 2);
  const ny = (dx / length) * (width / 2);

  const p1 = { x: startX + nx, y: startY + ny };
  const p2 = { x: endX + nx, y: endY + ny };
  const p3 = { x: endX - nx, y: endY - ny };
  const p4 = { x: startX - nx, y: startY - ny };

  return (
    <g>
      {/* Ground Road Ribbon */}
      <polygon
        points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
        fill={variant === 'bridge' ? '#CBD5E1' : color}
        stroke="#CBD5E1"
        strokeWidth="0.5"
      />

      {/* Road Curbs */}
      <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#94A3B8" strokeWidth="0.8" />
      <line x1={p4.x} y1={p4.y} x2={p3.x} y2={p3.y} stroke="#94A3B8" strokeWidth="0.8" />

      {/* Road Centre Dashes */}
      <line
        x1={startX}
        y1={startY}
        x2={endX}
        y2={endY}
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeDasharray="6 6"
        opacity="0.9"
      />

      {/* Animated Glowing Data Pulse */}
      {(variant === 'dataPulse' || variant === 'bridge') && (
        <line
          x1={startX}
          y1={startY}
          x2={endX}
          y2={endY}
          stroke="#F97316"
          strokeWidth="2.5"
          strokeDasharray="8 20"
          className="animate-pathway"
          opacity="0.8"
        />
      )}
    </g>
  );
};

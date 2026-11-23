import React from 'react';
import { EVALUATION_CRITERIA } from '../lib/labels.ts';
import type { EvaluationScores } from '../types/wab.ts';

export const CategoryBarChart: React.FC<{
  data: { label: string; value: number; accent?: boolean }[];
  unit?: string;
}> = ({ data, unit = '' }) => {
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-3">
      {data.map((item) => {
        const pct = Math.round((item.value / maxVal) * 100);
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#111827]">{item.label}</span>
              <span className="font-mono-num font-semibold text-gray-600">
                {new Intl.NumberFormat('ar-DZ').format(item.value)} {unit}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${item.accent ? 'bg-[#14532D]' : 'bg-[#16A34A]'}`}
                style={{ width: `${Math.max(4, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const MonthlyTrendChart: React.FC<{
  series: { label: string; primary: number; secondary?: number }[];
  primaryLabel: string;
  secondaryLabel?: string;
}> = ({ series, primaryLabel, secondaryLabel }) => {
  const maxVal = Math.max(100, ...series.map((s) => Math.max(s.primary, s.secondary || 0)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-5 text-xs text-gray-700 font-semibold">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-[#14532D]" />
          {primaryLabel}
        </span>
        {secondaryLabel && (
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-[#16A34A]" />
            {secondaryLabel}
          </span>
        )}
      </div>
      <div className="grid grid-cols-6 gap-2 sm:gap-4 items-end h-44 pt-4 border-b border-gray-200">
        {series.map((item) => {
          const h1 = Math.max(6, Math.round((item.primary / maxVal) * 130));
          const h2 = item.secondary !== undefined ? Math.max(4, Math.round((item.secondary / maxVal) * 130)) : 0;
          return (
            <div key={item.label} className="flex flex-col items-center justify-end gap-2 h-full">
              <div className="flex items-end gap-1 h-36">
                <div
                  className="w-3.5 sm:w-5 rounded-t bg-[#14532D] transition-all duration-300"
                  style={{ height: `${h1}px` }}
                  title={`${primaryLabel}: ${item.primary}`}
                />
                {secondaryLabel && (
                  <div
                    className="w-3.5 sm:w-5 rounded-t bg-[#16A34A] transition-all duration-300"
                    style={{ height: `${h2}px` }}
                    title={`${secondaryLabel}: ${item.secondary}`}
                  />
                )}
              </div>
              <span className="text-[11px] font-mono-num text-gray-500 whitespace-nowrap">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const EvaluationRadarChart: React.FC<{ scores: EvaluationScores }> = ({ scores }) => {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 92;
  const total = EVALUATION_CRITERIA.length;

  const getPoint = (idx: number, val: number) => {
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const r = (val / 10) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  };

  const polygonPoints = EVALUATION_CRITERIA.map((c, i) => getPoint(i, scores[c.key]).join(',')).join(' ');

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[290px]">
        {[2, 4, 6, 8, 10].map((ring) => {
          const pts = EVALUATION_CRITERIA.map((_, i) => getPoint(i, ring).join(',')).join(' ');
          return (
            <polygon
              key={ring}
              points={pts}
              fill="none"
              stroke="rgba(17, 24, 39, 0.12)"
              strokeWidth="1"
            />
          );
        })}
        {EVALUATION_CRITERIA.map((c, i) => {
          const [x, y] = getPoint(i, 10);
          const [lx, ly] = getPoint(i, 12.1);
          return (
            <g key={c.key}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(17, 24, 39, 0.12)" strokeWidth="1" />
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#111827"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="Cairo, sans-serif"
              >
                {c.label}
              </text>
            </g>
          );
        })}
        <polygon
          points={polygonPoints}
          fill="rgba(20, 83, 45, 0.22)"
          stroke="#14532D"
          strokeWidth="2.5"
        />
        {EVALUATION_CRITERIA.map((c, i) => {
          const [x, y] = getPoint(i, scores[c.key]);
          return <circle key={c.key} cx={x} cy={y} r="3.5" fill="#ffffff" stroke="#14532D" strokeWidth="2" />;
        })}
      </svg>
    </div>
  );
};

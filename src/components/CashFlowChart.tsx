import React, { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ForecastDay } from '../models/schemas.ts';
import { formatINR, formatINRCompactShort } from '../utils/format.ts';

interface CashFlowChartProps {
  unmitigatedForecast: ForecastDay[];
  optimizedForecast?: ForecastDay[];
  minimumReserve: number;
  showOptimized?: boolean;
  height?: number;
}

interface ChartPoint {
  date: string;
  label: string;
  unmitigatedCash: number;
  optimizedCash?: number;
  inflows: number;
  outflows: number;
  minimumReserve: number;
  shortfallAmount: number;
}

export const CashFlowChart: React.FC<CashFlowChartProps> = ({
  unmitigatedForecast,
  optimizedForecast,
  minimumReserve,
  showOptimized = false,
  height = 320,
}) => {
  const data = useMemo<ChartPoint[]>(() => {
    return unmitigatedForecast.map((day, idx) => ({
      date: day.date,
      label: day.label,
      unmitigatedCash: day.closingCash,
      optimizedCash: optimizedForecast?.[idx]?.closingCash,
      inflows: day.inflows,
      outflows: day.outflows,
      minimumReserve,
      shortfallAmount: day.shortfallAmount,
    }));
  }, [unmitigatedForecast, optimizedForecast, minimumReserve]);

  const minDomain = useMemo(() => {
    const vals = data.flatMap((d) => [
      d.unmitigatedCash,
      d.optimizedCash ?? d.unmitigatedCash,
      0,
    ]);
    const min = Math.min(...vals);
    return Math.floor(min / 50000) * 50000 - 50000;
  }, [data]);

  const shortfallSpan = useMemo(() => {
    const breached = data.filter((d) => d.unmitigatedCash < minimumReserve);
    if (breached.length === 0) return null;
    return {
      start: breached[0].label,
      end: breached[breached.length - 1].label,
    };
  }, [data, minimumReserve]);

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
          <defs>
            <linearGradient id="unmitigatedGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
            minTickGap={18}
          />
          <YAxis
            domain={[minDomain, 'auto']}
            tickFormatter={(v) => formatINRCompactShort(Number(v))}
            tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'JetBrains Mono' }}
            axisLine={false}
            tickLine={false}
            width={62}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const p = payload[0].payload as ChartPoint;
              return (
                <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-3 text-xs space-y-1.5 min-w-[210px]">
                  <div className="font-display font-semibold text-slate-900 border-b border-slate-100 pb-1">
                    {p.label} ({p.date})
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-600">Unmitigated cash</span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        p.unmitigatedCash < p.minimumReserve ? 'text-red-700' : 'text-slate-900'
                      }`}
                    >
                      {formatINR(p.unmitigatedCash)}
                    </span>
                  </div>
                  {showOptimized && p.optimizedCash !== undefined && (
                    <div className="flex justify-between gap-4">
                      <span className="text-emerald-700 font-medium">After plan</span>
                      <span className="font-mono font-semibold tabular-nums text-emerald-700">
                        {formatINR(p.optimizedCash)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 text-slate-500 pt-1 border-t border-slate-100">
                    <span>Inflows / Outflows</span>
                    <span className="font-mono tabular-nums">
                      +{formatINRCompactShort(p.inflows)} / -{formatINRCompactShort(p.outflows)}
                    </span>
                  </div>
                  {p.shortfallAmount > 0 && (
                    <div className="flex justify-between gap-4 text-red-700 font-medium">
                      <span>Reserve shortfall</span>
                      <span className="font-mono tabular-nums">-{formatINR(p.shortfallAmount)}</span>
                    </div>
                  )}
                </div>
              );
            }}
          />

          {shortfallSpan && (
            <ReferenceArea
              x1={shortfallSpan.start}
              x2={shortfallSpan.end}
              y1={minDomain}
              y2={minimumReserve}
              fill="#fef2f2"
              fillOpacity={0.65}
            />
          )}

          <ReferenceLine
            y={minimumReserve}
            stroke="#b45309"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{
              value: `Reserve ${formatINRCompactShort(minimumReserve)}`,
              position: 'insideTopRight',
              fill: '#b45309',
              fontSize: 11,
              fontFamily: 'JetBrains Mono',
            }}
          />

          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} />

          <Area
            type="monotone"
            dataKey="unmitigatedCash"
            stroke={showOptimized ? '#94a3b8' : '#b91c1c'}
            strokeWidth={showOptimized ? 1.75 : 2.25}
            strokeDasharray={showOptimized ? '4 4' : undefined}
            fill={showOptimized ? 'transparent' : 'url(#unmitigatedGrad)'}
            name="Projected cash (no action)"
            dot={false}
          />

          {showOptimized && (
            <Line
              type="monotone"
              dataKey="optimizedCash"
              stroke="#15803d"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#15803d' }}
              name="Projected cash (optimized plan)"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

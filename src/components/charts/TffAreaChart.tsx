'use client';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, ReferenceLine,
} from 'recharts';
import { ChartTooltip } from '../../lib/chartTheme';

/**
 * TFF area chart. Pulled into its own client component so the analytics
 * route can `next/dynamic({ ssr: false })` it — keeps the recharts bundle
 * (~80 KB gz) out of the main dashboard chunk for users who never open
 * /analytics.
 *
 * Styling is intentionally rich: a deep→transparent gradient fill, a soft
 * glow on the stroke, a hover dot, and a dashed period-average reference
 * line so the trend reads at a glance. All colours are theme vars so it
 * flips cleanly between light and dark.
 */
export interface TffPoint {
  label: string;
  tff: number;
  [key: string]: unknown;
}

export default function TffAreaChart({ trends }: { trends: TffPoint[] }) {
  // Css var palette must resolve at runtime; the vars are defined for both
  // themes in globals.css so the chart is legible either way.
  const green  = 'var(--green)';
  const grayd  = 'var(--text-dim)';
  const border = 'var(--border)';

  const avg = trends.length
    ? Math.round(trends.reduce((s, d) => s + (d.tff || 0), 0) / trends.length)
    : 0;

  return (
    <div style={{ height: 240, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trends} margin={{ top: 12, right: 40, left: 0, bottom: 6 }}>
          <defs>
            <linearGradient id="colTff" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={green} stopOpacity={0.45} />
              <stop offset="70%"  stopColor={green} stopOpacity={0.08} />
              <stop offset="100%" stopColor={green} stopOpacity={0} />
            </linearGradient>
            <filter id="tffGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <CartesianGrid strokeDasharray="4 4" stroke={border} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: grayd, fontSize: 10 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: grayd, fontSize: 10 }} width={34} />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke={grayd}
              strokeDasharray="5 5"
              strokeOpacity={0.55}
              label={{ value: `avg ${avg}`, position: 'right', fill: grayd, fontSize: 10 }}
            />
          )}
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: green, strokeOpacity: 0.25, strokeWidth: 1 }}
          />
          <Area
            type="monotone"
            dataKey="tff"
            name="TFF"
            stroke={green}
            strokeWidth={2.5}
            fill="url(#colTff)"
            fillOpacity={1}
            style={{ filter: 'url(#tffGlow)' }}
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--s1)', fill: green }}
            isAnimationActive
            animationDuration={850}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

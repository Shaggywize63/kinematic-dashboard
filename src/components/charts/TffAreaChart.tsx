'use client';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import { GLASS_TOOLTIP } from '../../lib/chartTheme';

/**
 * TFF area chart. Pulled into its own client component so the analytics
 * route can `next/dynamic({ ssr: false })` it — keeps the recharts bundle
 * (~80 KB gz) out of the main dashboard chunk for users who never open
 * /analytics.
 */
export interface TffPoint {
  label: string;
  tff: number;
  [key: string]: unknown;
}

export default function TffAreaChart({ trends }: { trends: TffPoint[] }) {
  // Css var palette must resolve at runtime; literal '#...' fallbacks keep
  // the chart legible if the var isn't loaded yet.
  const green   = 'var(--green)';
  const grayd   = 'var(--text-dim)';
  const border  = 'var(--border)';

  return (
    <div style={{ height: 240, width: '100%' }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trends}>
          <defs>
            <linearGradient id="colTff" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={green} stopOpacity={0.3} />
              <stop offset="95%" stopColor={green} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={border} vertical={false} />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: grayd, fontSize: 10 }} dy={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: grayd, fontSize: 10 }} />
          <Tooltip
            contentStyle={{ ...GLASS_TOOLTIP, fontSize: 12 }}
            itemStyle={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}
          />
          <Area type="monotone" dataKey="tff" stroke={green} fillOpacity={1} fill="url(#colTff)" strokeWidth={2} name="TFF" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

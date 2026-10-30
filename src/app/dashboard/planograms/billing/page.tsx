'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import planogramApi from '../../../../lib/planogramApi';
import {
  PC,
  SectionCard,
  StateBlock,
  useIsCompact,
} from '../_components/planogramUi';
import type { BillingSummary } from '../../../../types/planogram';

const PERIODS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

type Currency = 'USD' | 'OMR';

export default function PlanogramBillingPage() {
  const isCompact = useIsCompact();
  const [days, setDays] = useState(30);
  const [currency, setCurrency] = useState<Currency>('USD');
  const [data, setData] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: now.toISOString() };
  }, [days]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planogramApi.billing(range.from, range.to);
      setData(res.data);
      setError('');
    } catch (e) {
      setError((e as Error)?.message || 'Failed to load billing');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // USD→selected-currency conversion. OMR rate comes from the server so both
  // sides agree; USD is identity.
  const rate = currency === 'OMR' ? (data?.usd_to_omr ?? 0.38449) : 1;
  const sym = currency === 'OMR' ? 'OMR ' : '$';
  const dp = currency === 'OMR' ? 3 : 2;
  const money = (usd: number): string => `${sym}${(usd * rate).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
  const num = (n: number): string => n.toLocaleString('en-US');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: PC.text, margin: 0 }}>API Billing</h1>
          <div style={{ fontSize: 13, color: PC.muted, marginTop: 2 }}>Planogram vision API cost per client</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={selectStyle}
            aria-label="Period"
          >
            {PERIODS.map((p) => <option key={p.days} value={p.days}>{p.label}</option>)}
          </select>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
            style={selectStyle}
            aria-label="Currency"
          >
            <option value="USD">USD ($)</option>
            <option value="OMR">OMR</option>
          </select>
        </div>
      </div>

      {loading ? (
        <StateBlock>Loading billing…</StateBlock>
      ) : error ? (
        <StateBlock>{error}</StateBlock>
      ) : !data ? (
        <StateBlock>No billing data.</StateBlock>
      ) : (
        <>
          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
            <Stat label="Total cost" value={money(data.total_cost_usd)} accent />
            <Stat label="Captures analysed" value={num(data.total_captures)} />
            <Stat label="API calls" value={num(data.total_calls)} />
          </div>
          {currency === 'OMR' && (
            <div style={{ fontSize: 11, color: PC.muted }}>Converted at 1 USD = {data.usd_to_omr} OMR.</div>
          )}

          {/* Per-client */}
          <SectionCard title="Cost by client" caption="Planogram vision API spend per client over the period — highest first">
            {data.clients.length === 0 ? (
              <StateBlock>No API usage in this period.</StateBlock>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Row header isCompact={isCompact} cells={['Client', 'Captures', 'Input tok', 'Output tok', 'Cost']} />
                {data.clients.map((c) => (
                  <Row
                    key={c.client_id ?? 'none'}
                    isCompact={isCompact}
                    cells={[
                      c.client_name || (c.client_id ? `${c.client_id.slice(0, 8)}…` : 'Unattributed'),
                      num(c.captures),
                      num(c.input_tokens + c.cache_read_tokens + c.cache_write_tokens),
                      num(c.output_tokens),
                      money(c.cost_usd),
                    ]}
                    lastCol
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {/* Daily total */}
          {data.daily.length > 0 && (
            <SectionCard title="Daily cost" caption="Total vision API spend per day">
              <DailyBars daily={data.daily} money={money} />
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

const selectStyle: CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: `1px solid ${PC.border}`,
  background: PC.surface,
  color: PC.text,
  fontSize: 13,
};

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ border: `1px solid ${PC.border}`, borderRadius: 12, padding: 16, background: PC.surface }}>
      <div style={{ fontSize: 12, color: PC.muted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: accent ? PC.good : PC.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
}

function Row({ cells, header, isCompact, lastCol }: { cells: string[]; header?: boolean; isCompact: boolean; lastCol?: boolean }) {
  const cols = isCompact ? 'minmax(0,1.4fr) auto auto' : 'minmax(0,1.6fr) auto auto auto auto';
  const shown = isCompact ? [cells[0], cells[1], cells[cells.length - 1]] : cells;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center',
      padding: '10px 2px', borderBottom: `1px solid ${PC.border}`,
      fontSize: 13, color: header ? PC.muted : PC.text, fontWeight: header ? 600 : 400,
    }}>
      {shown.map((c, i) => (
        <span key={i} style={{
          textAlign: i === 0 ? 'left' : 'right',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: !header && lastCol && i === shown.length - 1 ? 700 : undefined,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{c}</span>
      ))}
    </div>
  );
}

function DailyBars({ daily, money }: { daily: BillingSummary['daily']; money: (usd: number) => string }) {
  const max = Math.max(...daily.map((d) => d.cost_usd), 0.0001);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {daily.map((d) => (
        <div key={d.date} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: PC.muted, fontVariantNumeric: 'tabular-nums' }}>{d.date}</span>
          <div style={{ height: 8, borderRadius: 4, background: PC.surface3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(2, (d.cost_usd / max) * 100)}%`, height: '100%', background: PC.good }} />
          </div>
          <span style={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: PC.text }}>{money(d.cost_usd)}</span>
        </div>
      ))}
    </div>
  );
}

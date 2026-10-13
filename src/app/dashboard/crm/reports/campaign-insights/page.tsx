'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { CampaignBlock, CampaignInsightsPayload } from '../../../../../types/crm';
import { useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';

/**
 * Campaign Insights — per-campaign (General Calls / App & DigiGold /
 * After-Sales) roll-up of the telecaller's leads and logged calls. Surfaces the
 * campaign-specific KPIs the Excel trackers used to total by hand: DigiGold /
 * gold-scheme enrolment, app ratings, after-sales satisfaction, complaints by
 * priority, next-purchase interest and referral potential. Owner-scoped to the
 * telecaller(s); Rajkamal-gated via the reports index (telecallerOnly).
 */

const CAMPAIGN_ACCENT: Record<string, string> = {
  'General Calls': '#3E9EFF',
  'App & DigiGold': '#A855F7',
  'After-Sales': '#10B981',
};

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(today) };
}

export default function CampaignInsightsPage() {
  const [range, setRange] = useState(defaultRange);
  const [campaigns, setCampaigns] = useState<CampaignBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const cityKey = useReportCityKey();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.campaignInsights(range)
      .then((r) => {
        if (cancelled) return;
        // Endpoint returns the payload directly (no { success, data } envelope);
        // tolerate both shapes.
        const p = r as unknown as CampaignInsightsPayload & { data?: CampaignInsightsPayload };
        setCampaigns(p.campaigns ?? p.data?.campaigns ?? []);
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load campaign insights'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range.from, range.to, cityKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Campaign Insights</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
            DigiGold enrolment, app ratings and after-sales satisfaction per calling campaign.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <DateInput label="From" value={range.from} onChange={(v) => setRange({ ...range, from: v })} />
          <DateInput label="To"   value={range.to}   onChange={(v) => setRange({ ...range, to: v })} />
        </div>
      </div>

      {loading && campaigns.length === 0 && (
        <div style={{ color: 'var(--text-dim)', padding: 24, textAlign: 'center' }}>Loading…</div>
      )}
      {!loading && campaigns.every((c) => c.calls === 0 && c.leads === 0) && (
        <div style={{ color: 'var(--text-dim)', padding: 24, textAlign: 'center' }}>No campaign activity for the selected window.</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {campaigns.map((c) => <CampaignCard key={c.campaign} c={c} />)}
      </div>
    </div>
  );
}

function CampaignCard({ c }: { c: CampaignBlock }) {
  const accent = CAMPAIGN_ACCENT[c.campaign] ?? 'var(--primary)';
  const connectPct = `${(c.connect_rate * 100).toFixed(0)}%`;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderTop: `4px solid ${accent}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{c.campaign}</div>
        {/* headline chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <Stat label="Leads" value={String(c.leads)} />
          <Stat label="Calls" value={String(c.calls)} />
          <Stat label="Connected" value={String(c.connected)} tone="#10B981" />
          <Stat label="Connect rate" value={c.calls ? connectPct : '—'} tone="#06B6D4" />
        </div>
      </div>

      {/* campaign-specific KPIs */}
      {c.metrics.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {c.metrics.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
              <span style={{ color: m.label.startsWith('  ') ? 'var(--text-dim)' : 'var(--text)', paddingLeft: m.label.startsWith('  ') ? 10 : 0 }}>
                {m.label.trim()}
              </span>
              <span style={{ color: 'var(--text)', fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* lead queue by status */}
      {c.status_breakdown.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>Lead queue by status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.status_breakdown.map((s) => (
              <span key={s.label} style={{ fontSize: 12, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px', color: 'var(--text)' }}>
                {s.label.replace(/_/g, ' ')} <b>{s.count}</b>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div style={{ background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 12px', minWidth: 72 }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: tone ?? 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
      {label}
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }} />
    </label>
  );
}

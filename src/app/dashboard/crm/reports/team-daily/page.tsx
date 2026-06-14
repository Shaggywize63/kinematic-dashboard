'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { TeamDailyCard } from '../../../../../types/crm';

/**
 * Team Daily Activity — per-rep snapshot for the chosen day, sourced
 * entirely from CRM signals (no attendance dependency).
 *
 * Each card carries:
 *   - last_known_location: lat/lng + address from the rep's most
 *     recent lead with coords. Source = 'lead_created'.
 *   - activities_today: total + completed + per-type breakdown
 *     (calls / emails / meetings / site_visits / tasks / other)
 *   - leads_today + leads_today_qualified + leads_today_converted
 *   - deals_open_count, deals_won_today_count, deals_won_today_value
 *   - pipeline_value (lifetime open pipeline owned by rep)
 *   - status: active (any activity today) | idle (recent but none
 *     today) | inactive (nothing recent)
 */

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TeamDailyPage() {
  const [date, setDate] = useState(todayIso);
  const [cards, setCards] = useState<TeamDailyCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    crmAnalytics.teamDaily(date)
      .then((r) => {
        if (cancelled) return;
        // Endpoint returns the array directly (no `{ success, data }`
        // envelope), so unwrap defensively.
        const payload = (r as unknown as TeamDailyCard[] | { data?: TeamDailyCard[] });
        setCards(Array.isArray(payload) ? payload : (payload?.data ?? []));
      })
      .catch((e: any) => toast.error(e?.message || 'Failed to load Team Daily'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const active   = cards.filter((c) => c.status === 'active').length;
  const idle     = cards.filter((c) => c.status === 'idle').length;
  const inactive = cards.filter((c) => c.status === 'inactive').length;
  const totalLeads = cards.reduce((acc, c) => acc + c.leads_today, 0);
  const totalActivities = cards.reduce((acc, c) => acc + c.activities_today.total, 0);
  const totalWon = cards.reduce((acc, c) => acc + c.deals_won_today_count, 0);
  const totalPipeline = cards.reduce((acc, c) => acc + c.pipeline_value, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Header date={date} onChange={setDate} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <Kpi label="Active reps" value={loading ? '—' : String(active)}   accent="#26a69a" />
        <Kpi label="Idle"         value={loading ? '—' : String(idle)}     accent="#f59e0b" />
        <Kpi label="Inactive"     value={loading ? '—' : String(inactive)} accent="#ef5350" />
        <Kpi label="Leads today"      value={loading ? '—' : String(totalLeads)}      accent="#A855F7" />
        <Kpi label="Activities today" value={loading ? '—' : String(totalActivities)} accent="#3E9EFF" />
        <Kpi label="Deals won today"  value={loading ? '—' : String(totalWon)}        accent="#10B981" />
        <Kpi label="Pipeline value"   value={loading ? '—' : fmtNum(totalPipeline)}   accent="#F59E0B" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 14 }}>
        {loading && cards.length === 0 && <Empty>Loading…</Empty>}
        {!loading && cards.length === 0 && <Empty>No reps in your subtree yet.</Empty>}
        {cards.map((c) => <RepCard key={c.user_id} card={c} />)}
      </div>
    </div>
  );
}

// ── Per-rep card ────────────────────────────────────────────────────

function RepCard({ card }: { card: TeamDailyCard }) {
  const palette = card.status === 'active'
    ? { bg: 'linear-gradient(135deg, #2e7d32 0%, #43a047 100%)', name: '#fff', sub: 'rgba(255,255,255,0.85)' }
    : card.status === 'idle'
      ? { bg: 'linear-gradient(135deg, #ef6c00 0%, #f57c00 100%)', name: '#fff', sub: 'rgba(255,255,255,0.85)' }
      : { bg: 'linear-gradient(135deg, #e53935 0%, #f06292 100%)', name: '#fff', sub: 'rgba(255,255,255,0.85)' };

  const lastActLabel = fmtRelative(card.last_activity_at);
  const loc = card.last_known_location;
  const mapHref = loc.latitude != null && loc.longitude != null
    ? `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`
    : null;

  return (
    <div style={{ background: palette.bg, color: palette.name, borderRadius: 14, overflow: 'hidden', boxShadow: '0 12px 30px rgba(15,30,60,0.10)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800,
        }}>{initials(card.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>{card.name.toUpperCase()}</div>
          <div style={{ fontSize: 12, color: palette.sub, marginTop: 2 }}>
            Last activity: {lastActLabel}
          </div>
        </div>
        <StatusPill status={card.status} />
      </div>

      {/* Today's signals — table */}
      <div style={{ background: 'rgba(0,0,0,0.10)' }}>
        <Row label="Activities" left={`${card.activities_today.completed} done`} right={`${card.activities_today.total} total`} header />
        <Row label="Calls"       left={String(card.activities_today.calls)}        right="" />
        <Row label="Emails"      left={String(card.activities_today.emails)}       right="" />
        <Row label="Meetings"    left={String(card.activities_today.meetings)}     right="" />
        <Row label="Site Visits" left={String(card.activities_today.site_visits)}  right="" />
        <Row label="Tasks"       left={String(card.activities_today.tasks)}        right="" />
        <Row label="Leads today" left={String(card.leads_today)} right={`${card.leads_today_qualified}Q / ${card.leads_today_converted}C`} header />
        <Row label="Open deals"  left={String(card.deals_open_count)} right={fmtNum(card.pipeline_value)} />
        <Row label="Won today"   left={String(card.deals_won_today_count)} right={fmtNum(card.deals_won_today_value)} />
      </div>

      {/* Location */}
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {mapHref ? (
          <a href={mapHref} target="_blank" rel="noreferrer"
            style={{ background: 'rgba(255,255,255,0.20)', color: '#fff', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
            📍 Open in Maps
          </a>
        ) : (
          <span style={{ fontSize: 12, color: palette.sub }}>No location captured</span>
        )}
        {loc.address && <span style={{ fontSize: 11, color: palette.sub }}>{loc.address}</span>}
        {loc.captured_at && (
          <span style={{ fontSize: 11, color: palette.sub }}>· {fmtRelative(loc.captured_at)}</span>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: TeamDailyCard['status'] }) {
  const label = status === 'active' ? 'Active' : status === 'idle' ? 'Idle' : 'Inactive';
  return (
    <span style={{
      background: 'rgba(255,255,255,0.22)', color: '#fff', padding: '4px 10px', borderRadius: 999,
      fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase',
    }}>{label}</span>
  );
}

function Row({ label, left, right, header }: { label: string; left: string; right: string; header?: boolean }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr',
      padding: '8px 16px',
      fontSize: header ? 11 : 13,
      fontWeight: header ? 800 : 700,
      letterSpacing: header ? 0.6 : 0.2,
      textTransform: header ? 'uppercase' : undefined,
      borderTop: '1px solid rgba(255,255,255,0.10)',
    }}>
      <span>{label}</span>
      <span style={{ textAlign: 'center' }}>{left}</span>
      <span style={{ textAlign: 'right' }}>{right}</span>
    </div>
  );
}

// ── Header / KPIs / atoms ──────────────────────────────────────────

function Header({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
      <div>
        <Link href="/dashboard/crm/reports" style={{ fontSize: 12, color: 'var(--primary)', textDecoration: 'none' }}>← All reports</Link>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '6px 0 4px' }}>Team Daily Activity</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          One CRM-only snapshot per rep — activities, leads, deals, location.
        </p>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
        Date
        <input type="date" value={date} onChange={(e) => onChange(e.target.value)}
          style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }} />
      </label>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      gridColumn: '1 / -1',
      background: 'var(--s2)', border: '1px dashed var(--border)', borderRadius: 12,
      padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13,
    }}>{children}</div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase() || 'U';
}

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1_00_000)    return `${(n / 1_00_000).toFixed(2)}L`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 60)   return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  const days = Math.round(mins / 1440);
  return `${days}d ago`;
}

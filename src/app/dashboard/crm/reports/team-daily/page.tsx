'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmAnalytics } from '../../../../../lib/crmApi';
import type { TeamDailyCard } from '../../../../../types/crm';

/**
 * Team Daily Activity — one colour-coded card per rep in the caller's
 * hierarchy subtree, for the chosen day. Mirrors the Tata Tiscon field
 * dashboard the user shared in the spec — a manager can see at a
 * glance who showed up, where, and what they did.
 *
 * Card colour encodes attendance + activity:
 *   - Green:  present + at least one visit done OR a lead logged
 *   - Amber:  present but idle (no activity yet)
 *   - Red:    absent (no check-in for the chosen date)
 *
 * Backed by /api/v1/crm/analytics/team-daily?date=YYYY-MM-DD.
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
      .then((r) => { if (!cancelled) setCards(r.data || []); })
      .catch((e: any) => toast.error(e?.message || 'Failed to load Team Daily'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const present = cards.filter((c) => c.attendance.status === 'present').length;
  const absent  = cards.filter((c) => c.attendance.status === 'absent').length;
  const totalVisits = cards.reduce((acc, c) => acc + c.visits.achieved, 0);
  const totalLeads  = cards.reduce((acc, c) => acc + c.lead_tracker, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Header date={date} onChange={setDate} />

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Kpi label="On-duty" value={loading ? '—' : String(present)} accent="#26a69a" />
        <Kpi label="Absent"  value={loading ? '—' : String(absent)}  accent="#ef5350" />
        <Kpi label="Visits today"  value={loading ? '—' : String(totalVisits)} accent="#3E9EFF" />
        <Kpi label="Leads today"   value={loading ? '—' : String(totalLeads)}  accent="#A855F7" />
      </div>

      {/* Per-rep cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
        {loading && cards.length === 0 && (
          <Empty>Loading…</Empty>
        )}
        {!loading && cards.length === 0 && (
          <Empty>No reps in your subtree. Once your team checks in, their cards will appear here.</Empty>
        )}
        {cards.map((c) => <RepCard key={c.user_id} card={c} />)}
      </div>
    </div>
  );
}

// ── Per-rep card ────────────────────────────────────────────────────

function RepCard({ card }: { card: TeamDailyCard }) {
  const present = card.attendance.status === 'present';
  const didSomething = card.visits.achieved + card.lead_tracker > 0;
  // Background gradient encodes status. Matches the spec screenshot:
  // green for "achieved", red/coral for "stalled / absent".
  const palette = present
    ? (didSomething
        ? { bg: 'linear-gradient(135deg, #2e7d32 0%, #43a047 100%)', name: '#fff', sub: 'rgba(255,255,255,0.85)' }
        : { bg: 'linear-gradient(135deg, #ef6c00 0%, #f57c00 100%)', name: '#fff', sub: 'rgba(255,255,255,0.85)' })
    : { bg: 'linear-gradient(135deg, #e53935 0%, #f06292 100%)', name: '#fff', sub: 'rgba(255,255,255,0.85)' };

  const checkinTime = card.attendance.checkin_at
    ? new Date(card.attendance.checkin_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
    : '—';

  const mapHref = card.attendance.checkin_lat != null && card.attendance.checkin_lng != null
    ? `https://www.google.com/maps?q=${card.attendance.checkin_lat},${card.attendance.checkin_lng}`
    : null;

  return (
    <div style={{
      background: palette.bg, color: palette.name,
      borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 12px 30px rgba(15,30,60,0.10)',
    }}>
      {/* Header — avatar + name + checkin time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%',
          background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, fontWeight: 800,
        }}>{initials(card.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: 0.3 }}>{card.name.toUpperCase()}</div>
          <div style={{ fontSize: 12, color: palette.sub, marginTop: 2 }}>
            {card.attendance.checkin_address || (present ? 'No address recorded' : 'Absent')}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{checkinTime}</div>
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(0,0,0,0.10)' }}>
        <Row label="Activities" left="Achieved" right="Scheduled" header />
        <Row label="Visit" left={card.visits.achieved.toString()} right={card.visits.scheduled.toString()} />
        <Row label="Lead Tracker" left={card.lead_tracker.toString()} right="0" />
      </div>

      {/* Location footer */}
      <div style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
        {mapHref ? (
          <a
            href={mapHref}
            target="_blank"
            rel="noreferrer"
            style={{
              background: 'rgba(255,255,255,0.20)', color: '#fff',
              padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              textDecoration: 'none',
            }}
          >📍 Open in Maps</a>
        ) : (
          <span style={{ fontSize: 12, color: palette.sub }}>No location captured</span>
        )}
        {card.attendance.checkin_lat != null && (
          <span style={{ fontSize: 11, color: palette.sub, fontFamily: 'ui-monospace, monospace' }}>
            {card.attendance.checkin_lat.toFixed(4)}, {card.attendance.checkin_lng?.toFixed(4)}
          </span>
        )}
      </div>
    </div>
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
      <span style={{ textAlign: 'center' }}>{right}</span>
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
          One card per rep — attendance, visits, leads. Green = active, amber = idle, red = absent.
        </p>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13 }}
        />
      </label>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: 'var(--s2)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`,
      borderRadius: 12, padding: '14px 16px',
    }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{value}</div>
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

'use client';
/**
 * CRM Home — a rep's daily mission control. Composed from
 * /api/v1/crm/home, which already merges target + near-to-close +
 * next-best-actions + today's activity + productivity tips into a
 * single payload. This page intentionally reads as one continuous
 * narrative: hero greeting → today's target → next 3 actions → leads
 * closest to closing → today's activity stats → productivity playbook.
 *
 * Visual language is brand-red on dark, generous spacing, big numbers
 * for the metrics that matter (target progress, score grade, urgency).
 * Mirrors what the iOS + Android Home tabs render so a rep flipping
 * surfaces sees the same shape everywhere.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUpRight, Bell, CheckCircle2, ChevronRight, Clock, Flame, MessageCircle,
  Phone, RefreshCw, Sparkles, Target, TrendingUp, UserPlus2,
} from 'lucide-react';
import { crmHome, type HomePayload, type HomeNextAction } from '../../../../lib/crmApi';
import { getStoredUser } from '../../../../lib/auth';

// Belt-and-braces gate: the sidebar already hides this entry for Tata
// Tiscon users via the `hiddenForTata` flag in layout.tsx, but a direct
// URL hit / bookmark would still load this page. Redirect Tata-scoped
// users back to /dashboard/crm so the section is genuinely off for
// them while the surface is being tuned.
const TATA_TISCON_CLIENT_ID = 'a1f67468-526e-4734-be3a-2cb132cc2804';

const URGENCY: Record<'high' | 'medium' | 'low', { color: string; bg: string; label: string }> = {
  high:   { color: '#E11D48', bg: 'rgba(225,29,72,0.12)',  label: 'High urgency' },
  medium: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', label: 'This week' },
  low:    { color: '#10B981', bg: 'rgba(16,185,129,0.12)', label: 'When you can' },
};

const ACTION_ICON: Record<HomeNextAction['action'], (size: number) => React.ReactNode> = {
  call:        (s) => <Phone size={s} />,
  whatsapp:    (s) => <MessageCircle size={s} />,
  follow_up:   (s) => <ArrowUpRight size={s} />,
  qualify:     (s) => <Sparkles size={s} />,
  meeting:     (s) => <Bell size={s} />,
  create_deal: (s) => <TrendingUp size={s} />,
  nurture:     (s) => <UserPlus2 size={s} />,
};

function gradeColor(grade: string | null | undefined): string {
  switch ((grade || '').toUpperCase()) {
    case 'A': return '#16A34A';
    case 'B': return '#3B82F6';
    case 'C': return '#F59E0B';
    case 'D': return '#EF4444';
    default:  return '#6B7280';
  }
}

function firstName(): string {
  const u = getStoredUser() as { name?: string | null } | null;
  const name = (u?.name || '').trim().split(' ')[0];
  return name || 'there';
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5)  return 'Up early';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function CrmHomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Redirect Tata-scoped users (pinned via JWT or active picker) back
  // to the CRM index — matches the sidebar's hiddenForTata gate.
  useEffect(() => {
    const u = getStoredUser() as { client_id?: string | null } | null;
    const userCid = u?.client_id ?? null;
    const pickerCid = typeof window !== 'undefined'
      ? (() => { try { return localStorage.getItem('kinematic_selected_client'); } catch { return null; } })()
      : null;
    if (userCid === TATA_TISCON_CLIENT_ID || pickerCid === TATA_TISCON_CLIENT_ID) {
      router.replace('/dashboard/crm');
    }
  }, [router]);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const r = await crmHome.get();
      setData(r.data ?? null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const first = useMemo(firstName, []);
  const hello = useMemo(greeting, []);

  if (loading) {
    return (
      <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 14 }}>
        Loading your day…
      </div>
    );
  }

  const t = data?.today_target;
  const nextActions = data?.next_actions ?? [];
  const nearClose = data?.near_to_close ?? [];
  const activity = data?.today_activity;
  const tips = data?.productivity_tips ?? [];

  return (
    <div style={{ maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 22, paddingBottom: 24 }}>
      {/* ── Hero — greeting + target progress ─────────────────────────── */}
      <section style={{
        borderRadius: 22, overflow: 'hidden',
        background: 'linear-gradient(135deg, #E11D48 0%, #B91C3D 100%)',
        boxShadow: '0 10px 30px rgba(225,29,72,0.25)',
        color: '#fff', padding: 26,
        display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center',
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.85, fontWeight: 700 }}>
            {hello}, {first}
          </div>
          <h1 style={{ margin: '6px 0 10px', fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>
            {t?.headline || "Here's your day."}
          </h1>
          {t?.has_target ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13, opacity: 0.92 }}>
              <Stat icon={<Target size={14} />} label="Target" value={`${t.achieved} / ${t.target}`} />
              <Stat icon={<Flame size={14} />} label="Remaining" value={`${t.remaining}`} />
              <Stat icon={<Sparkles size={14} />} label="Pace" value={`${t.progress_pct}%`} />
            </div>
          ) : (
            <div style={{ fontSize: 13, opacity: 0.85 }}>No target set for this week. Ask your manager to assign one, or focus on your near-to-close pipeline below.</div>
          )}
        </div>
        <ProgressRing pct={t?.progress_pct ?? 0} achieved={t?.achieved ?? 0} target={t?.target ?? 0} />
      </section>

      {/* ── Refresh affordance row ───────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => load(true)} disabled={refreshing} style={refreshBtn}>
          <RefreshCw size={12} style={{ transform: refreshing ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.4s' }} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* ── Next actions — top 3 with reasoning ──────────────────────── */}
      <Section
        title="Next best actions"
        subtitle="Ranked by urgency × score. Each suggestion explains why it's the next move."
      >
        {nextActions.length === 0 ? (
          <EmptyState
            text="You're clear. Use the time to source new leads or polish stuck deals."
          />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
            {nextActions.map((a, idx) => (
              <ActionCard key={a.lead_id} order={idx + 1} action={a} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Closest to closing ──────────────────────────────────────── */}
      <Section
        title="Closest to closing"
        subtitle="Grade A/B leads sitting in sales-qualified or qualified. Mornings have higher connect rates — start here."
      >
        {nearClose.length === 0 ? (
          <EmptyState text="No high-grade leads in qualified stage yet. Score and qualify a few from your open list to unlock this." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {nearClose.map((l) => (
              <Link
                key={l.id}
                href={`/dashboard/crm/leads/${l.id}`}
                style={{
                  display: 'grid', gridTemplateColumns: '44px 1fr auto auto', gap: 14, alignItems: 'center',
                  padding: '12px 14px', borderRadius: 14, textDecoration: 'none',
                  background: 'var(--s2)', border: '1px solid var(--border)',
                }}
              >
                <GradeBadge grade={l.score_grade} score={l.score} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14 }}>{l.name}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>{l.reason}</div>
                </div>
                <StatusChip text={l.status || l.lifecycle_stage || 'open'} />
                <ChevronRight size={16} color="var(--text-dim)" />
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* ── Today's activity strip ──────────────────────────────────── */}
      <Section
        title="Today's activity"
        subtitle={activity?.last_activity_at ? `Last logged ${formatAgo(activity.last_activity_at)}` : 'Nothing logged yet — your first entry sets the streak.'}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
          <ActivityStat label="Total" value={activity?.total ?? 0} icon={<CheckCircle2 size={18} />} accent="#10B981" />
          <ActivityStat label="Calls"     value={activity?.by_type?.call ?? 0}     icon={<Phone size={18} />}        accent="#3B82F6" />
          <ActivityStat label="WhatsApp" value={activity?.by_type?.whatsapp ?? 0} icon={<MessageCircle size={18} />} accent="#16A34A" />
          <ActivityStat label="Meetings" value={activity?.by_type?.meeting ?? 0} icon={<Bell size={18} />}         accent="#F59E0B" />
          <ActivityStat label="Notes"    value={activity?.by_type?.note ?? 0}    icon={<Sparkles size={18} />}     accent="#8B5CF6" />
        </div>
      </Section>

      {/* ── Productivity playbook ───────────────────────────────────── */}
      <Section
        title="Productivity playbook"
        subtitle="Data-driven nudges built from the rest of this page. Pick one and run with it."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tips.map((tip, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '32px 1fr', gap: 12, alignItems: 'start',
              padding: '12px 14px', borderRadius: 14,
              background: 'var(--s2)', border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(225,29,72,0.22), rgba(225,29,72,0.06))',
                color: '#E11D48', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 13,
              }}>{i + 1}</div>
              <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5 }}>{tip}</div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local components — kept colocated so this page reads top-to-bottom
// without bouncing between files. None of these are needed elsewhere
// yet; promote to /components if the mobile parity ever reuses them.

function ProgressRing({ pct, achieved, target }: { pct: number; achieved: number; target: number }) {
  const r = 44; const c = 2 * Math.PI * r; const filled = (pct / 100) * c;
  return (
    <div style={{ position: 'relative', width: 110, height: 110, flex: 'none' }}>
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={r} stroke="rgba(255,255,255,0.22)" strokeWidth="8" fill="none" />
        <circle
          cx="55" cy="55" r={r} stroke="#fff" strokeWidth="8" fill="none"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform="rotate(-90 55 55)"
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
      }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{achieved}</div>
        <div style={{ fontSize: 10, opacity: 0.85, textTransform: 'uppercase', letterSpacing: 0.6 }}>of {target || '—'}</div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.12)' }}>
      {icon}<strong style={{ fontSize: 13 }}>{value}</strong><span style={{ opacity: 0.85, fontSize: 11 }}>{label}</span>
    </span>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <header style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{title}</h2>
        {subtitle && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{subtitle}</div>}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '20px 18px', borderRadius: 14,
      background: 'var(--s2)', border: '1px dashed var(--border)',
      color: 'var(--text-dim)', fontSize: 13, textAlign: 'center',
    }}>{text}</div>
  );
}

function ActionCard({ order, action }: { order: number; action: HomeNextAction }) {
  const u = URGENCY[action.urgency];
  const icon = ACTION_ICON[action.action]?.(16) ?? <ArrowUpRight size={16} />;
  return (
    <Link
      href={action.deeplink_path}
      style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: 16, borderRadius: 16, textDecoration: 'none',
        background: 'var(--s2)', border: '1px solid var(--border)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Order badge in the corner so a rep can scan "do #1 first". */}
      <span style={{
        position: 'absolute', top: 12, right: 12, fontSize: 10,
        padding: '2px 8px', borderRadius: 999, fontWeight: 800,
        background: u.bg, color: u.color, textTransform: 'uppercase', letterSpacing: 0.5,
      }}>#{order} · {u.label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 36, height: 36, borderRadius: 10,
          background: u.bg, color: u.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 14 }}>{action.label}</div>
          {action.score != null && (
            <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
              Score {action.score}{action.score_grade ? ` · grade ${action.score_grade}` : ''}
            </div>
          )}
        </div>
      </div>
      <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.5, opacity: 0.9 }}>
        {action.reason}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: u.color, fontSize: 12, fontWeight: 700, marginTop: 'auto' }}>
        Open {action.lead_name} <ChevronRight size={14} />
      </div>
    </Link>
  );
}

function GradeBadge({ grade, score }: { grade: string | null | undefined; score: number | null }) {
  const c = gradeColor(grade);
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 12,
      background: `${c}1f`, color: c,
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontWeight: 900, fontSize: 16, lineHeight: 1,
    }}>
      {grade || '–'}
      <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.85, marginTop: 2 }}>{score ?? ''}</span>
    </div>
  );
}
function StatusChip({ text }: { text: string }) {
  const label = text.replace(/_/g, ' ');
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4,
      padding: '4px 10px', borderRadius: 999,
      color: 'var(--text-dim)', background: 'var(--s3)', border: '1px solid var(--border)',
    }}>{label}</span>
  );
}
function ActivityStat({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 14, background: 'var(--s2)', border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <span style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${accent}1f`, color: accent,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{value}</div>
      </div>
    </div>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (diff < 1) return 'just now';
  if (diff < 60) return `${diff}m ago`;
  if (diff < 60 * 24) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / (60 * 24))}d ago`;
}

// Inline-style refresh button — matches the rest of the CRM toolbar look.
const refreshBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '6px 12px', borderRadius: 8,
  background: 'var(--s2)', border: '1px solid var(--border)',
  color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
};

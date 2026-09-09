'use client';
/**
 * CRM Home — a rep's daily mission control. Composed from
 * /api/v1/crm/home, which already merges target + near-to-close +
 * next-best-actions + today's activity + productivity tips into a
 * single payload. This page intentionally reads as one continuous
 * narrative: greeting → today's target + activity tiles → next 3
 * actions → leads closest to closing → productivity playbook.
 *
 * Mirrors what the iOS + Android Home tabs render so a rep flipping
 * surfaces sees the same shape everywhere.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowUpRight, Bell, CheckCircle2, ChevronRight, Flame, Lightbulb, ListChecks, MessageCircle,
  Phone, RefreshCw, Sparkles, Target, TrendingUp, Trophy, UserPlus2,
} from 'lucide-react';
import { crmHome, type HomePayload, type HomeNextAction } from '../../../../lib/crmApi';
import { getStoredUser } from '../../../../lib/auth';
import { Badge, Button, Card, EmptyState, Eyebrow, PageHeader, T, useIsCompact, type Tone } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';

// Belt-and-braces gate: the sidebar already hides this entry for Tata
// Tiscon users via the `hiddenForTata` flag in layout.tsx, but a direct
// URL hit / bookmark would still load this page. Redirect Tata-scoped
// users back to /dashboard/crm so the section is genuinely off for
// them while the surface is being tuned.
const TATA_TISCON_CLIENT_ID = 'a1f67468-526e-4734-be3a-2cb132cc2804';

const URGENCY: Record<'high' | 'medium' | 'low', { tone: Tone; label: string }> = {
  high:   { tone: 'red',  label: 'High urgency' },
  medium: { tone: 'warn', label: 'This week' },
  low:    { tone: 'ok',   label: 'When you can' },
};

const TONE_FG: Record<Tone, string> = { neutral: T.dim, info: T.info, ok: T.ok, warn: T.warn, red: T.red };
const TONE_BG: Record<Tone, string> = { neutral: 'var(--s3)', info: T.infoWash, ok: T.okWash, warn: T.warnWash, red: T.redWash };

const ACTION_ICON: Record<HomeNextAction['action'], (size: number) => React.ReactNode> = {
  call:        (s) => <Phone size={s} strokeWidth={1.6} />,
  whatsapp:    (s) => <MessageCircle size={s} strokeWidth={1.6} />,
  follow_up:   (s) => <ArrowUpRight size={s} strokeWidth={1.6} />,
  qualify:     (s) => <Sparkles size={s} strokeWidth={1.6} />,
  meeting:     (s) => <Bell size={s} strokeWidth={1.6} />,
  create_deal: (s) => <TrendingUp size={s} strokeWidth={1.6} />,
  nurture:     (s) => <UserPlus2 size={s} strokeWidth={1.6} />,
};

function gradeTone(grade: string | null | undefined): Tone {
  switch ((grade || '').toUpperCase()) {
    case 'A': return 'ok';
    case 'B': return 'info';
    case 'C': return 'warn';
    case 'D': return 'red';
    default:  return 'neutral';
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
  usePageTitle('Home');
  const narrow = useIsCompact(900);
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
  // Time-of-day greeting is client-only: computing it during SSR renders the
  // server's hour and trips a hydration mismatch when the browser disagrees.
  const [hello, setHello] = useState('Hello');
  useEffect(() => { setHello(greeting()); }, []);

  const t = data?.today_target;
  const nextActions = data?.next_actions ?? [];
  const nearClose = data?.near_to_close ?? [];
  const activity = data?.today_activity;
  const tips = data?.productivity_tips ?? [];

  const header = (
    <PageHeader
      title={`${hello}, ${first}`}
      description={loading ? 'Loading your day…' : (t?.headline || 'Here’s your day — target, next moves and the leads closest to closing.')}
      actions={
        <Button onClick={() => load(true)} disabled={refreshing || loading} icon={<RefreshCw size={16} strokeWidth={1.6} style={{ transform: refreshing ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.4s' }} />}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      }
      compact={narrow}
    />
  );

  if (loading) {
    return (
      <div style={{ maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {header}
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} padding={16}>
              <div style={{ height: 10, width: '40%', borderRadius: 5, background: 'var(--s3)' }} />
              <div style={{ height: 24, width: '55%', borderRadius: 6, background: 'var(--s3)', marginTop: 14 }} />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, t?.progress_pct ?? 0));
  const targetDone = !!t?.has_target && (t?.achieved ?? 0) >= (t?.target ?? 0) && (t?.target ?? 0) > 0;

  return (
    <div style={{ maxWidth: 1180, display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 24 }}>
      {header}

      {/* ── Today's target + activity tiles ─────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 2fr)', gap: 12, alignItems: 'stretch' }}>
        <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Eyebrow>Today’s target</Eyebrow>
            {t?.has_target && (
              targetDone
                ? <Badge tone="ok" dot>Done</Badge>
                : <Badge tone={pct >= 50 ? 'info' : 'warn'} mono>{pct}%</Badge>
            )}
          </div>
          {t?.has_target ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{t.achieved}</span>
                <span style={{ fontSize: 13, color: T.dim }}>of {t.target || '—'}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: T.rule, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: targetDone ? T.ok : T.red, borderRadius: 99, transition: 'width .3s' }} />
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Target size={14} strokeWidth={1.6} /> <span style={{ fontFamily: T.mono, color: T.text }}>{t.achieved} / {t.target}</span></span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Flame size={14} strokeWidth={1.6} /> <span style={{ fontFamily: T.mono, color: T.text }}>{t.remaining}</span> remaining</span>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>
              No target set for this week. Ask your manager to assign one, or focus on your near-to-close pipeline below.
            </div>
          )}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: narrow ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
          <ActivityStat label="Logged today" value={activity?.total ?? 0} icon={<CheckCircle2 size={16} strokeWidth={1.6} />} tone="ok" />
          <ActivityStat label="Calls"    value={activity?.by_type?.call ?? 0}     icon={<Phone size={16} strokeWidth={1.6} />}         tone="info" />
          <ActivityStat label="WhatsApp" value={activity?.by_type?.whatsapp ?? 0} icon={<MessageCircle size={16} strokeWidth={1.6} />} tone="ok" />
          <ActivityStat label="Meetings" value={activity?.by_type?.meeting ?? 0}  icon={<Bell size={16} strokeWidth={1.6} />}          tone="warn" />
          <ActivityStat label="Notes"    value={activity?.by_type?.note ?? 0}     icon={<Sparkles size={16} strokeWidth={1.6} />}      tone="neutral" />
        </div>
      </div>

      {/* ── Next actions — top 3 with reasoning ──────────────────────── */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <SectionHead
          title="Next best actions"
          hint="Ranked by urgency × score. Each suggestion explains why it’s the next move."
          count={nextActions.length}
        />
        {nextActions.length === 0 ? (
          <EmptyState
            icon={<ListChecks size={20} strokeWidth={1.6} />}
            title="You’re clear"
            description="Use the time to source new leads or polish stuck deals."
            style={{ padding: '36px 24px' }}
          />
        ) : nextActions.map((a, idx) => (
          <ActionRow key={a.lead_id} order={idx + 1} action={a} last={idx === nextActions.length - 1} narrow={narrow} />
        ))}
      </Card>

      {/* ── Closest to closing ──────────────────────────────────────── */}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <SectionHead
          title="Closest to closing"
          hint="Grade A/B leads in sales-qualified or qualified. Mornings have higher connect rates — start here."
          count={nearClose.length}
        />
        {nearClose.length === 0 ? (
          <EmptyState
            icon={<Trophy size={20} strokeWidth={1.6} />}
            title="No high-grade leads in a qualified stage yet"
            description="Score and qualify a few from your open list to unlock this."
            style={{ padding: '36px 24px' }}
          />
        ) : nearClose.map((l, idx) => (
          <Link
            key={l.id}
            href={`/dashboard/crm/leads/${l.id}`}
            className="km-listrow"
            style={{
              display: 'grid', gridTemplateColumns: narrow ? '40px 1fr auto' : '40px 1fr auto auto', gap: 14, alignItems: 'center',
              padding: '12px 16px', textDecoration: 'none', color: 'inherit',
              borderBottom: idx === nearClose.length - 1 ? 0 : `1px solid ${T.border}`,
            }}
          >
            <GradeBadge grade={l.score_grade} score={l.score} />
            <div style={{ minWidth: 0 }}>
              <div className="km-entity-link" style={{ fontSize: 13.5, fontWeight: 500, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
              <div style={{ color: T.dim, fontSize: 12.5, marginTop: 2 }}>{l.reason}</div>
            </div>
            {!narrow && <Badge tone="neutral">{(l.status || l.lifecycle_stage || 'open').replace(/_/g, ' ')}</Badge>}
            <ChevronRight size={16} strokeWidth={1.6} style={{ color: T.mute }} />
          </Link>
        ))}
        {activity?.last_activity_at && (
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${T.border}`, fontSize: 12.5, color: T.mute }}>
            Last activity logged <span style={{ fontFamily: T.mono, color: T.dim }}>{formatAgo(activity.last_activity_at)}</span>
          </div>
        )}
      </Card>

      {/* ── Productivity playbook ───────────────────────────────────── */}
      {tips.length > 0 && (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <SectionHead title="Productivity playbook" hint="Data-driven nudges built from the rest of this page. Pick one and run with it." />
          {tips.map((tip, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, alignItems: 'start', padding: '12px 16px', borderBottom: i === tips.length - 1 ? 0 : `1px solid ${T.border}` }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--s3)', color: T.dim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.mono, fontSize: 11.5 }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ color: T.text, fontSize: 13.5, lineHeight: 1.5, paddingTop: 4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Lightbulb size={15} strokeWidth={1.6} style={{ color: T.warn, flexShrink: 0, marginTop: 2 }} />
                <span>{tip}</span>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local components — kept colocated so this page reads top-to-bottom
// without bouncing between files. None of these are needed elsewhere
// yet; promote to /components if the mobile parity ever reuses them.

function SectionHead({ title, hint, count }: { title: string; hint?: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>{title}</div>
          {typeof count === 'number' && count > 0 && <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>{count}</span>}
        </div>
        {hint && <div style={{ fontSize: 12.5, color: T.dim }}>{hint}</div>}
      </div>
    </div>
  );
}

function ActionRow({ order, action, last, narrow }: { order: number; action: HomeNextAction; last: boolean; narrow: boolean }) {
  const u = URGENCY[action.urgency];
  const icon = ACTION_ICON[action.action]?.(16) ?? <ArrowUpRight size={16} strokeWidth={1.6} />;
  return (
    <Link
      href={action.deeplink_path}
      className="km-listrow"
      style={{
        display: 'grid', gridTemplateColumns: narrow ? '32px 1fr' : '32px 1fr auto', gap: 14, alignItems: 'start',
        padding: '12px 16px', textDecoration: 'none', color: 'inherit',
        borderBottom: last ? 0 : `1px solid ${T.border}`,
      }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 8, background: TONE_BG[u.tone], color: TONE_FG[u.tone], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>#{order}</span>
          <span style={{ fontSize: 13.5, fontWeight: 500, color: T.text }}>{action.label}</span>
          <Badge tone={u.tone} dot>{u.label}</Badge>
          {action.score != null && (
            <span style={{ fontFamily: T.mono, fontSize: 11.5, color: T.mute }}>
              score {action.score}{action.score_grade ? ` · ${action.score_grade}` : ''}
            </span>
          )}
        </div>
        <div style={{ color: T.dim, fontSize: 13, lineHeight: 1.5 }}>{action.reason}</div>
        <div className="km-entity-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.info, fontSize: 12.5, fontWeight: 500 }}>
          Open {action.lead_name} <ChevronRight size={14} strokeWidth={1.6} />
        </div>
      </div>
      {!narrow && <ChevronRight size={16} strokeWidth={1.6} style={{ color: T.mute, marginTop: 8 }} />}
    </Link>
  );
}

function GradeBadge({ grade, score }: { grade: string | null | undefined; score: number | null }) {
  const tone = gradeTone(grade);
  return (
    <div style={{
      width: 40, height: 40, borderRadius: 8,
      background: TONE_BG[tone], color: TONE_FG[tone],
      display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      fontFamily: T.heading, fontWeight: 700, fontSize: 15, lineHeight: 1,
    }}>
      {grade || '–'}
      <span style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 500, opacity: 0.85, marginTop: 3 }}>{score ?? ''}</span>
    </div>
  );
}

function ActivityStat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: Tone }) {
  return (
    <Card padding={14} style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Eyebrow style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Eyebrow>
        <span style={{ width: 24, height: 24, borderRadius: 6, background: TONE_BG[tone], color: TONE_FG[tone], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      </div>
      <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1, color: T.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </Card>
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

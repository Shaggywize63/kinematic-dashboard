'use client';
import { useState } from 'react';
import type { NextBestAction, NextBestActionMethodology } from '../../types/crm';
import AiBadge from './shared/AiBadge';

const ACTION_LABEL: Record<string, string> = {
  call: 'Call',
  meeting: 'Schedule meeting',
  send_proposal: 'Send proposal',
  nurture: 'Nurture',
  disqualify: 'Disqualify',
  email: 'Email',
};
const WHEN_LABEL: Record<string, string> = {
  now: 'Now',
  today: 'Today',
  this_week: 'This week',
  next_week: 'Next week',
};

function priorityKey(p?: string): 'high' | 'medium' | 'low' {
  if (p === 'high') return 'high';
  if (p === 'low') return 'low';
  return 'medium';
}

export default function NextBestActionCard({
  action,
  onLoad,
  loading,
}: {
  action?: NextBestAction | null;
  onLoad?: () => void;
  loading?: boolean;
}) {
  const prio = priorityKey(action?.priority as string | undefined);
  const tone = prio === 'high' ? '#E01E2C' : prio === 'medium' ? '#F7B538' : '#28B463';
  const reasonText = action?.reason ?? action?.rationale ?? '';
  const [openExplainer, setOpenExplainer] = useState(false);
  const methodology = action?.methodology;
  const canExplain = !!methodology && (methodology.closing_plan.length > 0 || methodology.reasoning);

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Next Best Action</div>
          <AiBadge label="Powered by KINI AI" />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {canExplain && (
            <button
              onClick={() => setOpenExplainer(true)}
              title="See how this recommendation was generated"
              style={{
                background: 'var(--s3)', border: '1px solid var(--border)',
                color: 'var(--text-dim)', fontSize: 11, fontWeight: 600,
                padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              <span style={{ fontSize: 12 }}>ⓘ</span>
              <span>How?</span>
            </button>
          )}
          {onLoad && (
            <button onClick={onLoad} disabled={loading} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
              {loading ? 'Thinking…' : 'Suggest'}
            </button>
          )}
        </div>
      </div>
      {action ? (
        <div>
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700, marginBottom: 6, textTransform: 'capitalize' }}>
            {ACTION_LABEL[action.action] || action.action.replace(/_/g, ' ')}
          </div>
          {reasonText && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8, lineHeight: 1.5 }}>{reasonText}</div>}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: tone, background: `${tone}1A`, border: `1px solid ${tone}40` }}>
              {prio}
            </div>
            {action.suggested_when && (
              <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: '#3E9EFF', background: 'rgba(62,158,255,0.10)', border: '1px solid rgba(62,158,255,0.30)' }}>
                {WHEN_LABEL[action.suggested_when] || action.suggested_when}
              </div>
            )}
            {methodology && methodology.closing_plan.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                · {methodology.closing_plan.length}-step closing plan
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>No suggestion yet.</div>
      )}

      {openExplainer && methodology && action && (
        <ExplainerModal
          onClose={() => setOpenExplainer(false)}
          methodology={methodology}
          headlineAction={ACTION_LABEL[action.action] || action.action.replace(/_/g, ' ')}
          headlineWhen={action.suggested_when ? WHEN_LABEL[action.suggested_when] : null}
          tone={tone}
          priority={prio}
        />
      )}
    </div>
  );
}

function ExplainerModal({
  onClose,
  methodology,
  headlineAction,
  headlineWhen,
  tone,
  priority,
}: {
  onClose: () => void;
  methodology: NextBestActionMethodology;
  headlineAction: string;
  headlineWhen: string | null;
  tone: string;
  priority: 'high' | 'medium' | 'low';
}) {
  const { signals, closing_plan, reasoning } = methodology;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14,
        padding: 'clamp(16px, 4vw, 24px)',
        maxWidth: 580, width: '100%', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>How was this recommended?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Signals + closing plan derived from the deal&apos;s history and recent activity</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: 'var(--s3)', borderRadius: 10,
          marginTop: 14, marginBottom: 16, flexWrap: 'wrap',
        }}>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>Recommendation</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{headlineAction}</div>
            {reasoning && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, lineHeight: 1.5 }}>{reasoning}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            <div style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: tone, background: `${tone}1A`, border: `1px solid ${tone}40` }}>
              {priority}
            </div>
            {headlineWhen && (
              <div style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: '#3E9EFF', background: 'rgba(62,158,255,0.10)', border: '1px solid rgba(62,158,255,0.30)' }}>
                {headlineWhen}
              </div>
            )}
          </div>
        </div>

        <SectionHeader>Signals considered</SectionHeader>
        <SignalsGrid signals={signals} />

        {closing_plan.length > 0 && (
          <>
            <SectionHeader>Closing plan</SectionHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {closing_plan.map((step) => (
                <PlanStep key={step.step} step={step} />
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 18, padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>How the recommender works:</strong> KINI AI is given the deal&apos;s current stage, win probability, age, days in stage, last 30 days of activities (by type), and stage transition history. It picks the next single action AND a 3–5 step closing plan ordered by urgency. Refreshes are cached for 6 hours — click <strong style={{ color: 'var(--text)' }}>Suggest</strong> on the card to force a re-compute.
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
      fontWeight: 700, letterSpacing: 0.6, marginBottom: 8, marginTop: 14,
    }}>{children}</div>
  );
}

function SignalsGrid({ signals }: { signals: NextBestActionMethodology['signals'] }) {
  const activityBreakdown = Object.entries(signals.activities_30d_by_type || {})
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${t}`)
    .join(', ');
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: 8,
    }}>
      <SignalChip label="Stage" value={signals.stage?.name ?? '—'} sub={signals.stage ? `${signals.stage.probability}% stage prob` : null} />
      <SignalChip label="Days in stage" value={signals.days_in_stage != null ? `${signals.days_in_stage}d` : '—'} />
      <SignalChip label="Deal age" value={`${signals.deal_age_days}d`} />
      <SignalChip label="Win probability" value={signals.win_probability != null ? `${signals.win_probability}%` : '—'} />
      <SignalChip
        label="Activities (30d)"
        value={String(signals.activities_30d_total ?? 0)}
        sub={activityBreakdown || (signals.activities_30d_total === 0 ? 'No activity' : null)}
      />
      <SignalChip
        label="Last touch"
        value={
          signals.days_since_last_touch == null
            ? 'Never'
            : signals.days_since_last_touch === 0
              ? 'Today'
              : `${signals.days_since_last_touch}d ago`
        }
        sub={signals.last_activity_type}
      />
      <SignalChip label="Stage transitions" value={String(signals.stage_transitions ?? 0)} />
    </div>
  );
}

function SignalChip({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div style={{ padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginTop: 2, wordBreak: 'break-word' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function PlanStep({ step }: { step: NextBestActionMethodology['closing_plan'][number] }) {
  const whenColor = step.when === 'now' || step.when === 'today' ? '#E01E2C'
    : step.when === 'this_week' ? '#F7B538' : '#3E9EFF';
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 14px', background: 'var(--s3)', borderRadius: 10 }}>
      <div style={{
        flexShrink: 0, width: 28, height: 28, borderRadius: '50%',
        background: 'var(--s2)', color: 'var(--text)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, border: '1px solid var(--border)',
      }}>{step.step}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{step.action}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: whenColor, background: `${whenColor}1A`, border: `1px solid ${whenColor}40`, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', flexShrink: 0 }}>
            {WHEN_LABEL[step.when] || step.when}
          </div>
        </div>
        {step.rationale && <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{step.rationale}</div>}
      </div>
    </div>
  );
}

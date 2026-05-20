'use client';
import { useState } from 'react';
import AiBadge from './shared/AiBadge';
import type { WinProbabilityBreakdown } from '../../types/crm';

interface Props {
  /** Accepts 0–1 (legacy fraction) OR 0–100 (current backend). Normalised below. */
  probability: number;
  confidence?: number;
  drivers?: Array<{ name: string; impact: number; direction: 'positive' | 'negative' }>;
  ai?: boolean;
  /** Plain-language explanation from the backend (1-2 sentences). */
  reasoning?: string;
  /** Structured per-factor breakdown — drives the "How is this calculated?" modal. */
  breakdown?: WinProbabilityBreakdown;
}

/**
 * Backend started returning probability as 0-100; some callers (and the
 * legacy `Deal.probability` field) still pass 0-1. Anything ≤1 we treat
 * as a fraction; anything larger is already a percent. This keeps a
 * stage at "100% win probability" from rendering as 10000% → clamped.
 */
function toPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  const raw = Math.abs(p) <= 1 ? p * 100 : p;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export default function WinProbabilityGauge({ probability, confidence, drivers, ai, reasoning, breakdown }: Props) {
  const pct = toPct(probability);
  const color = pct >= 70 ? '#28B463' : pct >= 40 ? '#F7B538' : '#E01E2C';
  const r = 50; const C = 2 * Math.PI * r; const dash = (pct / 100) * C;
  const [openExplainer, setOpenExplainer] = useState(false);
  const canExplain = !!breakdown || !!reasoning;

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Win Probability</div>
          {ai && <AiBadge />}
        </div>
        {canExplain && (
          <button
            onClick={() => setOpenExplainer(true)}
            title="See how this percentage was calculated"
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
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={r} stroke="var(--s3)" strokeWidth="10" fill="none" />
          <circle cx="60" cy="60" r={r} stroke={color} strokeWidth="10" fill="none" strokeDasharray={`${dash} ${C}`} strokeLinecap="round" transform="rotate(-90 60 60)" />
          <text x="60" y="66" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text)">{pct}%</text>
        </svg>
        <div style={{ flex: 1 }}>
          {confidence != null && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>Confidence: {Math.round(confidence * 100)}%</div>}
          {breakdown ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <FactorRow label="Stage" value={breakdown.stage_name || '—'} impact={`${breakdown.stage_probability}%`} accent />
              {!breakdown.short_circuit && (
                <>
                  <FactorRow label="Age" value={`${breakdown.age_days}d`} impact={`×${breakdown.age_multiplier.toFixed(2)}`} />
                  <FactorRow label="Engagement" value={`${breakdown.activities_30d} act.`} impact={`×${breakdown.engagement_multiplier.toFixed(2)}`} />
                </>
              )}
              {breakdown.short_circuit && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  Locked at {pct}% — deal is {breakdown.short_circuit}.
                </div>
              )}
            </div>
          ) : drivers && drivers.length > 0 ? (
            drivers.slice(0, 4).map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text)', marginBottom: 4 }}>
                <span>{d.name}</span>
                <span style={{ color: d.direction === 'positive' ? '#28B463' : '#E01E2C' }}>{d.direction === 'positive' ? '+' : ''}{Math.round(d.impact * 100)}%</span>
              </div>
            ))
          ) : null}
        </div>
      </div>

      {openExplainer && (
        <ExplainerModal
          onClose={() => setOpenExplainer(false)}
          breakdown={breakdown}
          reasoning={reasoning}
          probability={pct}
          color={color}
        />
      )}
    </div>
  );
}

function FactorRow({ label, value, impact, accent }: { label: string; value: string; impact: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, color: 'var(--text)' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline' }}>
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>{value}</span>
        <span style={{ color: accent ? '#3E9EFF' : 'var(--text)', fontWeight: 700 }}>{impact}</span>
      </span>
    </div>
  );
}

/**
 * Explainer modal — shows the step-by-step maths behind the gauge so
 * reps don't have to take the number on faith. Renders three modes:
 *   - Won/Lost short-circuit (locked figure, single reason line)
 *   - Full heuristic (stage prob × age mult × engagement mult = final)
 *   - Fallback prose (when only `reasoning` is present)
 */
function ExplainerModal({
  onClose,
  breakdown,
  reasoning,
  probability,
  color,
}: {
  onClose: () => void;
  breakdown?: WinProbabilityBreakdown;
  reasoning?: string;
  probability: number;
  color: string;
}) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 400,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 540, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>How is this calculated?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Breakdown of the {probability}% win probability</div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {/* Headline number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'var(--s3)', borderRadius: 10, marginTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 36, fontWeight: 800, color }}>{probability}%</div>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-dim)' }}>
            {breakdown?.short_circuit ? breakdown.short_circuit_message : reasoning || 'Heuristic estimate from stage probability, deal age, and recent engagement.'}
          </div>
        </div>

        {breakdown?.short_circuit ? (
          <ShortCircuitView breakdown={breakdown} />
        ) : breakdown ? (
          <HeuristicBreakdown breakdown={breakdown} />
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>
            No structured breakdown was returned by the AI service. The plain-text reasoning above is the only explanation available for this calculation.
          </div>
        )}

        <div style={{ marginTop: 18, padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
          <strong style={{ color: 'var(--text)' }}>How the formula works:</strong> we start with the stage's configured win probability (set in pipeline settings), then multiply by a deal-age factor (deals older than 60 days are penalised) and an engagement factor (deals with more recent activities get a small boost, capped at ×1.50). The result is clamped to 0–100%.
        </div>
      </div>
    </div>
  );
}

function ShortCircuitView({ breakdown }: { breakdown: WinProbabilityBreakdown }) {
  const accent = breakdown.short_circuit === 'won' ? '#28B463' : '#E01E2C';
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      border: `1px solid ${accent}40`, background: `${accent}10`,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginBottom: 6 }}>
        {breakdown.short_circuit === 'won' ? '✓ Locked — deal already Won' : '✗ Locked — deal already Lost'}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
        When a deal sits in a stage of type <code>{breakdown.short_circuit}</code>{breakdown.stage_name ? <> (currently <strong style={{ color: 'var(--text)' }}>{breakdown.stage_name}</strong>)</> : null}, the heuristic skips the age + engagement factors and locks the probability at {breakdown.final_probability}%. Move the deal back to an open stage to recompute.
      </div>
    </div>
  );
}

function HeuristicBreakdown({ breakdown }: { breakdown: WinProbabilityBreakdown }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ExplainerStep
        index={1}
        title="Stage probability"
        valueLabel={breakdown.stage_name ? `Stage: ${breakdown.stage_name}` : 'Configured per stage'}
        operand={`${breakdown.stage_probability}%`}
        detail="Set in pipeline settings — the default chance of winning when a deal reaches this stage."
        accent
      />
      <ExplainerStep
        index={2}
        title="Age adjustment"
        valueLabel={`Deal is ${breakdown.age_days} day${breakdown.age_days === 1 ? '' : 's'} old`}
        operand={`× ${breakdown.age_multiplier.toFixed(2)}`}
        detail={breakdown.age_label}
      />
      <ExplainerStep
        index={3}
        title="Engagement factor"
        valueLabel={`${breakdown.activities_30d} ${breakdown.activities_30d === 1 ? 'activity' : 'activities'} in last 30 days`}
        operand={`× ${breakdown.engagement_multiplier.toFixed(2)}`}
        detail={breakdown.engagement_label}
      />
      <div style={{
        padding: '12px 14px', background: 'var(--s3)', borderRadius: 10,
        fontSize: 13, color: 'var(--text)', fontWeight: 700, textAlign: 'center',
      }}>
        {breakdown.formula_text}
      </div>
    </div>
  );
}

function ExplainerStep({
  index, title, valueLabel, operand, detail, accent,
}: {
  index: number; title: string; valueLabel: string; operand: string; detail: string; accent?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{
        flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
        background: 'var(--s3)', color: 'var(--text-dim)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700,
      }}>{index}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: accent ? '#3E9EFF' : 'var(--text)' }}>{operand}</div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>{valueLabel}</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontStyle: 'italic' }}>{detail}</div>
      </div>
    </div>
  );
}

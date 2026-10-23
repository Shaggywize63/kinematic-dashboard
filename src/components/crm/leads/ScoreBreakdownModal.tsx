'use client';
import { ArrowRight, X } from 'lucide-react';
import type { Lead } from '../../../types/crm';
import { breakdownFactors, llmAdjustmentOf } from '../../../lib/crm/scoreFactors';
import { Button, Eyebrow, IconButton, T } from '../../ui';

/** Full score explanation — every factor behind a lead's score. Opened from the score cell and the preview panel. */
export default function ScoreBreakdownModal({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const breakdown = (lead as { score_breakdown?: Record<string, number> | null }).score_breakdown;
  const score = lead.score ?? 0;
  const grade = lead.score_grade;

  // Label dict + sorting live in lib/crm/scoreFactors.ts so the leads list
  // popup and the dashboard map popup stay in lock-step.
  const factors = breakdownFactors(breakdown);
  const llmAdjustment = llmAdjustmentOf(breakdown);
  const scoreColor = score >= 70 ? T.ok : score >= 40 ? T.warn : T.red;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lead score explanation"
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, boxShadow: 'var(--shadow-pop)', maxWidth: 480, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ minWidth: 0 }}>
            <Eyebrow>Lead score</Eyebrow>
            <div style={{ fontFamily: T.heading, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, marginTop: 4 }}>{lead.full_name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email || 'Lead'}</div>
          </div>
          <IconButton label="Close" onClick={onClose}><X size={18} strokeWidth={1.6} /></IconButton>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: 14, background: 'var(--s3)', borderRadius: T.radius.md }}>
            <div style={{ fontFamily: T.heading, fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>{score}</div>
            <div>
              <Eyebrow>Total score / 100</Eyebrow>
              {grade && <div style={{ fontSize: 13, color: T.text, marginTop: 4 }}>Grade <span style={{ fontFamily: T.mono }}>{grade}</span></div>}
            </div>
          </div>

          <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>
            Score is computed from a heuristic model that weighs key lead attributes. Higher scores indicate hotter leads worth prioritising first.
          </div>

          {factors.length === 0 ? (
            <div style={{ padding: 16, background: 'var(--s3)', borderRadius: T.radius.md, fontSize: 13, color: T.dim, textAlign: 'center' }}>
              No detailed breakdown available yet. Click <em>Rescore</em> on the lead detail page to compute one.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {factors.map(({ key, label, value }) => {
                const max = Math.max(20, ...factors.map((f) => f.value));
                const pct = Math.max(0, Math.min(100, (value / max) * 100));
                const color = value >= 15 ? T.ok : value >= 8 ? T.warn : T.info;
                return (
                  <div key={key} style={{ background: 'var(--s3)', borderRadius: T.radius.md, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: T.text }}>{label}</span>
                      <span style={{ fontSize: 12, color, fontFamily: T.mono }}>+{value}</span>
                    </div>
                    <div style={{ height: 5, background: T.rule, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {llmAdjustment != null && llmAdjustment !== 0 && (
            <div style={{ fontSize: 12.5, color: T.dim, display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--s3)', borderRadius: T.radius.md }}>
              <span>AI rerank adjustment</span>
              <span style={{ fontFamily: T.mono, color: llmAdjustment > 0 ? T.ok : T.red }}>{llmAdjustment > 0 ? '+' : ''}{llmAdjustment}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" href={`/dashboard/crm/leads/${lead.id}`} icon={<ArrowRight size={16} strokeWidth={2} />}>View lead</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

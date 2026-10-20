'use client';
import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { LeadScore } from '../../../types/crm';
import { breakdownFactors, llmAdjustmentOf } from '../../../lib/crm/scoreFactors';
import { Button, Card, T } from '../../ui';
import AiBadge from '../shared/AiBadge';
import { inferGrade } from '../leads/ScoreMeter';
import ScoreRing, { GRADE_COLORS } from './ScoreRing';
import type { LifecycleLead } from './types';

interface Row { key: string; label: string; value: number; detail?: string }

const GRADE_NOTE: Record<string, string> = {
  A: 'Hot lead — strong fit and engagement. Work it first.',
  B: 'Warm — a good prospect that needs a nudge.',
  C: 'Lukewarm — more contact or detail would help.',
  D: 'Cold — nurture before investing time.',
};

/**
 * Compact "why this score" card for the side rail. Shows the factors from the last re-score when
 * there is one, otherwise the breakdown persisted on the lead — so a lead that was scored in the
 * background still explains itself without a manual Re-score.
 */
export default function ScoreCard({ lead, score, scoring, onRescore }: { lead: LifecycleLead; score: LeadScore | null; scoring: boolean; onRescore: () => void }) {
  const [all, setAll] = useState(false);
  const value = score?.score ?? lead.score ?? null;
  const grade = inferGrade(value, score?.grade ?? lead.score_grade ?? null);

  const rows = useMemo<Row[]>(() => {
    if (score?.factors?.length) {
      return score.factors
        .map((f) => ({ key: f.factor, label: f.factor, value: Math.round(f.contribution), detail: f.detail }))
        .filter((r) => r.value !== 0)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    }
    return breakdownFactors(lead.score_breakdown).filter((f) => f.value !== 0).map((f) => ({ key: f.key, label: f.label, value: f.value }));
  }, [score, lead.score_breakdown]);
  const llm = score ? null : llmAdjustmentOf(lead.score_breakdown);

  const shown = all ? rows : rows.slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));

  return (
    <Card padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>Lead score</h2>
          <AiBadge />
        </div>
        <Button size="sm" onClick={onRescore} disabled={scoring} icon={<RefreshCw size={13} strokeWidth={1.9} className={scoring ? 'km-spin' : undefined} aria-hidden />}>
          {scoring ? 'Scoring…' : 'Re-score'}
        </Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ScoreRing score={value} grade={grade} size={64} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: grade ? GRADE_COLORS[grade] : T.dim }}>{grade ? `Grade ${grade}` : 'Not scored yet'}</div>
          <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.45, marginTop: 2 }}>{grade ? GRADE_NOTE[grade] : 'Press Re-score to compute a score and see why.'}</div>
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {shown.map((r) => (
            <div key={r.key} title={r.detail}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                <span style={{ color: T.text, minWidth: 0, overflowWrap: 'anywhere' }}>{r.label}</span>
                <span style={{ fontFamily: T.mono, fontWeight: 650, color: r.value < 0 ? T.red : T.ok, flexShrink: 0 }}>{r.value > 0 ? '+' : ''}{r.value}</span>
              </div>
              <div aria-hidden style={{ marginTop: 4, height: 4, borderRadius: 2, background: 'var(--s4)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.round((Math.abs(r.value) / max) * 100)}%`, height: '100%', background: r.value < 0 ? T.red : T.ok, borderRadius: 2 }} />
              </div>
            </div>
          ))}
          {llm != null && llm !== 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, paddingTop: 4, borderTop: `1px solid ${T.border}` }}>
              <span style={{ color: T.text }}>AI adjustment</span>
              <span style={{ fontFamily: T.mono, fontWeight: 650, color: llm < 0 ? T.red : T.ok }}>{llm > 0 ? '+' : ''}{llm}</span>
            </div>
          )}
          {rows.length > 5 && (
            <button type="button" onClick={() => setAll((v) => !v)} style={{ alignSelf: 'flex-start', background: 'none', border: 0, padding: 0, color: T.red, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {all ? 'Show fewer' : `Show all ${rows.length} factors`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

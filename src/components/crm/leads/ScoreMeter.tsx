'use client';
import { T } from '../../ui';

const GRADE_COLORS: Record<string, string> = { A: '#28B463', B: '#7B61FF', C: '#F7B538', D: '#E01E2C' };

export function inferGrade(score?: number | null, grade?: 'A' | 'B' | 'C' | 'D' | null): 'A' | 'B' | 'C' | 'D' | null {
  if (grade) return grade;
  if (score == null) return null;
  return score >= 75 ? 'A' : score >= 50 ? 'B' : score >= 25 ? 'C' : 'D';
}

/** Grade chip + number + a thin bar, so a column of scores can be scanned at a glance. */
export default function ScoreMeter({ score, grade, bar = true }: { score?: number | null; grade?: 'A' | 'B' | 'C' | 'D' | null; bar?: boolean }) {
  const g = inferGrade(score, grade);
  const color = g ? GRADE_COLORS[g] : T.mute;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, Math.round(score)));
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {g && (
        <span style={{ minWidth: 22, height: 22, padding: '0 6px', borderRadius: 6, background: `${color}1F`, color, fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{g}</span>
      )}
      <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 600, color: T.text, minWidth: 22 }}>{score == null ? '—' : Math.round(score)}</span>
      {bar && score != null && (
        <span aria-hidden style={{ width: 34, height: 4, borderRadius: 2, background: T.rule, overflow: 'hidden', flexShrink: 0 }}>
          <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
        </span>
      )}
    </span>
  );
}

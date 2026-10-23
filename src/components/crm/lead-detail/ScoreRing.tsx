'use client';
import { T } from '../../ui';
import { inferGrade } from '../leads/ScoreMeter';

export const GRADE_COLORS: Record<string, string> = { A: '#28B463', B: '#7B61FF', C: '#F7B538', D: '#E01E2C' };

/** Circular score gauge with the number in the middle; the arc takes the grade's colour. */
export default function ScoreRing({ score, grade, size = 56, label = true }: { score?: number | null; grade?: 'A' | 'B' | 'C' | 'D' | null; size?: number; label?: boolean }) {
  const g = inferGrade(score, grade);
  const color = g ? GRADE_COLORS[g] : T.mute;
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <span role="img" aria-label={score == null ? 'No score yet' : `Score ${Math.round(score)}${g ? `, grade ${g}` : ''}`} style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--s4)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ transition: 'stroke-dashoffset .5s ease' }} />
      </svg>
      <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
        <span style={{ fontFamily: T.heading, fontSize: Math.round(size * 0.31), fontWeight: 800, color: T.text }}>{score == null ? '—' : Math.round(score)}</span>
        {label && size >= 52 && <span style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: '0.1em', color: T.mute, marginTop: 2 }}>SCORE</span>}
      </span>
    </span>
  );
}

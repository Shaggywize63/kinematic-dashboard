'use client';
// The six steps of a pay run, shown as a stepper. Any step can be opened; the badge says which one comes next.

import { T } from '../ui';
import type { PayRunStatus } from '../../../lib/hrms/types';

export const STEPS = ['inputs', 'checks', 'compute', 'review', 'freeze', 'pay'] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = { inputs: 'Inputs', checks: 'Checks', compute: 'Compute', review: 'Review', freeze: 'Freeze', pay: 'Pay' };

/** Which steps the run's status says are finished, and which one to do next. */
export function stepProgress(status: PayRunStatus): { done: Step[]; next: Step } {
  switch (status) {
    case 'draft': return { done: [], next: 'inputs' };
    case 'computed': return { done: ['inputs', 'checks', 'compute'], next: 'review' };
    case 'frozen': return { done: ['inputs', 'checks', 'compute', 'review', 'freeze'], next: 'pay' };
    default: return { done: [...STEPS], next: 'pay' };
  }
}

export default function RunStepper({ status, value, onChange }: { status: PayRunStatus; value: Step; onChange: (s: Step) => void }) {
  const { done, next } = stepProgress(status);
  return (
    <nav aria-label="Pay run steps" style={{ overflowX: 'auto' }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(6, minmax(112px, 1fr))', gap: 8, minWidth: 700 }}>
        {STEPS.map((s, i) => {
          const isDone = done.includes(s);
          const active = s === value;
          return (
            <li key={s}>
              <button type="button" onClick={() => onChange(s)} aria-current={active ? 'step' : undefined} data-step={s}
                style={{
                  width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  borderRadius: T.radius.md, border: `1px solid ${active ? T.red : T.border}`, background: active ? T.redWash : T.card, color: T.text,
                }}>
                <span aria-hidden style={{
                  width: 26, height: 26, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700,
                  background: isDone ? T.ok : active ? T.red : T.raised, color: isDone || active ? '#fff' : T.dim,
                }}>{isDone ? <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-10" /></svg> : i + 1}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{STEP_LABEL[s]}</span>
                  <span style={{ fontSize: 11.5, color: isDone ? T.ok : s === next ? T.info : T.mute }}>{isDone ? 'Done' : s === next ? 'Next' : 'Waiting'}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

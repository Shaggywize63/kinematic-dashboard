'use client';
import { Check } from 'lucide-react';
import type { LeadStatusOption } from '../../../lib/crmLeadStatuses';
import { T } from '../../ui';

interface Step { value: string; label: string; color?: string; won?: boolean }

const DEFAULT_STEPS: Step[] = [
  { value: 'new', label: 'New' },
  { value: 'working', label: 'Working' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'converted', label: 'Converted', won: true },
];

/**
 * Where the lead is in its journey, and one click to move it. The steps are the
 * client's own statuses when they configured a set (minus "lost" outcomes),
 * otherwise New → Working → Qualified → Converted. Reaching the final step goes
 * through the Convert flow — it needs a deal / account choice, not just a PATCH.
 */
export default function JourneyStepper({
  status, custom, outcome, busy, onSelect, onConvert,
}: {
  status?: string | null;
  custom: LeadStatusOption[] | null;
  /** Set when the lead was closed out as lost / unqualified — no step is "current". */
  outcome: 'lost' | 'unqualified' | null;
  busy: boolean;
  onSelect: (value: string) => void;
  onConvert: () => void;
}) {
  const s = (status || 'new').toLowerCase();
  const steps: Step[] = custom
    ? custom.filter((o) => !o.is_lost).map((o) => ({ value: o.value, label: o.label, color: o.color, won: !!o.is_won }))
    : DEFAULT_STEPS;
  if (steps.length < 2) return null;

  let current = steps.findIndex((st) => st.value === s);
  if (current < 0 && s === 'nurturing') current = steps.findIndex((st) => st.value === 'working');
  if (current < 0) current = outcome ? -1 : 0;
  const finished = steps[current]?.won === true || s === 'converted';
  // A converted lead has walked every step.
  if (finished) current = steps.length - 1;

  return (
    <nav aria-label="Lead journey" style={{ overflowX: 'auto', paddingBottom: 2 }}>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'flex-start', minWidth: steps.length * 92 }}>
        {steps.map((st, i) => {
          const done = current > i || (finished && i === current);
          const isCurrent = current === i && !finished;
          const clickable = !outcome ? !isCurrent && !finished : false;
          const accent = st.color || (st.won ? T.ok : T.red);
          const dot = (
            <span
              aria-hidden
              style={{
                width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: done ? accent : isCurrent ? 'var(--card)' : 'var(--s3)',
                border: `2px solid ${done || isCurrent ? accent : 'var(--border-l)'}`,
                color: '#fff', transition: 'background .15s ease, border-color .15s ease',
                boxShadow: isCurrent ? `0 0 0 4px color-mix(in srgb, ${accent} 18%, transparent)` : 'none',
              }}
            >
              {done ? <Check size={13} strokeWidth={3} /> : isCurrent ? <span style={{ width: 8, height: 8, borderRadius: 999, background: accent }} /> : null}
            </span>
          );
          const label = (
            <span style={{ fontSize: 12.5, fontWeight: isCurrent ? 700 : 600, color: isCurrent ? T.text : done ? T.text : T.mute, whiteSpace: 'nowrap' }}>{st.label}</span>
          );
          return (
            <li key={st.value} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', position: 'relative' }}>
              {/* Connector to the next step — filled once this step is behind us. */}
              {i < steps.length - 1 && (
                <span aria-hidden style={{ position: 'absolute', top: 10, left: 28, right: 6, height: 2, borderRadius: 2, background: current > i ? accent : 'var(--s4)' }} />
              )}
              {clickable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (st.won ? onConvert() : onSelect(st.value))}
                  title={st.won ? 'Convert this lead' : `Move to ${st.label}`}
                  className="km-iconbtn"
                  style={{ background: 'transparent', border: 0, padding: '0 6px 0 0', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', borderRadius: 6, position: 'relative' }}
                >
                  {dot}{label}
                </button>
              ) : (
                <span aria-current={isCurrent ? 'step' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '0 6px 0 0', position: 'relative' }}>
                  {dot}{label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

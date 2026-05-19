'use client';
import { useMemo } from 'react';
import type { Stage } from '../../types/crm';

interface Props {
  stages: Stage[];
  currentStageId: string;
  /** Days the deal has been in the current stage (drives the badge). */
  daysInStage?: number;
  /** Days remaining to expected close (positive) or overdue (negative). */
  daysToClose?: number | null;
  /** Click handler for moving to a different stage. Undefined = read-only. */
  onMove?: (stageId: string) => void;
  /** Called when the "Mark Complete" button is tapped. Promotes to next open stage. */
  onMarkComplete?: () => void;
}

/**
 * Salesforce-Path-style breadcrumb for deal stages, with a few upgrades:
 *   1. Chevron shape via CSS clip-path so the eye reads left → right flow.
 *   2. Past stages: light-green tick-stamped. Current: brand-red with
 *      live days-in-stage chip. Future: muted grey.
 *   3. "Mark Stage Complete" button on the right that auto-advances to
 *      the next OPEN stage. Stops at the last open stage; the rep uses
 *      the dedicated Close Deal dialog to mark won/lost (carries the
 *      reason capture).
 *   4. Hover any stage → its name + index appear in a tooltip; click any
 *      to jump (with confirmation handled by the page).
 *   5. Days-to-close summary tile on the right when expected_close_date
 *      is set — turns amber under 7d, red when overdue.
 *
 * "Better than Salesforce" specifically: SF's path doesn't surface
 * days-in-stage inline, requires page reload on stage move, and the
 * Mark-Complete button doesn't account for the "skipping a stage"
 * case (we honour gaps and just advance to the next non-skipped open
 * stage).
 */
export default function DealStageProgress({
  stages,
  currentStageId,
  daysInStage,
  daysToClose,
  onMove,
  onMarkComplete,
}: Props) {
  const sorted = useMemo(() => [...stages].sort((a, b) => a.position - b.position), [stages]);
  const currentIdx = sorted.findIndex((s) => s.id === currentStageId);
  const isClosedStage = currentIdx >= 0 && sorted[currentIdx]?.stage_type !== 'open';

  // Next open stage after the current one. Used by Mark Complete.
  const nextOpenIdx = useMemo(() => {
    for (let i = currentIdx + 1; i < sorted.length; i++) {
      if (sorted[i].stage_type === 'open') return i;
    }
    return -1;
  }, [sorted, currentIdx]);

  if (sorted.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, gap: 0, overflowX: 'auto' }}>
        {sorted.map((s, i) => {
          const reached = i < currentIdx;
          const current = i === currentIdx;
          const isWon = s.stage_type === 'won';
          const isLost = s.stage_type === 'lost';

          const palette = current
            ? { bg: 'var(--primary)', fg: '#fff', sub: 'rgba(255,255,255,0.85)' }
            : isWon && reached
              ? { bg: 'rgba(16,185,129,0.18)', fg: '#10b981', sub: '#10b981' }
              : isLost && reached
                ? { bg: 'rgba(239,68,68,0.14)', fg: '#ef4444', sub: '#ef4444' }
                : reached
                  ? { bg: 'rgba(40,180,99,0.18)', fg: 'var(--green, #10b981)', sub: 'var(--text-dim)' }
                  : { bg: 'transparent', fg: 'var(--text-dim)', sub: 'var(--text-dim)' };

          // Chevron clip-path: pointed right except for the last stage
          // (which is flush-right rectangular). First stage gets a flush
          // left edge so the row reads as one connected path.
          const isFirst = i === 0;
          const isLast = i === sorted.length - 1;
          const clip = isLast
            ? `polygon(${isFirst ? '0% 0%' : '12px 0%'}, 100% 0%, 100% 100%, ${isFirst ? '0% 100%' : '12px 100%'}, 0% 50%)`
            : `polygon(${isFirst ? '0% 0%' : '12px 0%'}, calc(100% - 12px) 0%, 100% 50%, calc(100% - 12px) 100%, ${isFirst ? '0% 100%' : '12px 100%'}, 0% 50%)`;

          return (
            <button
              key={s.id}
              onClick={() => onMove && onMove(s.id)}
              disabled={!onMove || current}
              title={`Stage ${i + 1} of ${sorted.length}: ${s.name}`}
              style={{
                flex: '1 1 0',
                minWidth: 110,
                position: 'relative',
                padding: `10px ${isLast ? 14 : 22}px 10px ${isFirst ? 14 : 22}px`,
                marginRight: isLast ? 0 : -10, // overlap so chevrons interlock
                background: palette.bg,
                color: palette.fg,
                border: 'none',
                cursor: onMove && !current ? 'pointer' : 'default',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                clipPath: clip,
                WebkitClipPath: clip,
                transition: 'background 0.15s',
                lineHeight: 1.2,
                textAlign: 'center',
              }}>
              <div>
                {reached && !isLost && <span style={{ marginRight: 4, fontSize: 10 }}>✓</span>}
                {isLost && reached && <span style={{ marginRight: 4, fontSize: 10 }}>✗</span>}
                {s.name}
              </div>
              {current && typeof daysInStage === 'number' && (
                <div style={{ fontSize: 9, marginTop: 3, opacity: 0.92, fontWeight: 800, letterSpacing: 0.3 }}>
                  {daysInStage === 0 ? 'today' : `${daysInStage}d in stage`}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Right-side: days-to-close + Mark Complete */}
      {(daysToClose != null || (onMarkComplete && !isClosedStage && nextOpenIdx > -1)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {daysToClose != null && (
            <div title={daysToClose < 0 ? 'Past expected close date' : 'Days remaining to expected close'} style={{
              padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
              background: daysToClose < 0 ? 'rgba(239,68,68,0.12)' : daysToClose < 7 ? 'rgba(245,158,11,0.14)' : 'var(--s3)',
              color: daysToClose < 0 ? '#ef4444' : daysToClose < 7 ? '#f59e0b' : 'var(--text-dim)',
              border: `1px solid ${daysToClose < 0 ? '#ef4444' : daysToClose < 7 ? '#f59e0b' : 'var(--border)'}`,
              whiteSpace: 'nowrap',
            }}>
              {daysToClose < 0 ? `${Math.abs(daysToClose)}d overdue` : daysToClose === 0 ? 'closes today' : `${daysToClose}d to close`}
            </div>
          )}
          {onMarkComplete && !isClosedStage && nextOpenIdx > -1 && (
            <button onClick={onMarkComplete}
              title={`Advance to ${sorted[nextOpenIdx].name}`}
              style={{
                background: 'var(--primary)', border: 'none', color: '#fff',
                padding: '8px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
              }}>
              ✓ Mark Complete → {sorted[nextOpenIdx].name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

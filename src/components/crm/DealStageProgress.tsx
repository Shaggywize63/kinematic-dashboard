'use client';
import React, { useMemo } from 'react';
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
 * Stage progress breadcrumb — flat rounded pills connected by chevron
 * arrows. Replaces the previous CSS clip-path chevron which suffered
 * from text-overlap on both desktop and mobile at narrow widths.
 *
 *   [✓ Discovery]  ›  [✓ Qualified]  ›  [Proposal]  ›  [Negotiation]  ›  [Closed Won]
 *      (green)         (blue current)        (grey future)
 *
 * Past pills carry a tinted green background + check. Current pill is
 * solid Kinematic blue. Future pills are quiet grey outlines. Won/Lost
 * terminal stages use their semantic colours when reached. The whole
 * row scrolls horizontally on overflow inside its own container, so the
 * page never needs to scroll sideways because of the breadcrumb.
 */
export default function DealStageProgress({
  stages,
  currentStageId,
  daysInStage,
  daysToClose,
  onMove,
  onMarkComplete,
}: Props) {
  const sorted = useMemo(() => {
    const list = Array.isArray(stages) ? stages.filter(Boolean) : [];
    const seen = new Set<string>();
    const unique: Stage[] = [];
    for (const s of list) {
      if (s?.id && typeof s.id === 'string') {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
      }
      unique.push(s);
    }
    return unique.sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0));
  }, [stages]);

  const currentIdx = sorted.findIndex((s) => s.id === currentStageId);
  const current = currentIdx >= 0 ? sorted[currentIdx] : null;
  const isClosedStage = current ? current.stage_type !== 'open' : false;

  const nextOpenIdx = useMemo(() => {
    for (let i = currentIdx + 1; i < sorted.length; i++) {
      if (sorted[i].stage_type === 'open') return i;
    }
    return -1;
  }, [sorted, currentIdx]);

  if (sorted.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Subtitle row: current stage spelled out so reps don't have to
          scan the pills. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>
          Stage progress
        </span>
        {current ? (
          <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 700, minWidth: 0, wordBreak: 'break-word' }}>
            Currently in: <span style={{ color: '#3E9EFF' }}>{current.name}</span>
            {typeof daysInStage === 'number' && (
              <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-dim)', fontWeight: 600 }}>
                · {daysInStage === 0 ? 'today' : `${daysInStage}d in stage`}
              </span>
            )}
          </span>
        ) : (
          <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700 }}>
            ⚠ Current stage is not in this pipeline — pick a valid stage below.
          </span>
        )}
      </div>

      {/* Pills row — horizontally scrolls on overflow, never wraps. */}
      <div className="stage-pill-row" style={{
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap',
        overflowX: 'auto', overflowY: 'hidden',
        padding: '2px 0',
      }}>
        {sorted.map((s, i) => {
          const reached = i < currentIdx;
          const isCurrent = i === currentIdx;
          const isWon = s.stage_type === 'won';
          const isLost = s.stage_type === 'lost';
          const isLast = i === sorted.length - 1;

          // Pill palette. Current is solid blue. Reached open stages
          // are tinted green. Reached terminal stages use their
          // semantic colour. Future stages are quiet grey outlines.
          const palette = isCurrent
            ? { bg: '#3E9EFF', fg: '#ffffff', border: '#3E9EFF' }
            : isWon && reached
              ? { bg: 'rgba(16,185,129,0.18)', fg: '#10b981', border: 'rgba(16,185,129,0.4)' }
              : isLost && reached
                ? { bg: 'rgba(239,68,68,0.16)', fg: '#ef4444', border: 'rgba(239,68,68,0.4)' }
                : reached
                  ? { bg: 'rgba(16,185,129,0.14)', fg: '#10b981', border: 'rgba(16,185,129,0.32)' }
                  : { bg: 'transparent', fg: 'var(--text-dim)', border: 'var(--border)' };

          return (
            <React.Fragment key={s.id || i}>
              <button
                className="stage-pill"
                onClick={() => onMove && onMove(s.id)}
                disabled={!onMove || isCurrent}
                title={`Stage ${i + 1} of ${sorted.length}: ${s.name || '(unnamed)'}`}
                style={{
                  background: palette.bg,
                  color: palette.fg,
                  border: `1px solid ${palette.border}`,
                  padding: '7px 14px',
                  borderRadius: 999,
                  fontSize: 11.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  cursor: onMove && !isCurrent ? 'pointer' : 'default',
                  whiteSpace: 'nowrap',
                  flex: '0 0 auto',
                  transition: 'transform 0.15s ease, background 0.15s ease',
                  boxShadow: isCurrent ? '0 4px 14px rgba(62,158,255,0.32)' : 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  lineHeight: 1.1,
                }}>
                {reached && !isLost && <span style={{ fontSize: 10 }}>✓</span>}
                {isLost && reached && <span style={{ fontSize: 10 }}>✗</span>}
                <span>{s.name || `Stage ${i + 1}`}</span>
              </button>
              {!isLast && (
                <span aria-hidden style={{
                  color: 'var(--text-dim)',
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1,
                  flexShrink: 0,
                  userSelect: 'none',
                  opacity: 0.55,
                }}>›</span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Right-side actions — days-to-close pill + Mark Complete. */}
      {(daysToClose != null || (onMarkComplete && !isClosedStage && nextOpenIdx > -1)) && (
        <div className="stage-chevron-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {daysToClose != null && (
            <div title={daysToClose < 0 ? 'Past expected close date' : 'Days remaining to expected close'} style={{
              padding: '5px 11px', borderRadius: 999, fontSize: 11, fontWeight: 700,
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
                background: '#3E9EFF', border: 'none', color: '#fff',
                padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(62,158,255,0.28)',
              }}>
              ✓ Mark Complete → {sorted[nextOpenIdx].name}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

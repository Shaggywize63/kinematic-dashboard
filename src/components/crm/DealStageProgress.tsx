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
 * Salesforce-Path-style chevron breadcrumb. On phones (≤640px) the
 * `globals.css` rules under .stage-chevron-{row,btn,action} squeeze
 * padding, min-width, and font-size down so the path stays usable on
 * a 360px viewport — text-overflow ellipsis kicks in for long names
 * and the path scrolls horizontally inside its own container.
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6 }}>
          Stage progress
        </span>
        {current ? (
          <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, minWidth: 0, wordBreak: 'break-word' }}>
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

      <div className="stage-chevron-row" style={{
        background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10,
        padding: 4, overflowX: 'auto', overflowY: 'hidden',
      }}>
        <div style={{ display: 'flex', flexWrap: 'nowrap', minWidth: '100%' }}>
          {sorted.map((s, i) => {
            const reached = i < currentIdx;
            const isCurrent = i === currentIdx;
            const isWon = s.stage_type === 'won';
            const isLost = s.stage_type === 'lost';

            const palette = isCurrent
              ? { bg: '#3E9EFF', fg: '#ffffff' }
              : isWon && reached
                ? { bg: 'rgba(16,185,129,0.20)', fg: '#10b981' }
                : isLost && reached
                  ? { bg: 'rgba(239,68,68,0.16)', fg: '#ef4444' }
                  : reached
                    ? { bg: 'rgba(16,185,129,0.18)', fg: '#10b981' }
                    : { bg: 'transparent', fg: 'var(--text-dim)' };

            const isFirst = i === 0;
            const isLast = i === sorted.length - 1;
            const clip = isLast
              ? `polygon(${isFirst ? '0% 0%' : '14px 0%'}, 100% 0%, 100% 100%, ${isFirst ? '0% 100%' : '14px 100%'}, 0% 50%)`
              : `polygon(${isFirst ? '0% 0%' : '14px 0%'}, calc(100% - 14px) 0%, 100% 50%, calc(100% - 14px) 100%, ${isFirst ? '0% 100%' : '14px 100%'}, 0% 50%)`;

            return (
              <button
                key={s.id}
                className="stage-chevron-btn"
                onClick={() => onMove && onMove(s.id)}
                disabled={!onMove || isCurrent}
                title={`Stage ${i + 1} of ${sorted.length}: ${s.name}`}
                style={{
                  flex: '1 1 0',
                  minWidth: 140,
                  position: 'relative',
                  padding: `12px ${isLast ? 16 : 26}px 12px ${isFirst ? 16 : 26}px`,
                  marginRight: isLast ? 0 : -12,
                  background: palette.bg,
                  color: palette.fg,
                  border: 'none',
                  cursor: onMove && !isCurrent ? 'pointer' : 'default',
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  clipPath: clip,
                  WebkitClipPath: clip,
                  transition: 'background 0.15s',
                  lineHeight: 1.2,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'middle' }}>
                  {reached && !isLost && <span style={{ marginRight: 4, fontSize: 10 }}>✓</span>}
                  {isLost && reached && <span style={{ marginRight: 4, fontSize: 10 }}>✗</span>}
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {(daysToClose != null || (onMarkComplete && !isClosedStage && nextOpenIdx > -1)) && (
        <div className="stage-chevron-actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {daysToClose != null && (
            <div title={daysToClose < 0 ? 'Past expected close date' : 'Days remaining to expected close'} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
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
                padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 800,
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

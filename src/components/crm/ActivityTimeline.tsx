'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Activity } from '../../types/crm';
import { format, formatDistanceToNow } from 'date-fns';
import { crmActivities } from '../../lib/crmApi';

// Date + time in user-readable form. Falls back to '' on bad input so
// the row still renders.
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  try { return format(new Date(iso), 'd MMM yyyy, h:mm a'); } catch { return ''; }
}

const ICONS: Record<string, string> = { call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝', sms: '💬', whatsapp: '💚' };

const STATUS_COLORS: Record<string, string> = {
  open: '#6366f1', planned: '#6366f1', in_progress: '#f59e0b',
  completed: '#10b981', done: '#10b981', cancelled: '#9ca3af',
};

interface Props {
  activities: Activity[];
  onChange?: () => void;
}

export default function ActivityTimeline({ activities, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const updateStatus = async (a: Activity, status: string) => {
    setBusyId(a.id);
    try {
      const payload: Record<string, unknown> = { status };
      if (status === 'completed' || status === 'done') {
        payload.completed_at = new Date().toISOString();
      }
      await crmActivities.update(a.id, payload as any);
      toast.success(`Marked ${status.replace('_', ' ')}`);
      onChange?.();
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  // Hard-delete affordance — backend wires DELETE /api/v1/crm/activities/:id
  // to crud.softDelete so the row is recoverable from the DB if needed. Guard
  // with a confirm() so an accidental click on the small ✕ doesn't nuke data.
  const removeActivity = async (a: Activity) => {
    if (!confirm('Delete this activity?')) return;
    setBusyId(a.id);
    try {
      await crmActivities.remove(a.id);
      toast.success('Activity deleted');
      onChange?.();
    } catch (e: any) {
      toast.error(e.message || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  if (!activities.length) return <div style={{ color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>No activities yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {activities.map((a) => {
        const status = (a as any).status as string | undefined;
        const isCompleted = status === 'completed' || status === 'done' || !!a.completed_at;
        const statusColor = status ? (STATUS_COLORS[status] || 'var(--text-dim)') : 'var(--text-dim)';
        const showActions = !!onChange;
        return (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, borderLeft: `4px solid ${statusColor}`, position: 'relative' }}>
            <div style={{ fontSize: 18 }}>{ICONS[a.type] || '•'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>
                    {a.subject || a.type}
                    {status && (
                      <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--s2)', color: statusColor, textTransform: 'uppercase' }}>
                        {status}
                      </span>
                    )}
                  </div>
                  {a.body && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{a.body}</div>}
                  {a.image_url && (
                    /* Thumbnail click → opens full-size in a new tab. No URL
                       text shown — the image IS the visible affordance. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <a href={a.image_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                      <img src={a.image_url} alt="Activity photo" style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', display: 'block' }} />
                    </a>
                  )}
                  {a.owner_name && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>by {a.owner_name}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {(() => {
                    // Prefer completed_at for past activities, fall back to
                    // due_at for upcoming. Show full date+time so users see
                    // the exact moment, not just "in 3h".
                    const when = a.completed_at || a.due_at;
                    if (!when) return '';
                    const full = fmtDateTime(when);
                    const rel = (() => { try { return formatDistanceToNow(new Date(when), { addSuffix: true }); } catch { return ''; } })();
                    return (
                      <>
                        <div>{full}</div>
                        {rel && <div style={{ marginTop: 2, opacity: 0.7 }}>{rel}</div>}
                      </>
                    );
                  })()}
                </div>
              </div>

              {showActions && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {!isCompleted && (
                    <button onClick={() => updateStatus(a, 'completed')} disabled={busyId === a.id} style={btnGreen}>
                      ✓ Mark Complete
                    </button>
                  )}
                  {status !== 'in_progress' && !isCompleted && (
                    <button onClick={() => updateStatus(a, 'in_progress')} disabled={busyId === a.id} style={btnAmber}>
                      ▶ In Progress
                    </button>
                  )}
                  {isCompleted && (
                    <button onClick={() => updateStatus(a, 'open')} disabled={busyId === a.id} style={btnGhost}>
                      ↺ Reopen
                    </button>
                  )}
                  {status !== 'cancelled' && !isCompleted && (
                    <button onClick={() => updateStatus(a, 'cancelled')} disabled={busyId === a.id} style={btnGray}>
                      ✕ Cancel
                    </button>
                  )}
                </div>
              )}
            </div>
            {/* Delete affordance — small ✕ in top-right corner of the row. Only
                rendered when onChange is provided so read-only embeds (e.g.
                printable views) stay clean. */}
            {showActions && (
              <button
                onClick={() => removeActivity(a)}
                disabled={busyId === a.id}
                title="Delete activity"
                aria-label="Delete activity"
                style={btnDelete}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const btnBase: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent' };
const btnGreen: React.CSSProperties = { ...btnBase, border: '1px solid #10b981', color: '#10b981' };
const btnAmber: React.CSSProperties = { ...btnBase, border: '1px solid #f59e0b', color: '#f59e0b' };
const btnGhost: React.CSSProperties = { ...btnBase, border: '1px solid var(--border)', color: 'var(--text-dim)' };
const btnGray: React.CSSProperties = { ...btnBase, border: '1px solid var(--text-dim)', color: 'var(--text-dim)' };
const btnDelete: React.CSSProperties = {
  position: 'absolute', top: 8, right: 8,
  width: 22, height: 22, padding: 0,
  borderRadius: 4, border: '1px solid transparent',
  background: 'transparent', color: 'var(--text-dim)',
  fontSize: 12, lineHeight: 1, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

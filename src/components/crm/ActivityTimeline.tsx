'use client';
import { Fragment, useState } from 'react';
import Link from 'next/link';
import SignedImage, { openSignedUrl } from '@/components/shared/SignedImage';
import { toast } from 'sonner';
import type { Activity } from '../../types/crm';
import { format, formatDistanceToNow } from 'date-fns';
import { crmActivities } from '../../lib/crmApi';
import { ActivityTypeIcon } from './shared/ActivityTypeIcon';

// Date + time in user-readable form. Falls back to '' on bad input so
// the row still renders.
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  try { return format(new Date(iso), 'd MMM yyyy, h:mm a'); } catch { return ''; }
}

// Emoji fallback table — kept for non-WhatsApp types. WhatsApp now
// renders via the shared <ActivityTypeIcon> SVG (real brand mark) since
// "💚" doesn't read as WhatsApp to anyone.
const ICONS: Record<string, string> = { call: '📞', email: '✉️', meeting: '📅', task: '✅', note: '📝', sms: '💬' };

const STATUS_COLORS: Record<string, string> = {
  open: '#6366f1', planned: '#6366f1', in_progress: '#f59e0b',
  completed: '#10b981', done: '#10b981', cancelled: '#9ca3af',
};

// Friendly labels for the telecaller call-feedback custom fields (phase 1 +
// phase 2 campaigns) so the captured feedback reads well on the timeline;
// any other key falls back to a humanised form.
const ACT_FIELD_LABELS: Record<string, string> = {
  app_download_date: 'App Download Date', digigold_explained: 'DigiGold Explained',
  gold_scheme_explained: 'Gold Scheme Explained', app_rating: 'App Rating',
  bugs_reported: 'Issues / Bugs', feature_requests: 'Feature Requests',
  product_satisfaction: 'Product Satisfaction', staff_behaviour: 'Staff Behaviour',
  billing_experience: 'Billing Experience', after_sales_service: 'After-Sales Service',
  customer_rating: 'Customer Rating', complaint: 'Complaint / Issue',
  complaint_priority: 'Complaint Priority', resolution_required: 'Resolution Required',
  next_purchase_interest: 'Next Purchase Interest', referral_potential: 'Referral Potential',
};
const humanizeKey = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Render an activity's custom_fields (the telecaller campaign feedback) as a
// compact label/value grid. Skips empty values and nested objects.
export function ActivityFields({ cf }: { cf: unknown }) {
  if (!cf || typeof cf !== 'object') return null;
  const entries = Object.entries(cf as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object');
  if (!entries.length) return null;
  return (
    <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', fontSize: 11 }}>
      {entries.map(([k, v]) => (
        <Fragment key={k}>
          <span style={{ color: 'var(--text-dim)', fontWeight: 700 }}>{ACT_FIELD_LABELS[k] || humanizeKey(k)}</span>
          <span style={{ color: 'var(--text)' }}>{typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)}</span>
        </Fragment>
      ))}
    </div>
  );
}

interface Props {
  activities: Activity[];
  onChange?: () => void;
  // When set, an "+ Add activity" button links to the Log-Activity form
  // prefilled for this record (e.g. /dashboard/crm/activities/new?lead_id=X).
  // Lets users log an activity straight from the timeline.
  addHref?: string;
  // Telecaller phase 3 — the owning lead's campaign tag, used as the fallback
  // campaign label for a call activity that carries no metadata.campaign of its
  // own (app-logged calls). Imported calls carry metadata.campaign directly.
  // When set, each call row shows which campaign it belongs to.
  leadCampaign?: string | null;
}

// Each telecaller call belongs to a campaign: its own metadata.campaign
// (set on imported calls) or, failing that, the owning lead's campaign tag.
function activityCampaign(a: Activity, leadCampaign?: string | null): string | null {
  const m = (a as any).metadata as Record<string, unknown> | null | undefined;
  const own = m && typeof m.campaign === 'string' ? m.campaign.trim() : '';
  return own || (leadCampaign ? String(leadCampaign) : null);
}

export default function ActivityTimeline({ activities, onChange, addHref, leadCampaign }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const addBtn = addHref ? (
    <Link href={addHref} style={addBtnStyle}>+ Add activity</Link>
  ) : null;

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

  if (!activities.length) return (
    <div>
      {addBtn && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>{addBtn}</div>}
      <div style={{ color: 'var(--text-dim)', padding: 16, textAlign: 'center' }}>No activities yet.</div>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {addBtn && <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{addBtn}</div>}
      {activities.map((a) => {
        const status = (a as any).status as string | undefined;
        const isCompleted = status === 'completed' || status === 'done' || !!a.completed_at;
        const statusColor = status ? (STATUS_COLORS[status] || 'var(--text-dim)') : 'var(--text-dim)';
        const showActions = !!onChange;
        return (
          <div key={a.id} style={{ display: 'flex', gap: 12, padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, borderLeft: `4px solid ${statusColor}`, position: 'relative' }}>
            <div style={{ fontSize: 18, display: 'flex', alignItems: 'center' }}>
              <ActivityTypeIcon
                type={a.type}
                size={22}
                date={a.due_at || a.completed_at}
                completed={isCompleted}
              />
            </div>
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
                  {((a as any).outcome || (a.type === 'call' && activityCampaign(a, leadCampaign))) && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(a as any).outcome && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--s2)', color: 'var(--primary)', letterSpacing: 0.3 }}>
                          {(a as any).outcome}
                        </span>
                      )}
                      {a.type === 'call' && activityCampaign(a, leadCampaign) && (
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--s2)', color: 'var(--text-dim)', letterSpacing: 0.3 }}>
                          {activityCampaign(a, leadCampaign)}
                        </span>
                      )}
                    </div>
                  )}
                  {a.body && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{a.body}</div>}
                  <ActivityFields cf={(a as any).custom_fields} />
                  {a.image_url && (
                    /* Thumbnail click → opens full-size in a new tab. No URL
                       text shown — the image IS the visible affordance. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <a href={a.image_url} target="_blank" rel="noreferrer" onClick={(e) => openSignedUrl(e, a.image_url)} style={{ display: 'inline-block', marginTop: 8 }}>
                      <SignedImage src={a.image_url} alt="Activity photo" style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, border: '1px solid var(--border)', objectFit: 'cover', display: 'block' }} />
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

const addBtnStyle: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
  background: 'var(--primary)', color: '#fff', textDecoration: 'none',
  display: 'inline-block', border: '1px solid var(--primary)',
};
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

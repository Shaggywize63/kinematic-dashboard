'use client';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AudioLines, CalendarClock, Check, CheckSquare, Mail, MessageSquare, Pencil, Phone, Play, RotateCcw, StickyNote, Trash2, X } from 'lucide-react';
import SignedImage, { openSignedUrl } from '@/components/shared/SignedImage';
import type { LeadUpdate } from '../../../lib/crmApi';
import { intentColor, sentimentColor, statusMeta, type ConversationRow } from '../../../lib/conversationsApi';
import MentionInput, { renderMentions } from '../../messaging/MentionInput';
import OwnerAvatar from '../shared/OwnerAvatar';
import { WA_PATH } from '../shared/WhatsAppButton';
import { ActivityFields } from '../ActivityTimeline';
import { Button, T } from '../../ui';
import RowMenu, { type RowMenuItem } from './RowMenu';
import { activityCampaign, activityState, activityWhen, dueInfo, fmtIST, relTime, TYPE_LABEL, type DetailActivity } from './format';

const TYPE_TINT: Record<string, string> = {
  call: 'var(--ok)', email: 'var(--info)', meeting: '#7B61FF', task: 'var(--warn)', note: 'var(--dim)', sms: 'var(--info)', whatsapp: '#25D366', insight: 'var(--red)',
};

function TypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const p = { size, strokeWidth: 1.9, 'aria-hidden': true } as const;
  switch (type) {
    case 'call': return <Phone {...p} />;
    case 'email': return <Mail {...p} />;
    case 'meeting': return <CalendarClock {...p} />;
    case 'task': return <CheckSquare {...p} />;
    case 'sms': return <MessageSquare {...p} />;
    case 'whatsapp': return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={WA_PATH} /></svg>;
    case 'insight': return <AudioLines {...p} />;
    default: return <StickyNote {...p} />;
  }
}

/** One timeline entry: a type bubble on the left, a connector down to the next entry, content on the right. */
export function FeedFrame({ type, last, dim, avatar, children }: { type: string; last: boolean; dim?: boolean; avatar?: ReactNode; children: ReactNode }) {
  const tint = TYPE_TINT[type] || T.dim;
  return (
    // Flex, not grid: the app's phone stylesheet collapses any inline `grid-template-columns` to one column.
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative', paddingBottom: last ? 0 : 16, listStyle: 'none' }}>
      {!last && <span aria-hidden style={{ position: 'absolute', left: 14, top: 32, bottom: 0, width: 2, borderRadius: 2, background: T.border }} />}
      {avatar ?? (
        <span aria-hidden style={{ width: 30, height: 30, borderRadius: 999, background: `color-mix(in srgb, ${tint} 14%, var(--card))`, color: tint, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: dim ? 0.55 : 1, position: 'relative', zIndex: 1 }}>
          <TypeIcon type={type} />
        </span>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </li>
  );
}

/** Long text collapsed to `lines`, with a Show more / less toggle only when it actually overflows. */
function Clamp({ lines = 4, children }: { lines?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  });
  return (
    <div>
      <div
        ref={ref}
        style={open ? undefined : { display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
      >{children}</div>
      {(overflows || open) && (
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ background: 'none', border: 0, padding: 0, marginTop: 3, color: T.dim, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

const metaStyle: React.CSSProperties = { fontSize: 12, color: T.mute };
const bodyStyle: React.CSSProperties = { fontSize: 13.5, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 };

function Chip({ children, tone }: { children: ReactNode; tone?: 'accent' }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: tone === 'accent' ? T.infoWash : 'var(--s3)', color: tone === 'accent' ? T.info : T.dim, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
  );
}

/** Inline "are you sure" strip — keeps the confirmation next to the row it affects, no browser dialog. */
function ConfirmStrip({ text, confirmLabel, onConfirm, onCancel }: { text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div role="alertdialog" aria-label={text} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8, padding: '8px 10px', borderRadius: 8, background: T.redWash }}>
      <span style={{ fontSize: 12.5, color: T.text, flex: 1, minWidth: 140 }}>{text}</span>
      <Button size="sm" variant="danger" onClick={onConfirm} style={{ background: T.red, color: '#fff' }}>{confirmLabel}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

// ── Notes (lead updates) ─────────────────────────────────────────────────────

export function NoteRow({
  u, last, canEdit, canDelete, onEdit, onDelete,
}: {
  u: LeadUpdate;
  last: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (body: string) => Promise<boolean>;
  onDelete: () => void | Promise<void>;
}) {
  const who = u.author_name || 'Unknown';
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [text, setText] = useState(u.body);
  const [busy, setBusy] = useState(false);
  // Keep the draft in step when the row is replaced by a fresh copy (after an edit elsewhere).
  useEffect(() => { if (!editing) setText(u.body); }, [u.body, editing]);

  const save = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onEdit(text);
    setBusy(false);
    if (ok) setEditing(false);
  };

  const items: RowMenuItem[] = [];
  if (canEdit) items.push({ label: 'Edit', icon: <Pencil size={14} strokeWidth={1.8} aria-hidden />, onClick: () => setEditing(true) });
  if (canDelete) items.push({ label: 'Delete', icon: <Trash2 size={14} strokeWidth={1.8} aria-hidden />, danger: true, onClick: () => setConfirmDel(true) });

  return (
    <FeedFrame type="note" last={last} avatar={<OwnerAvatar name={who} size={30} />}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 30 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.dim }}>
          <strong style={{ color: T.text, fontWeight: 650 }}>{who}</strong> added an update
          <span style={{ ...metaStyle, marginLeft: 8 }} title={fmtIST(u.created_at)}>{relTime(u.created_at)}</span>
        </div>
        {!editing && <RowMenu items={items} />}
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <MentionInput value={text} onChange={setText} rows={3} maxLength={2000} disabled={busy} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={save} disabled={busy || !text.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 2, padding: '10px 12px', background: 'var(--s3)', borderRadius: '2px 10px 10px 10px', ...bodyStyle }}>
          <Clamp lines={6}>{renderMentions(u.body)}</Clamp>
        </div>
      )}
      {confirmDel && (
        <ConfirmStrip text="Delete this update? This can't be undone." confirmLabel="Delete" onConfirm={() => { setConfirmDel(false); void onDelete(); }} onCancel={() => setConfirmDel(false)} />
      )}
    </FeedFrame>
  );
}

// ── Activities ───────────────────────────────────────────────────────────────

const STATE_BADGE: Record<string, { label: string; fg: string; bg: string }> = {
  open: { label: 'Open', fg: T.info, bg: T.infoWash },
  in_progress: { label: 'In progress', fg: T.warn, bg: T.warnWash },
  done: { label: 'Done', fg: T.ok, bg: T.okWash },
  cancelled: { label: 'Cancelled', fg: T.mute, bg: 'var(--s3)' },
};

export function ActivityRow({
  a, last, leadCampaign, busy, onStatus, onDelete, upcoming,
}: {
  a: DetailActivity;
  last: boolean;
  leadCampaign?: string | null;
  busy: boolean;
  onStatus: (status: 'open' | 'in_progress' | 'completed' | 'cancelled') => void;
  onDelete: () => void;
  /** Rendered in the "Up next" group: the due date leads, not the history timestamp. */
  upcoming?: boolean;
}) {
  const state = activityState(a);
  const badge = STATE_BADGE[state];
  const actionable = state === 'open' || state === 'in_progress';
  const due = actionable ? dueInfo(a.due_at) : null;
  const campaign = a.type === 'call' ? activityCampaign(a, leadCampaign) : null;
  const when = activityWhen(a);
  const [confirmDel, setConfirmDel] = useState(false);

  const items: RowMenuItem[] = [];
  if (actionable && state !== 'in_progress') items.push({ label: 'Mark in progress', icon: <Play size={14} strokeWidth={1.8} aria-hidden />, onClick: () => onStatus('in_progress') });
  if (actionable) items.push({ label: 'Cancel', icon: <X size={14} strokeWidth={1.8} aria-hidden />, onClick: () => onStatus('cancelled') });
  if (!actionable) items.push({ label: 'Reopen', icon: <RotateCcw size={14} strokeWidth={1.8} aria-hidden />, onClick: () => onStatus('open') });
  items.push({ label: 'Delete', icon: <Trash2 size={14} strokeWidth={1.8} aria-hidden />, danger: true, onClick: () => setConfirmDel(true) });

  const accent = due?.overdue ? T.red : due?.today ? T.warn : undefined;

  return (
    <FeedFrame type={a.type} last={last} dim={state === 'cancelled'}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 30 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 650, color: state === 'cancelled' ? T.mute : T.text, overflowWrap: 'anywhere', textDecoration: state === 'cancelled' ? 'line-through' : 'none' }}>{a.subject || TYPE_LABEL[a.type] || a.type}</span>
            {/* "Open" is the default — only the states that say something get a badge. */}
            {state !== 'open' && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 8px', borderRadius: 999, color: badge.fg, background: badge.bg }}>{badge.label}</span>}
            {due && <span style={{ fontSize: 12, fontWeight: 650, color: accent ?? T.dim }}>{due.label}</span>}
          </div>
          <div style={{ ...metaStyle, marginTop: 1 }} title={fmtIST(when)}>
            {TYPE_LABEL[a.type] || a.type}
            {a.owner_name ? ` · ${a.owner_name}` : ''}
            {!upcoming || !due ? ` · ${actionable && a.due_at ? 'due ' : ''}${relTime(when)}` : ` · due ${fmtIST(a.due_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`}
          </div>
        </div>
        {actionable && (
          <Button size="sm" onClick={() => onStatus('completed')} disabled={busy} icon={<Check size={14} strokeWidth={2.2} aria-hidden />} style={{ color: T.ok }}>
            Complete
          </Button>
        )}
        <RowMenu items={items} />
      </div>

      {(a.outcome || campaign || a.duration_min) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {a.outcome && <Chip tone="accent">{a.outcome}</Chip>}
          {campaign && <Chip>{campaign}</Chip>}
          {a.duration_min ? <Chip>{a.duration_min} min</Chip> : null}
        </div>
      )}
      {a.body && <div style={{ ...bodyStyle, color: T.dim, marginTop: 6 }}><Clamp lines={4}>{a.body}</Clamp></div>}
      <ActivityFields cf={a.custom_fields} />
      {a.image_url && (
        <a href={a.image_url} target="_blank" rel="noreferrer" onClick={(e) => openSignedUrl(e, a.image_url)} style={{ display: 'inline-block', marginTop: 8 }}>
          <SignedImage src={a.image_url} alt="Activity photo" style={{ maxWidth: 240, maxHeight: 180, borderRadius: 8, border: `1px solid ${T.border}`, objectFit: 'cover', display: 'block' }} />
        </a>
      )}
      {confirmDel && (
        <ConfirmStrip text="Delete this activity?" confirmLabel="Delete" onConfirm={() => { setConfirmDel(false); onDelete(); }} onCancel={() => setConfirmDel(false)} />
      )}
    </FeedFrame>
  );
}

// ── Call analysis ────────────────────────────────────────────────────────────

export function InsightRow({ c, last }: { c: ConversationRow; last: boolean }) {
  const sm = statusMeta(c.status);
  const sc = sentimentColor(c.sentiment);
  const ic = intentColor(c.intent_score);
  const pill = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: bg, color: fg });
  return (
    <FeedFrame type="insight" last={last}>
      <div style={{ minHeight: 30, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 650, color: T.text }}>Call analysed</span>
        <span style={metaStyle} title={fmtIST(c.created_at)}>{c.champion_name ? `${c.champion_name} · ` : ''}{relTime(c.created_at)}</span>
        <Link href="/dashboard/crm/conversations" style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: T.red, textDecoration: 'none' }}>Open →</Link>
      </div>
      {c.summary && <div style={{ ...bodyStyle, color: T.dim, marginTop: 2 }}><Clamp lines={3}>{c.summary}</Clamp></div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        {(c.intent || c.intent_score != null) && <span style={pill(ic.bg, ic.fg)}>{c.intent || 'Intent'}{c.intent_score != null ? ` · ${c.intent_score}` : ''}</span>}
        {c.sentiment && <span style={pill(sc.bg, sc.fg)}>{c.sentiment}</span>}
        <span style={pill(sm.bg, sm.fg)}>{sm.label}</span>
      </div>
    </FeedFrame>
  );
}

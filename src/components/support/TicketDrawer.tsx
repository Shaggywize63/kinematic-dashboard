'use client';
// One ticket in a right-hand drawer: description and details, the timeline (customer / team messages as bubbles,
// status changes as small system lines), a reply box, and the controls for whoever is looking: the operator sets
// status / priority with a note to the customer; the customer can say "This is fixed" or "Still not working".

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, RefreshCw, RotateCcw, Send, X } from 'lucide-react';
import { Button, Eyebrow, Field, FormGrid, Select, Textarea, T, useIsCompact } from '../ui';
import { istDateTime } from '../../lib/istTime';
import {
  ALL_STATUSES, AREA_LABEL, AREAS, CATEGORIES, CATEGORY_LABEL, PLATFORM_LABEL, PLATFORMS, PRIORITIES, PRIORITY_LABEL,
  isDone, statusLabel, supportApi, supportError,
  type CustomerNotified, type Ticket, type TicketArea, type TicketCategory, type TicketEvent, type TicketPatch,
  type TicketPlatform, type TicketPriority, type TicketStatus, type TicketThread,
} from '../../lib/supportApi';
import { ChannelTag, NotifiedBanner, PlatformTags, PriorityTag, RelTime, StatusPill } from './ui';

/** Same set in the same order? Platform order carries no meaning, so compare as sets. */
const samePlatforms = (a: TicketPlatform[], b: TicketPlatform[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

interface Props {
  ticketId: string;
  /** The list row, if we have it, so the header paints before the thread loads. */
  initial?: Ticket | null;
  isOperator: boolean;
  onClose: () => void;
  /** Called with the ticket after any change, so the list can update its row. */
  onChanged: (t: Ticket) => void;
}

const REPLY_MAX = 5000;

export default function TicketDrawer({ ticketId, initial, isOperator, onClose, onChanged }: Props) {
  const narrow = useIsCompact(640);
  const [thread, setThread] = useState<TicketThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [notified, setNotified] = useState<CustomerNotified | null>(null);
  const [reply, setReply] = useState('');
  // Operator controls
  const [status, setStatus] = useState<TicketStatus>('open');
  const [priority, setPriority] = useState<TicketPriority>('normal');
  const [category, setCategory] = useState<TicketCategory>('other');
  const [area, setArea] = useState<TicketArea | ''>('');
  const [platforms, setPlatforms] = useState<TicketPlatform[]>([]);
  const [note, setNote] = useState('');
  // Customer "Still not working"
  const [reopening, setReopening] = useState(false);
  const [reopenNote, setReopenNote] = useState('');
  const timelineEnd = useRef<HTMLDivElement>(null);
  const prevCount = useRef(0);

  const ticket = thread?.ticket ?? initial ?? null;
  // Held in a ref so a parent re-render never re-runs the load effect.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const apply = useCallback((t: TicketThread) => {
    setThread(t);
    setStatus(t.ticket.status);
    setPriority(t.ticket.priority);
    setCategory(t.ticket.category);
    setArea(t.ticket.area ?? '');
    setPlatforms(t.ticket.platforms ?? []);
    onChangedRef.current(t.ticket);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      apply(await supportApi.get(ticketId));
    } catch (e) {
      setLoadError(supportError(e, 'Could not load this ticket.'));
    } finally {
      setLoading(false);
    }
  }, [ticketId, apply]);

  useEffect(() => {
    setThread(null); prevCount.current = 0; setNotified(null); setActionError(''); setReply(''); setNote(''); setReopening(false); setReopenNote('');
    void load();
  }, [load]);

  // Escape closes; the page behind does not scroll while the drawer is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  // Keep the newest event in view after a reply / update (not on first load, which opens at the description).
  const eventCount = thread?.events.length ?? 0;
  useEffect(() => {
    if (prevCount.current > 0 && eventCount > prevCount.current) timelineEnd.current?.scrollIntoView({ block: 'nearest' });
    prevCount.current = eventCount;
  }, [eventCount]);

  const run = async (key: string, fn: () => Promise<TicketThread>, after?: () => void) => {
    if (busy) return;
    setBusy(key);
    setActionError('');
    setNotified(null);
    try {
      const t = await fn();
      apply(t);
      if (t.customer_notified) setNotified(t.customer_notified);
      after?.();
    } catch (e) {
      setActionError(supportError(e, 'That did not go through. Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const sendReply = () => {
    const body = reply.trim();
    if (!body) return;
    void run('reply', () => supportApi.comment(ticketId, body), () => setReply(''));
  };

  const operatorUpdate = (patch: TicketPatch, key: string) => {
    const n = note.trim();
    void run(key, () => supportApi.update(ticketId, n ? { ...patch, note: n } : patch), () => setNote(''));
  };

  const saveOperator = () => {
    if (!ticket) return;
    const patch: TicketPatch = {};
    if (status !== ticket.status) patch.status = status;
    if (priority !== ticket.priority) patch.priority = priority;
    if (category !== ticket.category) patch.category = category;
    if ((area || null) !== (ticket.area ?? null)) patch.area = area || null;
    if (!samePlatforms(platforms, ticket.platforms ?? [])) patch.platforms = platforms;
    if (!Object.keys(patch).length) return;
    operatorUpdate(patch, 'update');
  };

  const operatorDirty = !!ticket && (
    status !== ticket.status
    || priority !== ticket.priority
    || category !== ticket.category
    || (area || null) !== (ticket.area ?? null)
    || !samePlatforms(platforms, ticket.platforms ?? [])
  );
  const toggleOpPlatform = (p: TicketPlatform) =>
    setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.5)', zIndex: 1100 }} />
      <aside role="dialog" aria-modal="true" aria-label={ticket ? `Ticket ${ticket.ref}` : 'Ticket'}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(600px, 100vw)', zIndex: 1101,
          background: T.card, borderLeft: `1px solid ${T.border}`, boxShadow: 'var(--shadow-pop)',
          display: 'flex', flexDirection: 'column',
        }}>
        {/* Header */}
        <div style={{ padding: narrow ? '12px 14px' : '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.dim }}>{ticket?.ref ?? '…'}</span>
              {ticket && <StatusPill status={ticket.status} isOperator={isOperator} />}
              {ticket && (ticket.priority === 'high' || ticket.priority === 'urgent') && <PriorityTag priority={ticket.priority} />}
            </div>
            <div style={{ fontFamily: T.heading, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, marginTop: 6, overflowWrap: 'anywhere' }}>
              {ticket?.subject ?? (loading ? 'Loading…' : 'Ticket')}
            </div>
          </div>
          <button type="button" onClick={() => void load()} aria-label="Refresh ticket" title="Refresh" className="km-iconbtn" disabled={loading}
            style={iconBtn}>
            <RefreshCw size={16} strokeWidth={1.6} />
          </button>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="km-iconbtn" style={iconBtn}>
            <X size={18} strokeWidth={1.6} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: narrow ? 14 : 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loadError && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13 }}>
              <span>{loadError}</span>
              <Button size="sm" onClick={() => void load()}>Retry</Button>
            </div>
          )}

          {ticket && (
            <>
              <Details ticket={ticket} isOperator={isOperator} />

              <div>
                <Eyebrow style={{ marginBottom: 8 }}>Description</Eyebrow>
                <div style={{ fontSize: 14, color: T.text, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ticket.description}</div>
              </div>

              {ticket.resolution_note && (
                <div style={{ padding: '10px 12px', borderRadius: T.radius.md, background: T.okWash, fontSize: 13.5, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, color: T.ok, marginBottom: 2 }}>Resolution</div>
                  <div style={{ color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{ticket.resolution_note}</div>
                </div>
              )}
            </>
          )}

          {/* Timeline */}
          <div>
            <Eyebrow style={{ marginBottom: 10 }}>Activity</Eyebrow>
            {loading && !thread ? (
              <div style={{ fontSize: 13, color: T.mute, padding: '8px 0' }}>Loading activity…</div>
            ) : thread && thread.events.length === 0 ? (
              <div style={{ fontSize: 13, color: T.mute, padding: '8px 0' }}>No activity yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {thread?.events.map((ev) => <TimelineItem key={ev.id} ev={ev} isOperator={isOperator} channel={ticket?.channel} />)}
                <div ref={timelineEnd} />
              </div>
            )}
          </div>
        </div>

        {/* Footer: result of the last action, controls, reply */}
        {ticket && thread && (
          <div style={{ borderTop: `1px solid ${T.border}`, padding: narrow ? 14 : '14px 20px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '55vh', overflowY: 'auto', background: T.card }}>
            {notified && <NotifiedBanner notified={notified} onDismiss={() => setNotified(null)} />}
            {actionError && (
              <div role="alert" style={{ padding: '9px 12px', borderRadius: T.radius.md, background: T.redWash, color: T.red, fontSize: 13 }}>{actionError}</div>
            )}

            {isOperator ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                <FormGrid narrow={narrow} style={{ gap: '12px 14px' }}>
                  <Field label="Status" htmlFor="support-op-status">
                    <Select id="support-op-status" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                      {ALL_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s, true)}</option>)}
                    </Select>
                  </Field>
                  <Field label="Priority" htmlFor="support-op-priority">
                    <Select id="support-op-priority" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
                      {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                    </Select>
                  </Field>
                  <Field label="Type" htmlFor="support-op-category">
                    <Select id="support-op-category" value={category} onChange={(e) => setCategory(e.target.value as TicketCategory)}>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                    </Select>
                  </Field>
                  <Field label="Area" htmlFor="support-op-area">
                    <Select id="support-op-area" value={area} onChange={(e) => setArea(e.target.value as TicketArea | '')}>
                      <option value="">Unassigned</option>
                      {AREAS.map((a) => <option key={a} value={a}>{AREA_LABEL[a]}</option>)}
                    </Select>
                  </Field>
                </FormGrid>
                <Field label="Platforms" hint="Where this happens. Saved with Update.">
                  <div role="group" aria-label="Platforms" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
                    {PLATFORMS.map((p) => {
                      const on = platforms.includes(p);
                      return (
                        <button key={p} type="button" onClick={() => toggleOpPlatform(p)} aria-pressed={on}
                          style={{
                            height: 30, padding: '0 11px', borderRadius: T.radius.pill, fontFamily: 'inherit',
                            fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                            border: `1px solid ${on ? T.text : T.border}`,
                            background: on ? T.text : T.card, color: on ? T.card : T.dim,
                            transition: 'background .12s ease, color .12s ease',
                          }}>
                          {PLATFORM_LABEL[p]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Note to customer" htmlFor="support-op-note"
                  hint="Optional. Sent to the customer with the change, e.g. “Fixed: the sync job was restarted”.">
                  <Textarea id="support-op-note" value={note} rows={2} maxLength={REPLY_MAX} style={{ minHeight: 60 }}
                    onChange={(e) => setNote(e.target.value)} placeholder="What should the customer be told?" />
                </Field>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {isDone(ticket.status) ? (
                    <Button icon={<RotateCcw size={14} strokeWidth={1.8} />} disabled={!!busy}
                      onClick={() => operatorUpdate({ status: 'open' }, 'reopen')}>
                      {busy === 'reopen' ? 'Reopening…' : 'Not resolved (reopen)'}
                    </Button>
                  ) : (
                    <Button icon={<CheckCircle2 size={14} strokeWidth={1.8} />} disabled={!!busy}
                      onClick={() => operatorUpdate({ status: 'resolved' }, 'resolve')}>
                      {busy === 'resolve' ? 'Saving…' : 'Mark resolved'}
                    </Button>
                  )}
                  <Button variant="primary" disabled={!!busy || !operatorDirty} onClick={saveOperator}
                    title={operatorDirty ? undefined : 'Change the status, priority, type, area or platforms first. To only message the customer, use Reply below.'}>
                    {busy === 'update' ? 'Updating…' : 'Update'}
                  </Button>
                </div>
              </div>
            ) : isDone(ticket.status) ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 13.5, color: T.text }}>
                  <strong style={{ fontWeight: 600 }}>Is this fixed?</strong>{' '}
                  <span style={{ color: T.dim }}>We marked this ticket {ticket.status === 'closed' ? 'closed' : 'resolved'}. If the problem is still there, tell us and we&apos;ll pick it up again.</span>
                </div>
                {reopening ? (
                  <>
                    <Field label="What's still not working?" required htmlFor="support-reopen-note">
                      <Textarea id="support-reopen-note" value={reopenNote} rows={2} autoFocus maxLength={REPLY_MAX} style={{ minHeight: 60 }}
                        onChange={(e) => setReopenNote(e.target.value)} placeholder="e.g. The Pune team still can't see yesterday's visits." />
                    </Field>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <Button disabled={!!busy} onClick={() => { setReopening(false); setReopenNote(''); }}>Cancel</Button>
                      <Button variant="primary" icon={<RotateCcw size={14} strokeWidth={1.8} />} disabled={!!busy || reopenNote.trim().length < 3}
                        onClick={() => void run('reopen', () => supportApi.update(ticketId, { status: 'open', note: reopenNote.trim() }), () => { setReopening(false); setReopenNote(''); })}>
                        {busy === 'reopen' ? 'Reopening…' : 'Reopen ticket'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div>
                    <Button icon={<RotateCcw size={14} strokeWidth={1.8} />} onClick={() => setReopening(true)}>Still not working</Button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, color: T.dim }}>Sorted on your side? Let us know and we&apos;ll mark it resolved.</span>
                <Button icon={<CheckCircle2 size={14} strokeWidth={1.8} />} disabled={!!busy}
                  onClick={() => void run('fixed', () => supportApi.update(ticketId, { status: 'resolved' }))}>
                  {busy === 'fixed' ? 'Saving…' : 'This is fixed'}
                </Button>
              </div>
            )}

            {/* Reply */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Textarea aria-label="Reply" value={reply} rows={2} maxLength={REPLY_MAX} style={{ minHeight: 64 }}
                placeholder={isOperator ? 'Reply to the customer…' : 'Add a reply or more detail…'}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); } }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: T.mute, flex: 1, minWidth: 160 }}>
                  {isOperator
                    ? 'The customer is sent this reply on WhatsApp.'
                    : isDone(ticket.status) ? 'Replying reopens this ticket.' : 'Our team is notified of your reply.'}
                </span>
                <Button variant={isOperator ? 'secondary' : 'primary'} icon={<Send size={14} strokeWidth={1.8} />}
                  disabled={!!busy || !reply.trim()} onClick={sendReply}>
                  {busy === 'reply' ? 'Sending…' : 'Send reply'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

const iconBtn = {
  width: 32, height: 32, borderRadius: 6, background: 'transparent', border: '1px solid transparent', color: T.dim,
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
} as const;

function Details({ ticket, isOperator }: { ticket: Ticket; isOperator: boolean }) {
  const rows: Array<[string, ReactNode]> = [
    ['Type', CATEGORY_LABEL[ticket.category] ?? ticket.category],
    ['Priority', <PriorityTag key="p" priority={ticket.priority} />],
    ['Area', ticket.area ? (AREA_LABEL[ticket.area] ?? ticket.area) : '—'],
    ['Platforms', ticket.platforms?.length ? <PlatformTags key="pl" platforms={ticket.platforms} /> : '—'],
    ['Channel', <ChannelTag key="c" channel={ticket.channel} />],
    ['Raised', istDateTime(ticket.created_at)],
  ];
  if (ticket.resolved_at) rows.push(['Resolved', istDateTime(ticket.resolved_at)]);
  if (isOperator) {
    rows.push(['First reply', ticket.first_response_at ? istDateTime(ticket.first_response_at) : 'Not replied yet']);
    rows.push(['Company', ticket.org_name || '—']);
    if (ticket.project_key) rows.push(['Project', <span key="pk" style={{ fontFamily: T.mono, fontSize: 12.5 }}>{ticket.project_key}</span>]);
  }
  const contact = [ticket.contact_name, ticket.contact_phone, ticket.contact_email].filter(Boolean) as string[];
  if (contact.length) {
    rows.push(['Contact', (
      <span key="ct" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ticket.contact_name && <span>{ticket.contact_name}</span>}
        {ticket.contact_phone && <a href={`tel:${ticket.contact_phone}`} className="km-entity-link">{ticket.contact_phone}</a>}
        {ticket.contact_email && <a href={`mailto:${ticket.contact_email}`} className="km-entity-link" style={{ overflowWrap: 'anywhere' }}>{ticket.contact_email}</a>}
      </span>
    )]);
  }
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px 16px', padding: 14, borderRadius: T.radius.md, background: 'var(--s3)' }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ minWidth: 0 }}>
          <dt style={{ fontSize: 11.5, color: T.mute, marginBottom: 3 }}>{k}</dt>
          <dd style={{ margin: 0, fontSize: 13.5, color: T.text, overflowWrap: 'anywhere' }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function authorOf(ev: TicketEvent, isOperator: boolean): string {
  if (ev.author_name) return ev.author_name;
  if (ev.author_type === 'team') return isOperator ? 'Support team' : 'Kinematic support';
  if (ev.author_type === 'customer') return isOperator ? 'Customer' : 'You';
  return 'System';
}

function TimelineItem({ ev, isOperator, channel }: { ev: TicketEvent; isOperator: boolean; channel?: Ticket['channel'] }) {
  const who = authorOf(ev, isOperator);

  if (ev.kind === 'comment' && ev.author_type !== 'system') {
    // Your own side's messages sit on the right, like a chat.
    const mine = ev.author_type === (isOperator ? 'team' : 'customer');
    const team = ev.author_type === 'team';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3, fontSize: 12, color: T.dim, maxWidth: '100%' }}>
          <span style={{ fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who}</span>
          {team && !isOperator && <span style={{ color: T.mute }}>· Kinematic</span>}
          <RelTime iso={ev.created_at} />
        </div>
        <div style={{
          maxWidth: '88%', padding: '9px 12px', borderRadius: 12,
          borderTopRightRadius: mine ? 4 : 12, borderTopLeftRadius: mine ? 12 : 4,
          background: team ? T.infoWash : 'var(--s3)', border: `1px solid ${T.border}`,
          fontSize: 13.5, color: T.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
        }}>
          {ev.body}
        </div>
      </div>
    );
  }

  let line: ReactNode;
  if (ev.kind === 'created') {
    line = <><strong style={{ fontWeight: 600, color: T.text }}>{who}</strong> raised this ticket{channel === 'whatsapp' ? ' on WhatsApp' : channel === 'app' ? ' from the app' : ''}</>;
  } else if (ev.kind === 'status') {
    line = (
      <>
        <strong style={{ fontWeight: 600, color: T.text }}>{who}</strong> changed status{' '}
        {ev.from_status ? <>{statusLabel(ev.from_status, isOperator)} → </> : 'to '}
        <strong style={{ fontWeight: 600, color: T.text }}>{statusLabel(ev.to_status, isOperator)}</strong>
      </>
    );
  } else {
    line = <><strong style={{ fontWeight: 600, color: T.text }}>{who}</strong></>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '2px 0' }}>
      <div style={{ fontSize: 12, color: T.dim, textAlign: 'center', lineHeight: 1.45 }}>
        {line} <span style={{ color: T.mute }}>·</span> <RelTime iso={ev.created_at} />
      </div>
      {ev.body && (
        <div style={{ maxWidth: '88%', fontSize: 12.5, color: T.dim, fontStyle: 'italic', textAlign: 'center', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          “{ev.body}”
        </div>
      )}
    </div>
  );
}

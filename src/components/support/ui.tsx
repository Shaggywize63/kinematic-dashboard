'use client';
// Small shared pieces for the support pages: status pill, priority / channel tags, relative time, and the
// "what happened to the customer's WhatsApp" note shown after an operator update.

import type { CSSProperties } from 'react';
import { AlertTriangle, CheckCircle2, Info, Monitor, Smartphone } from 'lucide-react';
import { Badge, T, type Tone } from '../ui';
import WhatsAppLogo from '../icons/WhatsAppLogo';
import { istDateTime, istDate } from '../../lib/istTime';
import {
  CHANNEL_LABEL, PRIORITY_LABEL, statusLabel,
  type CustomerNotified, type TicketChannel, type TicketPriority, type TicketStatus,
} from '../../lib/supportApi';

// Waiting-on-customer has no theme token of its own; a mid violet reads in both themes (same idea as other
// purple status pills in the dashboard).
const PURPLE: CSSProperties = { background: 'rgba(139,92,246,0.14)', color: '#8B5CF6' };
const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: 'warn', in_progress: 'info', waiting_on_customer: 'neutral', resolved: 'ok', closed: 'neutral',
};

export function StatusPill({ status, isOperator, style }: { status: TicketStatus; isOperator: boolean; style?: CSSProperties }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot
      style={{ ...(status === 'waiting_on_customer' ? PURPLE : null), ...(status === 'closed' ? { color: T.mute } : null), ...style }}>
      {statusLabel(status, isOperator)}
    </Badge>
  );
}

export function PriorityTag({ priority }: { priority: TicketPriority }) {
  if (priority === 'urgent') return <Badge tone="red">Urgent</Badge>;
  if (priority === 'high') return <Badge tone="warn">High</Badge>;
  return <span style={{ fontSize: 12.5, color: priority === 'low' ? T.mute : T.dim }}>{PRIORITY_LABEL[priority] ?? priority}</span>;
}

export function ChannelTag({ channel }: { channel: TicketChannel }) {
  const icon = channel === 'whatsapp'
    ? <WhatsAppLogo size={13} />
    : channel === 'app'
      ? <Smartphone size={13} strokeWidth={1.6} aria-hidden />
      : <Monitor size={13} strokeWidth={1.6} aria-hidden />;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: T.dim, whiteSpace: 'nowrap' }}>
      {icon}{CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}

/** "just now", "5m ago", "3h ago", "2d ago", then the date. */
export function relTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return istDate(iso);
}

export function RelTime({ iso, style }: { iso: string | null | undefined; style?: CSSProperties }) {
  return <time dateTime={iso ?? undefined} title={istDateTime(iso)} style={{ fontSize: 12, color: T.mute, whiteSpace: 'nowrap', ...style }}>{relTime(iso)}</time>;
}

/** One-line summary of the customer notification returned by a reply / update. */
export function notifiedText(n: CustomerNotified): { tone: 'ok' | 'warn' | 'red'; text: string } {
  switch (n.whatsapp) {
    case 'sent': return { tone: 'ok', text: 'Customer told on WhatsApp' };
    case 'template': return { tone: 'ok', text: 'Customer told on WhatsApp (template, outside 24h)' };
    case 'failed': return { tone: 'red', text: n.note || 'The WhatsApp message to the customer failed.' };
    default: return { tone: 'warn', text: n.note || 'The customer was not messaged on WhatsApp.' };
  }
}

export function NotifiedBanner({ notified, onDismiss }: { notified: CustomerNotified; onDismiss?: () => void }) {
  const { tone, text } = notifiedText(notified);
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'red' ? AlertTriangle : Info;
  const fg = tone === 'ok' ? T.ok : tone === 'red' ? T.red : T.warn;
  const bg = tone === 'ok' ? T.okWash : tone === 'red' ? T.redWash : T.warnWash;
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', borderRadius: T.radius.md, background: bg, color: T.text, fontSize: 13, lineHeight: 1.45 }}>
      <Icon size={16} strokeWidth={1.8} aria-hidden style={{ color: fg, flexShrink: 0, marginTop: 1 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{text}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="Dismiss"
          style={{ background: 'transparent', border: 0, color: T.mute, cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: 'inherit' }}>
          Dismiss
        </button>
      )}
    </div>
  );
}

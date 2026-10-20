'use client';
import { useId, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronDown, ClipboardList, Eye, MapPin, Store } from 'lucide-react';
import { Avatar, Badge, Button, Eyebrow, T, cardStyle } from '../ui';
import { earliestCheckIn, fmtClock, fmtMinutes, latestCheckOut, sumMinutes, visitMinutes, type VisitFields } from '../../lib/visitTime';
import { placeLabel, visitTitle, type VisitGroup, type VisitRow } from '../../lib/workActivities';

export interface VisitForm extends VisitRow, VisitFields {
  id: string;
  submitted_at: string;
  address?: string;
  users?: { name?: string };
}

/** Rows shown before "Show all": a rep can file dozens of forms in a day. */
const ROWS_VISIBLE = 8;

const fmtTime = (ts?: string | null) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};
const fmtDay = (ts?: string | null) => {
  if (!ts) return '—';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function Stat({ label, value, testId, strong, hint }: { label: string; value: string; testId: string; strong?: boolean; hint?: string }) {
  const none = value === '—';
  return (
    <div style={{ minWidth: 64 }}>
      <Eyebrow>{label}</Eyebrow>
      <div data-testid={testId} style={{
        marginTop: 3, fontFamily: T.mono, fontSize: strong ? 17 : 13.5, fontWeight: strong ? 700 : 600,
        color: none ? T.mute : strong ? T.ok : T.text, whiteSpace: 'nowrap',
      }}>{value}</div>
      {hint && <div style={{ fontSize: 10.5, color: T.mute, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/** One visit: a store (or, with no store, the form that was filled in) by one rep on one day. */
export default function VisitCard<F extends VisitForm>({ group, expanded, onToggle, onView, hideVisitTracking, compact }: {
  group: VisitGroup<F>;
  expanded: boolean;
  onToggle: () => void;
  onView: (f: F) => void;
  /** Rajkamal does GPS-only visits: no check-in/out, time spent or per-form times. */
  hideVisitTracking: boolean;
  compact: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const panelId = useId();
  const items = group.items;
  const first = items[0];
  const title = visitTitle(group);
  const rep = first.users?.name || 'Unknown rep';
  const place = placeLabel(first.address);
  const spent = sumMinutes(items);
  const rows = showAll ? items : items.slice(0, ROWS_VISIBLE);
  const Icon = group.store ? Store : ClipboardList;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); }
  };

  return (
    <div className="wa-visit" data-expanded={expanded ? 'true' : 'false'} style={{
      ...cardStyle, padding: 0, overflow: 'hidden',
      borderColor: expanded ? T.borderStrong : T.border,
      boxShadow: expanded ? '0 8px 28px rgba(10,14,26,.10)' : 'none',
    }}>
      <div
        role="button" tabIndex={0} aria-expanded={expanded} aria-controls={panelId}
        className="wa-visit-head" onClick={onToggle} onKeyDown={onKey}
        style={{ display: 'flex', alignItems: 'center', gap: compact ? 12 : 18, padding: compact ? '14px 14px' : '16px 20px', flexWrap: 'wrap', cursor: 'pointer' }}
      >
        <span aria-hidden style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: group.store ? T.redWash : T.infoWash, color: group.store ? T.red : T.info,
        }}><Icon size={21} strokeWidth={1.8} /></span>

        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: T.heading, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', color: T.text, overflowWrap: 'anywhere' }}>{title}</span>
            {!group.store && <Badge>No store linked</Badge>}
          </div>
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: '6px 14px', flexWrap: 'wrap', fontSize: 12.5, color: T.dim }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Avatar name={rep} size={18} /> {rep}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarDays size={13} aria-hidden /> {fmtDay(first.submitted_at)}</span>
            {place && (
              <span title={first.address} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: 340 }}>
                <MapPin size={13} aria-hidden style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place}</span>
              </span>
            )}
            <Badge>{items.length} {items.length === 1 ? 'form' : 'forms'}</Badge>
          </div>
        </div>

        {!hideVisitTracking && (
          <div style={{
            display: 'flex', gap: compact ? 22 : 28, alignItems: 'flex-start', flexWrap: 'wrap',
            ...(compact ? { flexBasis: '100%', paddingTop: 12, borderTop: `1px solid ${T.border}` } : { paddingLeft: 24, borderLeft: `1px solid ${T.border}` }),
          }}>
            <Stat label="Time spent" strong testId="wa-group-spent" value={fmtMinutes(spent.total)}
              hint={spent.total != null && spent.counted < items.length ? `${spent.counted} of ${items.length} forms` : undefined} />
            <Stat label="Check in" testId="wa-group-in" value={fmtClock(earliestCheckIn(items))} />
            <Stat label="Last out" testId="wa-group-out" value={fmtClock(latestCheckOut(items))} />
          </div>
        )}

        <ChevronDown size={20} aria-hidden style={{ color: T.mute, flexShrink: 0, transition: 'transform .25s ease', transform: expanded ? 'rotate(180deg)' : 'none', marginLeft: compact ? 'auto' : 0 }} />
      </div>

      {expanded && (
        <div id={panelId} style={{ borderTop: `1px solid ${T.border}`, background: T.canvas }}>
          <div style={{ padding: '12px 20px 4px' }}><Eyebrow>Submissions ({items.length})</Eyebrow></div>
          <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map((f, i) => (
              <div key={f.id} className="wa-row" style={{
                display: 'flex', alignItems: 'center', gap: '10px 18px', flexWrap: 'wrap', padding: '10px 12px',
                background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg,
              }}>
                <span aria-hidden style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, width: 22, textAlign: 'right', flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflowWrap: 'anywhere' }}>{f.builder_forms?.title || f.activities?.name || 'Form submission'}</div>
                  <div style={{ fontSize: 12, color: T.mute, marginTop: 1 }}>Captured at {fmtTime(f.submitted_at)}</div>
                </div>
                {!hideVisitTracking && (
                  <div data-testid="wa-form-times" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <Stat label="Check in" testId="wa-form-in" value={fmtClock(f.check_in_at)} />
                    <Stat label="Check out" testId="wa-form-out" value={fmtClock(f.check_out_at)} />
                    <Stat label="Time spent" testId="wa-form-spent" value={fmtMinutes(visitMinutes(f))} />
                  </div>
                )}
                <Button size="sm" onClick={(e) => { e.stopPropagation(); onView(f); }}>
                  <Eye size={14} aria-hidden /> View data
                </Button>
              </div>
            ))}
            {items.length > ROWS_VISIBLE && (
              <Button variant="ghost" size="sm" style={{ alignSelf: 'center', marginTop: 4 }} onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${items.length} submissions`}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

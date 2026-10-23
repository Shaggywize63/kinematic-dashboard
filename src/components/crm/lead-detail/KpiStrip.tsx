'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Deal } from '../../../types/crm';
import type { LeadUpdate } from '../../../lib/crmApi';
import type { ConversationRow } from '../../../lib/conversationsApi';
import { formatINR } from '../../../lib/formatCurrency';
import { inferGrade } from '../leads/ScoreMeter';
import { T, eyebrowStyle } from '../../ui';
import ScoreRing, { GRADE_COLORS } from './ScoreRing';
import { activityState, dueInfo, fmtIST, isActionable, relTime, TYPE_LABEL, type DetailActivity } from './format';
import type { LeadTab, LifecycleLead } from './types';

const QUIET_AFTER_DAYS = 7;

/** Most recent sign that someone actually spoke to / worked on this lead. */
export function lastTouchOf(lead: LifecycleLead, activities: DetailActivity[], updates: LeadUpdate[], conversations: ConversationRow[]): string | null {
  const stamps: number[] = [];
  const add = (iso?: string | null) => { if (iso) { const t = new Date(iso).getTime(); if (!Number.isNaN(t)) stamps.push(t); } };
  add(lead.last_activity_at);
  add(lead.latest_update_at);
  updates.forEach((u) => add(u.created_at));
  conversations.forEach((c) => add(c.created_at));
  // Only activities that took place count — a task due next week is not a touch.
  activities.forEach((a) => { if (activityState(a) === 'done') add(a.completed_at); });
  if (stamps.length === 0) return null;
  return new Date(Math.max(...stamps)).toISOString();
}

/** The most pressing open activity: overdue ones first (oldest due date wins), then the soonest upcoming. */
export function nextFollowUp(activities: DetailActivity[]): DetailActivity | null {
  const open = activities.filter((a) => isActionable(a) && a.due_at);
  if (open.length === 0) return null;
  return [...open].sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0];
}

function Tile({ label, onClick, children }: { label: string; onClick?: () => void; children: ReactNode }) {
  const body = (
    <>
      <div style={{ ...eyebrowStyle, fontSize: 10 }}>{label}</div>
      {children}
    </>
  );
  const common: React.CSSProperties = {
    flex: '1 1 0', minWidth: 0, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left',
    borderLeft: 0, borderRight: 0, borderTop: 0, borderBottom: 0, background: 'transparent', fontFamily: 'inherit', color: T.text,
  };
  return onClick ? (
    <button type="button" onClick={onClick} className="ld-tile" style={{ ...common, cursor: 'pointer' }}>{body}</button>
  ) : (
    <div style={common}>{body}</div>
  );
}

export default function KpiStrip({
  lead, activities, updates, deals, conversations, showScore, hideWon = false, narrow, onOpenTab,
}: {
  lead: LifecycleLead;
  activities: DetailActivity[];
  updates: LeadUpdate[];
  deals: Deal[];
  conversations: ConversationRow[];
  showScore: boolean;
  /** BMW has no close-as-won flow — drop the "· ₹X won" suffix on the Deals tile. */
  hideWon?: boolean;
  narrow: boolean;
  onOpenTab: (t: LeadTab) => void;
}) {
  const touch = lastTouchOf(lead, activities, updates, conversations);
  const daysQuiet = touch ? Math.floor((Date.now() - new Date(touch).getTime()) / 86_400_000) : null;
  const quiet = daysQuiet == null || daysQuiet >= QUIET_AFTER_DAYS;
  const next = nextFollowUp(activities);
  const due = next ? dueInfo(next.due_at) : null;
  const dealTotal = deals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const dealWon = deals.filter((d) => d.status === 'won').reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const grade = inferGrade(lead.score, lead.score_grade);

  const tiles: ReactNode[] = [];
  if (showScore) {
    tiles.push(
      <Tile key="score" label="Lead score">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ScoreRing score={lead.score} grade={lead.score_grade} size={46} label={false} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
              {grade ? <span style={{ color: GRADE_COLORS[grade] }}>Grade {grade}</span> : 'Not scored'}
            </div>
            <div style={{ fontSize: 12, color: T.dim }}>{lead.score == null ? 'Re-score to compute' : grade === 'A' ? 'Hot — prioritise' : grade === 'D' ? 'Needs nurturing' : 'Out of 100'}</div>
          </div>
        </div>
      </Tile>,
    );
  }
  tiles.push(
    <Tile key="touch" label="Last contact" onClick={() => onOpenTab('timeline')}>
      <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.heading, letterSpacing: '-0.01em', color: touch && !quiet ? T.text : T.warn }}>
        {touch ? relTime(touch) : 'No contact yet'}
      </div>
      <div style={{ fontSize: 12, color: T.dim }} title={touch ? fmtIST(touch) : undefined}>
        {touch ? (quiet ? `Quiet for ${daysQuiet} days` : fmtIST(touch, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })) : 'Log a call or note to start the trail'}
      </div>
    </Tile>,
  );
  tiles.push(
    next && due ? (
      <Tile key="next" label="Next follow-up" onClick={() => onOpenTab('timeline')}>
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.heading, letterSpacing: '-0.01em', color: due.overdue ? T.red : T.text }}>{due.label}</div>
        <div style={{ fontSize: 12, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={next.subject || undefined}>
          {TYPE_LABEL[next.type] || next.type}{next.subject ? ` · ${next.subject}` : ''}
        </div>
      </Tile>
    ) : (
      <Tile key="next" label="Next follow-up">
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.heading, letterSpacing: '-0.01em', color: T.dim }}>Nothing scheduled</div>
        <Link href={`/dashboard/crm/activities/new?lead_id=${lead.id}&type=task&subject=${encodeURIComponent('Follow up')}`} style={{ fontSize: 12, fontWeight: 600, color: T.red, textDecoration: 'none' }}>Schedule one →</Link>
      </Tile>
    ),
  );
  tiles.push(
    <Tile key="deals" label="Deals" onClick={() => onOpenTab('deals')}>
      <div style={{ fontSize: 17, fontWeight: 700, fontFamily: T.heading, letterSpacing: '-0.01em', color: deals.length ? T.text : T.dim }}>
        {deals.length ? formatINR(dealTotal) : 'No deals yet'}
      </div>
      <div style={{ fontSize: 12, color: T.dim }}>
        {deals.length ? `${deals.length} deal${deals.length > 1 ? 's' : ''}${!hideWon && dealWon ? ` · ${formatINR(dealWon)} won` : ''}` : 'Convert the lead to open one'}
      </div>
    </Tile>,
  );

  // Flex, not grid: the app's phone stylesheet collapses any inline `grid-template-columns` to one column,
  // and four stacked tiles is a lot of scrolling. Two across keeps the strip compact.
  const basis = narrow ? 'calc(50% - 1px)' : '0';
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: T.border }}>
      {tiles.map((t, i) => (
        <div key={i} style={{ background: T.card, display: 'flex', minWidth: 0, flex: `1 1 ${basis}` }}>{t}</div>
      ))}
    </div>
  );
}

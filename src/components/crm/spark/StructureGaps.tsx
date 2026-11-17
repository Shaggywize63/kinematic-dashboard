'use client';
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { cardStyle, T } from '../../ui';
import { missingSlots, type AccountGap, type IdentitySlot } from '../../../lib/leadStructure';

/**
 * "What's missing to complete the structure" — the same panel on a lead and on an account.
 *
 * The rule it follows: never nag generically. Every row names the specific link that is open,
 * what to do, and what breaks while it is open. A record with nothing missing says so plainly
 * rather than hiding the panel, so "complete" is a state you can see and trust.
 */

function Row({ tone, title, detail }: { tone: 'break' | 'gap'; title: string; detail: string }) {
  const color = tone === 'break' ? T.red : T.warn;
  return (
    <li style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: '8px 0', borderTop: `1px solid ${T.rule}` }}>
      <span aria-hidden style={{ color, flexShrink: 0, marginTop: 1, lineHeight: 0 }}>
        {tone === 'break' ? <AlertTriangle size={15} strokeWidth={2} /> : <CircleDashed size={15} strokeWidth={2} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: T.text }}>{title}</span>
        <span style={{ display: 'block', fontSize: 12.5, color: T.dim, lineHeight: 1.45, marginTop: 1 }}>{detail}</span>
      </span>
    </li>
  );
}

function Shell({ heading, complete, completeText, children, testId }: {
  heading: string; complete: boolean; completeText: string; children?: React.ReactNode; testId: string;
}) {
  return (
    <div data-testid={testId} data-complete={complete ? 'yes' : 'no'} style={{ ...cardStyle, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ color: complete ? T.ok : T.warn, lineHeight: 0 }}>
          {complete ? <CheckCircle2 size={16} strokeWidth={2} /> : <AlertTriangle size={16} strokeWidth={2} />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{heading}</span>
      </div>
      {complete
        ? <p style={{ margin: '6px 0 0', fontSize: 12.5, color: T.dim, lineHeight: 1.45 }}>{completeText}</p>
        : <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>{children}</ul>}
    </div>
  );
}

/** The open links in one lead's identity chain. */
export function LeadStructureGaps({ slots }: { slots: readonly IdentitySlot[] }) {
  const gaps = missingSlots(slots);
  return (
    <Shell
      testId="lead-structure-gaps"
      heading={gaps.length === 0 ? 'Structure complete' : `Missing to complete this lead (${gaps.length})`}
      complete={gaps.length === 0}
      completeText="Every link in this lead's identity is filled — account, plant, department, contact, requirement, serial and owner."
    >
      {gaps.map((g) => (
        <Row key={g.key} tone={g.system ? 'gap' : 'break'} title={`${g.label} — ${g.fix}`} detail={g.why} />
      ))}
    </Shell>
  );
}

/** What stops an account's slice of the tree from being complete. */
export function AccountStructureGaps({ gaps }: { gaps: readonly AccountGap[] }) {
  return (
    <Shell
      testId="account-structure-gaps"
      heading={gaps.length === 0 ? 'Structure complete' : `Missing to complete the tree (${gaps.length})`}
      complete={gaps.length === 0}
      completeText="This account sits in the tree correctly: it is linked to its group, its plants are recorded, and its leads carry a plant, department, contact and requirement."
    >
      {gaps.map((g) => <Row key={g.key} tone={g.severity} title={g.label} detail={g.detail} />)}
    </Shell>
  );
}

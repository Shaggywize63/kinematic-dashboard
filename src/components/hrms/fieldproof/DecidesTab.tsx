'use client';
// How it decides: the rule in plain sentences (read-only), what a verified visit is, why the unclear cases stay
// advisory, and three worked examples taken live from the sample data.

import { useMemo } from 'react';
import { Badge, Card, CardTitle, Note, T } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import type { FieldEvidence, RegularisationSuggestion } from '../../../lib/hrms/field/types';
import { regularisationCandidates } from '../../../lib/hrms/field/engines';
import { VERDICT_LABEL, policySentences, ruleChecks } from '../../../lib/hrms/fieldproof/logic';
import { VerdictBadge } from './DayDetail';
import { Bullets } from './shared';

function Example({ db, s, title }: { db: HrmsDb; s: RegularisationSuggestion | undefined; title: string }) {
  if (!s) return null;
  const p = db.employees.find((e) => e.id === s.employeeId);
  const checks = ruleChecks(s.evidence);
  return (
    <div data-testid={`example-${s.verdict}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: T.card, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><b style={{ fontSize: 13.5 }}>{title}</b><VerdictBadge verdict={s.verdict} /></div>
      <div style={{ fontSize: 13.5, color: T.dim }}>{p ? fullName(p) : s.employeeId}, {fmtDate(s.date)}. {s.reasons[0]}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checks.map((c) => (
          <div key={c.label} data-met={String(c.met)} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', fontSize: 13, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: T.dim }}>{c.label}</div>
              <div style={{ color: c.met ? T.ok : T.warn, fontSize: 12.5 }}>{c.met ? 'Enough' : 'Not enough'}, needs {c.needed}</div>
            </div>
            <b style={{ fontVariantNumeric: 'tabular-nums', color: T.text, whiteSpace: 'nowrap' }}>{c.actual}</b>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13, color: T.dim }}>
        {s.verdict === 'auto_approve' ? `All three are enough, so ${s.suggestedIn ? `punch-in ${s.suggestedIn} and ` : ''}${s.suggestedOut ? `punch-out ${s.suggestedOut}` : 'the day'} would be suggested.`
          : s.verdict === 'needs_review' ? 'At least one part falls short, so a manager looks at the day and decides.' : 'There is no verified visit, so no time is suggested and a manager decides.'}
      </div>
    </div>
  );
}

export default function DecidesTab({ db, ev }: { db: HrmsDb; ev: FieldEvidence }) {
  const P = policySentences();
  const all = useMemo(() => regularisationCandidates(ev), [ev]);
  const auto = all.find((s) => s.employeeId === 'emp_6' && s.date === '2026-10-14') ?? all.find((s) => s.verdict === 'auto_approve');
  const review = all.find((s) => s.verdict === 'needs_review');
  const none = all.find((s) => s.verdict === 'no_evidence');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Note>These rules are company policy, not law. They are shown here as they are and cannot be edited in this preview.</Note>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 16 }}>
        <Card>
          <CardTitle right={<Badge tone="ok" dot>{VERDICT_LABEL.auto_approve}</Badge>}>The rule for suggesting approval</CardTitle>
          <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 8 }}>A day with a missing punch is suggested for approval when all three are true:</div>
          <div data-testid="rule-sentences"><Bullets items={P.rule} /></div>
          <div style={{ fontSize: 13.5, color: T.dim, margin: '12px 0 8px' }}>Suggested punch times:</div>
          <Bullets items={P.times} />
        </Card>
        <Card>
          <CardTitle>What counts as a verified visit</CardTitle>
          <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 8 }}>A visit is verified only when all three are true:</div>
          <div data-testid="verified-sentences"><Bullets items={P.visit} /></div>
          <div style={{ fontSize: 13.5, color: T.dim, marginTop: 12 }}>A visit that fails any one of them still shows on the day timeline, with the reason, so the person can see why it did not count.</div>
        </Card>
      </div>

      <Card>
        <CardTitle>Why it stays advisory for the unclear cases</CardTitle>
        <Bullets items={P.advisory} />
        <div style={{ marginTop: 12 }}><Note tone="warn">A missed punch is never a reason to cut pay by itself. Nothing on this page changes pay. It only records what attendance shows, with a name and a time on the decision.</Note></div>
      </Card>

      <Card>
        <CardTitle>Worked examples from the sample data</CardTitle>
        <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 12 }}>Three real days from the sample evidence, with the rule applied to each. The numbers are live, not typed in.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
          <Example db={db} s={auto} title="Meets the rule" />
          <Example db={db} s={review} title="Falls short" />
          <Example db={db} s={none} title="No proof" />
        </div>
      </Card>

      <Card>
        <CardTitle>Who sees what</CardTitle>
        <Bullets items={[
          'The person can see the same timeline, map and sentences that the manager sees.',
          'A day that is rejected or sent back for more information carries a note the person can read.',
          'In the live product the person would answer from their own app. In this preview there is no employee login.',
        ]} />
      </Card>
    </div>
  );
}

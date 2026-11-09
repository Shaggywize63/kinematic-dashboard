'use client';
// Plan catalogue: what is offered, the cost split, the family rules and the tax notes. Every premium is a sample.

import { Badge, Card, ConfidenceBadge, Note, T } from '../../ui';
import { fmtDate, inr } from '../../../../lib/hrms/format';
import { RELATION_LABEL } from '../../../../lib/hrms/rewards/engines';
import type { Plan, RewardsState } from '../../../../lib/hrms/rewards/types';
import { AdvisorNote, Muted } from '../common';

const th = { textAlign: 'right' as const, padding: '8px 10px', fontSize: 11.5, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' as const };
const td = { padding: '8px 10px', borderTop: `1px solid ${T.border}`, textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' as const, fontSize: 13.5 };

function PremiumTable({ plan }: { plan: Plan }) {
  const rels = (['self', 'spouse', 'child', 'parent'] as const).filter((r) => plan.tiers.some((t) => t.annualPremium?.[r] != null));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Cover</th>
            {rels.map((r) => <th key={r} style={th}>{r === 'self' ? 'Employee' : RELATION_LABEL[r]} a year</th>)}
          </tr>
        </thead>
        <tbody>
          {plan.tiers.map((t) => (
            <tr key={t.id}>
              <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{t.label}</td>
              {rels.map((r) => <td key={r} style={td}>{t.annualPremium?.[r] != null ? inr(t.annualPremium[r]) : '—'}</td>)}
            </tr>
          ))}
          <tr>
            <td style={{ ...td, textAlign: 'left', color: T.dim }}>Company pays</td>
            {rels.map((r) => <td key={r} style={{ ...td, color: T.dim }}>{plan.employerSharePct[r] ?? 0}%</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const d = plan.dependants;
  return (
    <Card>
      <div data-testid={`plan-${plan.kind}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 16, fontWeight: 700 }}>{plan.name}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {plan.auto ? <Badge tone="info">Automatic for everyone</Badge> : <Badge>Employee chooses</Badge>}
            <Badge>Renews {fmtDate(plan.renewsOn)}</Badge>
          </div>
        </div>
        <div style={{ fontSize: 14, color: T.text, lineHeight: 1.5 }}>{plan.summary}</div>
        <Muted>Provider: {plan.provider}. Cover starts {fmtDate(plan.coverStart)}.</Muted>

        {(plan.kind === 'health' || plan.kind === 'accident') && <PremiumTable plan={plan} />}
        {plan.kind === 'meal' && <Muted>Choose a monthly face value of {plan.tiers.filter((t) => t.monthlyAmount).map((t) => inr(t.monthlyAmount)).join(', ')}. The company pays {plan.employerSharePct.self ?? 0}% of it: the amount is a salary reduction.</Muted>}
        {plan.kind === 'nps' && <Muted>Choose {plan.tiers.filter((t) => t.pctOfBasic).map((t) => `${t.pctOfBasic}%`).join(' or ')} of monthly basic. CTC does not change, so take-home falls by the same amount and no extra cost lands on the company.</Muted>}
        {plan.kind === 'flex' && (
          <Muted>Monthly budget {inr(plan.flexMonthly)}, split in multiples of 250 across: {plan.baskets?.map((b) => b.label).join(', ')}. The company pays against bills.</Muted>
        )}
        {d && (
          <div style={{ fontSize: 13.5 }}>
            <b>Family rules (sample plan terms):</b> up to {d.maxSpouse} spouse, {d.maxChildren} children up to age {d.childMaxAge}, and {d.maxParents} parents up to age {d.parentMaxAge}. Ages are checked on the cover start date. We keep a name, relation and date of birth only, never an ID number.
          </div>
        )}
        <AdvisorNote><b>Tax treatment.</b> {plan.taxNote}</AdvisorNote>
      </div>
    </Card>
  );
}

export default function PlansTab({ st }: { st: RewardsState }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Note tone="warn"><b>Every premium, term and turnaround on this page is a sample.</b> <ConfidenceBadge level="indicative" /> Replace them with the insurer&apos;s quote and your policy documents before using any number for real.</Note>
      {st.benefits.plans.map((p) => <PlanCard key={p.id} plan={p} />)}
    </div>
  );
}

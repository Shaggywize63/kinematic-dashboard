'use client';
// Projection & Growth Plan: a 12-month billing projection built from the invoices, and a hiring plan
// (who, when, budget) that recomputes from that projection every time the page loads or an input changes.

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { Badge, Button, Card, Field, Input, Segmented, T, useIsCompact } from '../../../../../components/ui';
import { FinancePage, Stat, errMsg } from '../../../../../components/finance/ui';
import { financeApi, type GrowthRole, type ProjectionData, type Scenario } from '../../../../../lib/financeApi';
import { fmtDate, num } from '../../../../../lib/financeFormat';

const loading = <div style={{ height: 260, display: 'grid', placeItems: 'center', color: T.dim, fontSize: 13 }}>Loading chart…</div>;
const chart = <K extends string>(name: K) => dynamic(() => import('../../../../../components/finance/ProjectionCharts').then((m) => (m as unknown as Record<K, React.ComponentType<never>>)[name]), { ssr: false, loading: () => loading });
const BillingsChart = chart('BillingsChart') as unknown as React.ComponentType<{ data: ProjectionData; compact?: boolean }>;
const CumulativeChart = chart('CumulativeChart') as unknown as React.ComponentType<{ data: ProjectionData; compact?: boolean }>;
const CustomerBars = chart('CustomerBars') as unknown as React.ComponentType<{ data: ProjectionData; compact?: boolean }>;
const MrrHiringChart = chart('MrrHiringChart') as unknown as React.ComponentType<{ plan: ProjectionData['growth']['plans']['base']; current: number; compact?: boolean }>;
const PayrollChart = chart('PayrollChart') as unknown as React.ComponentType<{ plan: ProjectionData['growth']['plans']['base']; compact?: boolean }>;

const rs = (n: unknown) => `₹${Math.round(num(n)).toLocaleString('en-IN')}`;
const monthLong = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const SOURCE: Record<string, string> = { schedule: 'Repeat schedule', duration: 'Line duration', history: 'Invoice history' };

interface Params { churn: string; growth: string; growth_up: string; cap: string; oncost: string; existing: string; founder: string; costs: Record<string, string> }
const DEFAULTS: Params = { churn: '15', growth: '2500', growth_up: '5000', cap: '50', oncost: '12', existing: '0', founder: '200000', costs: {} };

function useDebounced<T>(v: T, ms = 500): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

function CardTitle({ children, hint, right }: { children: React.ReactNode; hint?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 15, fontWeight: 700, color: T.text }}>{children}</h2>
        {hint && <div style={{ fontSize: 12.5, color: T.mute, marginTop: 3, maxWidth: 760, lineHeight: 1.45 }}>{hint}</div>}
      </div>
      {right}
    </div>
  );
}

const th: React.CSSProperties = { padding: '9px 12px', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, borderBottom: `1px solid ${T.border}`, textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 12px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: 'tabular-nums' };
const right = { textAlign: 'right' as const };

export default function ProjectionPage() {
  const narrow = useIsCompact(900);
  const [tab, setTab] = useState<'projection' | 'hiring'>('projection');
  const [scenario, setScenario] = useState<Scenario>('base');
  const [params, setParams] = useState<Params>(DEFAULTS);
  const dp = useDebounced(params);
  const [data, setData] = useState<ProjectionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [reload, setReload] = useState(0);

  const query = useMemo(() => {
    const q: Record<string, string> = { churn: dp.churn, growth: dp.growth, growth_up: dp.growth_up, cap: dp.cap, oncost: dp.oncost, existing: dp.existing, founder: dp.founder };
    for (const [k, v] of Object.entries(dp.costs)) if (v.trim() !== '') q[`cost_${k}`] = v;
    return q;
  }, [dp]);

  useEffect(() => {
    let off = false;
    setBusy(true); setError(null);
    financeApi.reports.projection(query)
      .then((r) => { if (!off) setData(r.data); })
      .catch((e) => { if (!off) setError(errMsg(e, 'Could not build the projection')); })
      .finally(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [query, reload]);

  const set = (k: keyof Omit<Params, 'costs'>) => (e: React.ChangeEvent<HTMLInputElement>) => setParams((p) => ({ ...p, [k]: e.target.value }));
  const setCost = (key: string, v: string) => setParams((p) => ({ ...p, costs: { ...p.costs, [key]: v } }));

  const plan = data?.growth.plans[scenario];
  const gst = data?.summary.gst_factor ?? 1.18;

  return (
    <FinancePage title="Projection & Growth Plan" description="A 12-month billing projection from your invoices, and a hiring plan that moves with it"
      actions={<Button href="/dashboard/finance/reports">All reports</Button>}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'projection', label: 'Projection' }, { value: 'hiring', label: 'Hiring plan' }]} />
        <span style={{ fontSize: 12.5, color: T.mute }}>All amounts are before GST. Recalculated from your live invoices{busy ? ' …' : ''}.</span>
      </div>

      {error && !data ? (
        <Card padding={32} style={{ textAlign: 'center' }}>
          <div role="alert" style={{ color: T.red, fontSize: 14, marginBottom: 12 }}>{error}</div>
          <Button onClick={() => setReload((n) => n + 1)}>Try again</Button>
        </Card>
      ) : !data ? (
        <Card padding={32} style={{ textAlign: 'center', color: T.mute, fontSize: 14 }}>Building the projection…</Card>
      ) : data.summary.recurring_customers === 0 ? (
        <Card padding={40} style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text }}>Nothing to project yet</div>
          <p style={{ fontSize: 14, color: T.dim, margin: '8px auto 0', maxWidth: 480 }}>
            The projection is built from invoices that repeat. Send invoices with a repeat schedule or a billing duration, or invoice the same customer more than once, and it will appear here.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: busy ? 0.6 : 1, transition: 'opacity .15s ease' }} aria-busy={busy}>
          {error && <div role="alert" style={{ fontSize: 13, color: T.red }}>{error}</div>}

          {tab === 'projection' ? (
            <>
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(6, minmax(0, 1fr))', gap: 18 }}>
                  <Stat label="Monthly recurring revenue" value={rs(data.summary.mrr)} tone="info" hint={`${rs(data.summary.arr)} a year`} />
                  <Stat label="Recurring customers" value={data.summary.recurring_customers} hint={`Top 2 = ${data.summary.top2_share}% of revenue`} />
                  <Stat label="Billed so far" value={rs(data.summary.billed_to_date)} hint={`${rs(data.summary.collected)} collected · ${rs(data.summary.outstanding)} unpaid`} />
                  <Stat label="Next 12 months · low" value={rs(data.scenarios.conservative)} tone="red" hint={`${rs(data.scenarios.conservative * gst)} with GST`} />
                  <Stat label="Next 12 months · base" value={rs(data.scenarios.base)} tone="warn" hint={`${rs(data.scenarios.base * gst)} with GST`} />
                  <Stat label="Next 12 months · high" value={rs(data.scenarios.upside)} tone="ok" hint={`${rs(data.scenarios.upside * gst)} with GST`} />
                </div>
              </Card>

              <Card>
                <CardTitle hint={`Bars: what you have billed each month, then the renewals already scheduled from your repeat invoices. Lines: the three scenarios for the next 12 months.${data.pipeline.total ? " The high case also counts your open quotes, billed in the second month." : ""}`}>Billings: actual and projected</CardTitle>
                <BillingsChart data={data} compact={narrow} />
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 18 }}>
                <Card>
                  <CardTitle hint="Running total of billings from this month, by scenario.">Cumulative billings, next 12 months</CardTitle>
                  <CumulativeChart data={data} compact={narrow} />
                </Card>
                <Card>
                  <CardTitle hint="Each customer's billing per cycle × cycles a year.">Recurring revenue by customer, per year</CardTitle>
                  <CustomerBars data={data} compact={narrow} />
                </Card>
              </div>

              <Card>
                <CardTitle hint="Change these to see how the projection moves. Scheduled renewals are always counted as they are.">Scenario assumptions</CardTitle>
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                  <Field label="Low case: revenue lost to churn (%)" hint="Share of recurring revenue you assume you lose" htmlFor="p-churn"><Input id="p-churn" type="number" min={0} max={100} value={params.churn} onChange={set('churn')} /></Field>
                  <Field label="Base case: new revenue added each month (₹)" hint="New monthly recurring revenue won every month" htmlFor="p-growth"><Input id="p-growth" type="number" min={0} value={params.growth} onChange={set('growth')} /></Field>
                  <Field label="High case: new revenue added each month (₹)" hint={data.pipeline.total ? `Also adds ${rs(data.pipeline.total)} from ${data.pipeline.quotes.length} open quote${data.pipeline.quotes.length === 1 ? '' : 's'}` : 'New monthly recurring revenue won every month'} htmlFor="p-growth-up"><Input id="p-growth-up" type="number" min={0} value={params.growth_up} onChange={set('growth_up')} /></Field>
                </div>
              </Card>

              <Card padding={0} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 4px' }}><CardTitle hint="How each customer's billing pattern was worked out: from the invoice's repeat schedule, its line durations, or the gaps between their invoices.">Recurring customers</CardTitle></div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                    <thead><tr><th style={th}>Customer</th><th style={th}>Billed</th><th style={th}>How we know</th><th style={{ ...th, ...right }}>Per cycle</th><th style={{ ...th, ...right }}>Per year</th><th style={{ ...th, ...right }}>Share</th><th style={th}>Next bill</th></tr></thead>
                    <tbody>
                      {data.customers.map((c) => (
                        <tr key={c.customer}>
                          <td style={{ ...td, fontWeight: 600 }}>{c.customer}</td><td style={td}>{c.cadence}</td><td style={{ ...td, color: T.dim }}>{SOURCE[c.source]}</td>
                          <td style={{ ...td, ...right }}>{rs(c.cycle_amount)}</td><td style={{ ...td, ...right, fontWeight: 600 }}>{rs(c.per_year)}</td><td style={{ ...td, ...right }}>{c.share}%</td><td style={td}>{fmtDate(c.next_billing)}</td>
                        </tr>
                      ))}
                      <tr><td style={{ ...td, fontWeight: 700 }} colSpan={4}>Total</td><td style={{ ...td, ...right, fontWeight: 700 }}>{rs(data.summary.arr)}</td><td style={{ ...td, ...right }}>100%</td><td style={td} /></tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              {(data.one_off.length > 0 || data.pipeline.quotes.length > 0) && (
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : '1fr 1fr', gap: 18 }}>
                  {data.one_off.length > 0 && (
                    <Card>
                      <CardTitle hint="Billed once with no repeat pattern, so they are not in the run-rate.">One-off billings</CardTitle>
                      {data.one_off.map((o) => <div key={`${o.customer}${o.date}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, padding: '5px 0', color: T.text }}><span>{o.customer} <span style={{ color: T.mute }}>· {fmtDate(o.date)}</span></span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{rs(o.amount)}</strong></div>)}
                    </Card>
                  )}
                  {data.pipeline.quotes.length > 0 && (
                    <Card>
                      <CardTitle hint="Sent quotes, counted once per customer and amount. Included only in the high case.">Open quotes</CardTitle>
                      {data.pipeline.quotes.map((q) => <div key={q.number} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13.5, padding: '5px 0', color: T.text }}><span>{q.number} <span style={{ color: T.mute }}>· {q.customer}</span></span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{rs(q.amount)}</strong></div>)}
                    </Card>
                  )}
                </div>
              )}
            </>
          ) : plan && (
            <>
              <Card>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.mute, marginBottom: 6 }}>Growth scenario</div>
                    <Segmented value={scenario} onChange={setScenario} options={[{ value: 'conservative', label: 'Low' }, { value: 'base', label: 'Base' }, { value: 'upside', label: 'High' }]} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, 190px)', gap: 12, flex: narrow ? '1 1 100%' : '0 0 auto' }}>
                    <Field label="Team cost cap (% of revenue)" htmlFor="g-cap"><Input id="g-cap" type="number" min={10} max={100} value={params.cap} onChange={set('cap')} /></Field>
                    <Field label="Employer cost on salary (%)" htmlFor="g-on"><Input id="g-on" type="number" min={0} max={60} value={params.oncost} onChange={set('oncost')} /></Field>
                    <Field label="Founder salary (₹ / month)" htmlFor="g-fd"><Input id="g-fd" type="number" min={0} value={params.founder} onChange={set('founder')} /></Field>
                    <Field label="Other monthly costs (₹)" htmlFor="g-ex"><Input id="g-ex" type="number" min={0} value={params.existing} onChange={set('existing')} /></Field>
                  </div>
                </div>
              </Card>

              <Card>
                <div style={{ fontFamily: T.heading, fontSize: 18, fontWeight: 700, color: T.text, lineHeight: 1.35 }}>
                  {plan.headline.first_hire
                    ? <>First hire: {plan.headline.first_hire.title} — {plan.headline.first_hire.status === 'now' ? 'now' : monthLong(plan.headline.first_hire.month)}</>
                    : 'No hire is affordable from recurring revenue in the next 12 months'}
                </div>
                <div style={{ fontSize: 13.5, color: T.dim, marginTop: 6, lineHeight: 1.5, maxWidth: 820 }}>
                  {plan.headline.next_unlock
                    ? <>Next: <strong style={{ color: T.text }}>{plan.headline.next_unlock.title}</strong> needs monthly recurring revenue of <strong style={{ color: T.text }}>{rs(plan.headline.next_unlock.unlock_mrr)}</strong>
                      {' '}— {rs(plan.headline.next_unlock.gap_mrr)} more than today{plan.headline.next_unlock.more_customers ? `, roughly ${plan.headline.next_unlock.more_customers} more customers at today's average of ${rs(data.growth.current.avg_mrr_per_customer)} a month` : ''}.</>
                    : 'Every role in the plan is scheduled within the year.'}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 18, marginTop: 16 }}>
                  <Stat label="Hiring budget, next 12 months" value={rs(plan.budget.year1_total)} tone="warn" hint={`${rs(plan.budget.payroll)} pay + ${rs(plan.budget.one_time)} one-time`} />
                  <Stat label="Peak monthly team cost" value={rs(plan.budget.peak_monthly)} hint="Salary plus employer cost" />
                  <Stat label="Hires planned" value={plan.headline.hires} hint={`of ${plan.roles.length} roles`} />
                  <Stat label="Left after costs, 12 months" value={rs(plan.budget.end_net)} tone={plan.budget.end_net >= 0 ? 'ok' : 'red'} hint={`Billings − founder pay (${rs(plan.budget.founder_year1)}) − team − other costs`} />
                </div>
              </Card>

              <Card>
                <CardTitle hint="The line is projected monthly recurring revenue. Each dashed line is the revenue a role needs (including earlier hires) so that the team stays within the cost cap. Green dots are the months a hire starts.">Revenue vs what each hire needs</CardTitle>
                <MrrHiringChart plan={plan} current={data.growth.current.mrr} compact={narrow} />
              </Card>

              <Card>
                <CardTitle hint="Monthly billings against the cost of the planned team, one-time hiring cost and your other costs, with the running balance.">Billings vs team cost</CardTitle>
                <PayrollChart plan={plan} compact={narrow} />
              </Card>

              <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))', gap: 14 }}>
                {plan.roles.map((r) => <RoleCard key={r.key} role={r} value={params.costs[r.key] ?? ''} onChange={(v) => setCost(r.key, v)} />)}
              </div>

              <Card padding={0} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 4px' }}><CardTitle hint="Month by month for this scenario.">Hiring budget by month</CardTitle></div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                    <thead><tr><th style={th}>Month</th><th style={{ ...th, ...right }}>Revenue / month</th><th style={{ ...th, ...right }}>Customers</th><th style={th}>Hires</th><th style={{ ...th, ...right }}>Team cost</th><th style={{ ...th, ...right }}>% of revenue</th><th style={{ ...th, ...right }}>Billings</th><th style={{ ...th, ...right }}>After costs</th></tr></thead>
                    <tbody>
                      {plan.timeline.map((t) => (
                        <tr key={t.month}>
                          <td style={{ ...td, fontWeight: 600 }}>{monthLong(t.month)}</td><td style={{ ...td, ...right }}>{rs(t.mrr)}</td><td style={{ ...td, ...right }}>{t.customers}</td>
                          <td style={{ ...td, color: t.hires.length ? T.ok : T.mute }}>{t.hires.length ? t.hires.join(', ') : '—'}</td>
                          <td style={{ ...td, ...right }}>{rs(t.payroll + t.one_time)}</td><td style={{ ...td, ...right }}>{t.payroll_pct}%</td>
                          <td style={{ ...td, ...right }}>{rs(t.billings)}</td><td style={{ ...td, ...right, color: t.net < 0 ? T.red : T.text }}>{rs(t.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card>
                <CardTitle>How this plan is worked out</CardTitle>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.dim, lineHeight: 1.7 }}>
                  <li>A role is hired in the first month when projected recurring revenue can carry the team within the cost cap <em>and</em> its trigger is met (for example, enough customers to need a full-time support person).</li>
                  {data.growth.assumptions.map((a) => <li key={a}>{a}</li>)}
                  <li>Revenue is not profit: this plan shows what the revenue can fund, not your bank balance.</li>
                </ul>
              </Card>
            </>
          )}
        </div>
      )}
    </FinancePage>
  );
}

function RoleCard({ role: r, value, onChange }: { role: GrowthRole; value: string; onChange: (v: string) => void }) {
  const badge = r.status === 'now' ? <Badge tone="ok" dot>Hire now</Badge> : r.status === 'planned' ? <Badge tone="info" dot>Plan for {monthLong(r.hire_month as string)}</Badge> : <Badge tone="neutral">Not within 12 months</Badge>;
  return (
    <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ fontFamily: T.heading, fontSize: 14.5, fontWeight: 700, color: T.text, lineHeight: 1.35 }}><span style={{ color: T.mute, fontWeight: 600 }}>{r.priority}. </span>{r.title}</div>
        {badge}
      </div>
      <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>{r.why}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{r.expertise.map((x) => <Badge key={x}>{x}</Badge>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
        <Field label="Monthly salary (₹)" htmlFor={`sal-${r.key}`}><Input id={`sal-${r.key}`} type="number" min={0} value={value} placeholder={String(r.monthly_salary)} onChange={(e) => onChange(e.target.value)} /></Field>
        <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.5 }}>Cost to you<br /><strong style={{ color: T.text, fontSize: 14 }}>{rs(r.monthly_loaded)}</strong> / month<br />+ {rs(r.one_time)} one-time</div>
      </div>
      <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.55, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
        <div><strong style={{ color: T.dim }}>Trigger:</strong> {r.trigger}</div>
        <div><strong style={{ color: T.dim }}>Revenue needed:</strong> {rs(r.unlock_mrr)} / month with earlier hires ({rs(r.unlock_alone)} on its own)</div>
        {r.status === 'beyond' && r.blocker && <div style={{ color: T.warn, marginTop: 2 }}>{r.blocker}{r.more_customers ? ` — about ${r.more_customers} more customers than today` : ''}</div>}
        {r.status !== 'beyond' && <div style={{ color: T.ok, marginTop: 2 }}>Cost within the next 12 months: {rs(r.year1_cost)}</div>}
        {r.note && <div style={{ marginTop: 2 }}>{r.note}</div>}
      </div>
    </Card>
  );
}

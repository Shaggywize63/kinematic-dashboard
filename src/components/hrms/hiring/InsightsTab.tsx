'use client';
// Hiring insights, computed by hiringInsights() (a pure function the tests check). Simple bars, with the numbers beside them.

import { Card, CardTitle, Stat, StatGrid, T } from '../ui';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { SOURCE_LABEL, STAGE_LABEL, type HiringState } from '../../../lib/hrms/hiring/types';
import { hiringInsights } from '../../../lib/hrms/hiring/engines';
import { ColumnChart, HBars } from './charts';
import { Lead, subtle } from './shared';

export default function InsightsTab({ st }: { st: HiringState }) {
  const x = hiringInsights(st.candidates, st.openings, PREVIEW_TODAY);
  const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 14 } as const;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} data-testid="insights">
      <StatGrid>
        <div data-testid="stat-tth"><Stat label="Time to hire" value={x.timeToHire.average == null ? '—' : `${x.timeToHire.average} days`} hint={x.timeToHire.count ? `Average of ${x.timeToHire.count} hire${x.timeToHire.count === 1 ? '' : 's'}, application to accepted offer. Median ${x.timeToHire.median}.` : 'No hires yet.'} /></div>
        <div data-testid="stat-accept"><Stat label="Offer accept rate" value={x.offers.acceptRate == null ? '—' : `${x.offers.acceptRate}%`} hint={`${x.offers.accepted} accepted, ${x.offers.declined} declined, ${x.offers.waiting} waiting`} /></div>
        <div data-testid="stat-funnel"><Stat label="Applied to hired" value={`${x.funnel[4]!.pctOfApplied}%`} hint={`${x.funnel[4]!.reached} of ${x.funnel[0]!.reached} candidates`} /></div>
        <div data-testid="stat-open"><Stat label="Seats still open" value={x.age.reduce((s, a) => s + a.seats, 0)} hint={`On ${x.age.reduce((s, a) => s + a.openings, 0)} live openings`} /></div>
      </StatGrid>

      <div style={grid}>
        <Card>
          <CardTitle>Funnel by stage</CardTitle>
          <Lead>How many candidates reached each stage, and what share of the stage before moved on. Rejected people count at the furthest stage they reached.</Lead>
          <HBars testId="funnel" rows={x.funnel.map((f) => ({
            label: STAGE_LABEL[f.stage], value: f.reached, text: f.reached,
            sub: f.stepConversion == null ? 'Everyone who applied' : `${f.stepConversion}% of ${STAGE_LABEL[x.funnel[x.funnel.findIndex((y) => y.stage === f.stage) - 1]!.stage]}`,
          }))} />
        </Card>
        <Card>
          <CardTitle>Source effectiveness</CardTitle>
          <Lead>Share of applicants from each source who were hired. Small numbers: read the counts, not just the percentage.</Lead>
          <HBars testId="sources" rows={x.sources.map((s) => ({ label: SOURCE_LABEL[s.source], value: s.hireRate ?? 0, text: `${s.hireRate ?? 0}%`, sub: `${s.hired} hired of ${s.applicants} · ${s.interviewed} interviewed` }))} max={Math.max(20, ...x.sources.map((s) => s.hireRate ?? 0))} />
        </Card>
        <Card>
          <CardTitle>Open positions by age</CardTitle>
          <Lead>Unfilled seats on live openings, grouped by days since they went live.</Lead>
          <ColumnChart testId="age-chart" ariaLabel="Open seats by age of the opening" labels={x.age.map((a) => a.label.replace(' days', ''))} stacks={[{ id: 'seats', label: 'seats open', color: 'var(--hv-1)', values: x.age.map((a) => a.seats) }]} />
          <div style={{ ...subtle, marginTop: 6 }}>{x.age.map((a) => `${a.label}: ${a.seats} seat${a.seats === 1 ? '' : 's'}`).join(' · ')}</div>
        </Card>
        <Card>
          <CardTitle>Why candidates were rejected</CardTitle>
          <Lead>Reason codes chosen when someone is rejected. Codes cover the role and the process only.</Lead>
          {x.rejections.length === 0 ? <div style={subtle}>No rejections yet.</div>
            : <HBars testId="rejections" rows={x.rejections.map((r) => ({ label: r.label, value: r.count, text: r.count }))} color="var(--hv-2)" />}
        </Card>
      </div>
      <Card>
        <CardTitle>How these are worked out</CardTitle>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
          <li>Time to hire: days from the application date to the move to Hired, averaged over everyone hired.</li>
          <li>Funnel: a candidate counts at a stage if they ever reached it. Step conversion is the stage count divided by the count of the stage before.</li>
          <li>Offer accept rate: accepted divided by accepted plus declined. Offers still waiting are left out.</li>
          <li>Open positions by age: days since the opening went live, on seats not yet filled (on-hold openings included).</li>
        </ul>
      </Card>
    </div>
  );
}

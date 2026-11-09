'use client';
// Team health: workload and wellbeing signals from the field evidence, at team level only and never for a team
// smaller than 5. Below them, the weekly-off check, which is about the law and so does name people.

import { useMemo } from 'react';
import Link from 'next/link';
import { Badge, Card, CardTitle, Loading, Note, Stat, StatGrid, T } from '../ui';
import { fmtDate, fmtMonth } from '../../../lib/hrms/format';
import { getFieldEvidence } from '../../../lib/hrms/field/evidence';
import { allRestStreaks, EVENING_FROM, LONG_DAY_MIN, MIN_TEAM_SIZE, teamsOf, teamSummary, teamWeekly } from '../../../lib/hrms/fieldpay/engines';
import { fieldPayStore } from '../../../lib/hrms/fieldpay/store';
import type { Team } from '../../../lib/hrms/fieldpay/types';
import type { HrmsDb } from '../../../lib/hrms/types';
import { makeNamer, num1, pctText } from './common';
import { WeekBars } from './WeekBars';
import WeeklyOffCard from './WeeklyOffCard';

export default function TeamHealthView({ db }: { db: HrmsDb }) {
  const ev = getFieldEvidence();
  const fp = fieldPayStore.use();
  const namer = useMemo(() => makeNamer(db), [db]);
  const teams = useMemo(() => teamsOf(ev), [ev]);
  const streaks = useMemo(() => allRestStreaks(ev), [ev]);
  if (!fp) return <Loading />;

  return (
    <>
      <div data-testid="th-purpose">
        <Card>
          <CardTitle>What this is for</CardTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, lineHeight: 1.6 }}>
            <div>Help managers rebalance beats before people burn out. If a team is running long days or going without rest days, the fix is usually in the beat plan, so start on the <Link href="/dashboard/hrms/territory" style={{ color: T.info }}>Territory &amp; beats</Link> page.</div>
            <div>It is not used to rate individuals. Every number below is a team figure. Nothing here shows a person&apos;s name, ranks anyone or gives anyone a score. A team with fewer than {MIN_TEAM_SIZE} people is not shown at all, because a number for two people points at one of them.</div>
            <div>The signals come from phone punches and visits. They show workload, not how anyone feels, so use them to start a conversation and not to end one.</div>
          </div>
        </Card>
      </div>

      {teams.map((t) => <TeamCard key={t.name} team={t} />)}

      <WeeklyOffCard streaks={streaks} state={fp} namer={namer} windowText={`Looked at ${fmtDate(ev.from)} to ${fmtDate(ev.to)}. A day counts as worked when there is a punch or a visit.`} />
    </>
  );
}

function TeamCard({ team }: { team: Team }) {
  const ev = getFieldEvidence();
  const weeks = useMemo(() => (team.shown ? teamWeekly(ev, team.empIds) : []), [ev, team]);
  const sum = useMemo(() => (team.shown ? teamSummary(ev, team.empIds) : null), [ev, team]);
  const slug = team.name.toLowerCase();

  if (!team.shown || !sum) {
    return (
      <div data-testid={`team-${slug}`}>
        <Card>
          <CardTitle right={<Badge tone="neutral">{team.size} people</Badge>}>{team.name} team</CardTitle>
          <div data-testid={`team-${slug}-hidden`} style={{ fontSize: 14, lineHeight: 1.6, color: T.dim }}>
            Not shown: fewer than {MIN_TEAM_SIZE} people, to protect privacy.
          </div>
        </Card>
      </div>
    );
  }

  const labels = weeks.map((w) => fmtDate(w.weekStart).replace(/ \d{4}$/, ''));
  const partial = weeks.map((w) => !w.fullWeek);
  const oct = sum.noPunchByMonth.find((m) => m.month === '2026-10');
  const nov = sum.noPunchByMonth.find((m) => m.month === '2026-11');
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

  return (
    <div data-testid={`team-${slug}`}>
      <Card>
        <CardTitle right={<Badge tone="neutral">{team.size} people, team totals only</Badge>}>{team.name} team</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <StatGrid min={190}>
            <div data-testid="th-long"><Stat label="Long days" value={pctText(sum.longDayShare, 1)} hint={`${sum.longDays} of ${sum.spanDays} worked days ran over ${LONG_DAY_MIN / 60} hours`} /></div>
            <div data-testid="th-span"><Stat label="Average day" value={sum.avgSpanH != null ? `${num1(sum.avgSpanH)} h` : '—'} hint="First punch-in to last punch-out" /></div>
            <div data-testid="th-evening"><Stat label={`Visits after ${EVENING_FROM}`} value={sum.eveningVisits} hint={`In ${days(sum.workedDays)} worked by the team`} /></div>
            <div data-testid="th-absence"><Stat label="No-punch days" value={oct ? `${num1(oct.perPerson)} per person` : '—'}
              hint={`${oct ? fmtMonth(oct.month) : ''}${nov ? `. ${fmtMonth(nov.month)} so far: ${num1(nov.perPerson)}` : ''}. May include approved leave`} /></div>
            <div data-testid="th-rest"><Stat label="Rest-day coverage" value={pctText(sum.restCoverage)} hint={`Person-weeks with a day off, ${sum.fullWeeks} full weeks`} /></div>
          </StatGrid>

          <div data-testid="th-charts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 16 }}>
            <ChartCard title="Share of worked days over 10 hours" note="By week. A rising bar means long days are becoming usual.">
              <WeekBars title="Share of worked days over 10 hours" values={weeks.map((w) => w.longDayShare)} labels={labels} partial={partial} fmt={(n) => `${(n * 100).toFixed(0)}%`} floor={0.1} testId="chart-long" />
            </ChartCard>
            <ChartCard title="Average length of day (hours)" note="Dashed line is the 10-hour mark.">
              <WeekBars title="Average length of day in hours" values={weeks.map((w) => w.avgSpanH)} labels={labels} partial={partial} fmt={(n) => `${n.toFixed(1)}`} floor={12} refLine={{ value: 10, label: '10 h' }} testId="chart-span" />
            </ChartCard>
            <ChartCard title={`Visits that started after ${EVENING_FROM}`} note="Team total per week.">
              <WeekBars title="Evening visits per week" values={weeks.map((w) => w.eveningVisits)} labels={labels} partial={partial} fmt={(n) => String(n)} floor={5} testId="chart-evening" />
            </ChartCard>
            <ChartCard title="No-punch days per person" note="Working days (Monday to Saturday, not a holiday) with no punch or visit.">
              <WeekBars title="No-punch days per person" values={weeks.map((w) => w.noPunchPerPerson)} labels={labels} partial={partial} fmt={(n) => num1(n)} floor={2} testId="chart-absence" />
            </ChartCard>
            <ChartCard title="People with at least one day off in the week" note="Full weeks only. A part week cannot show a missing rest day.">
              <WeekBars title="Share of people with a rest day" values={weeks.map((w) => w.restCoverage)} labels={labels} partial={partial} fmt={(n) => `${(n * 100).toFixed(0)}%`} floor={1} fixedMax={1.15} testId="chart-rest" />
            </ChartCard>
          </div>

          <details data-testid="th-table">
            <summary style={{ cursor: 'pointer', fontSize: 13.5, color: T.info }}>Show the numbers as a table</summary>
            <div style={{ overflowX: 'auto', marginTop: 10, border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640, fontSize: 13 }}>
                <thead><tr>{['Week starting', 'Days worked', 'Long days', 'Average day (h)', 'Evening visits', 'No-punch days', 'Rest-day coverage'].map((h) => (
                  <th key={h} style={{ textAlign: h === 'Week starting' ? 'left' : 'right', padding: '8px 12px', fontSize: 11.5, color: T.mute, borderBottom: `1px solid ${T.border}`, fontWeight: 600, background: T.panel }}>{h}</th>))}</tr></thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.weekStart}>
                      <td style={td}>{fmtDate(w.weekStart)}{w.fullWeek ? '' : ' (part week)'}</td>
                      <td style={tdr}>{w.workedDays}</td>
                      <td style={tdr}>{w.longDays}</td>
                      <td style={tdr}>{w.avgSpanH != null ? w.avgSpanH.toFixed(1) : '—'}</td>
                      <td style={tdr}>{w.eveningVisits}</td>
                      <td style={tdr}>{w.noPunchDays}</td>
                      <td style={tdr}>{w.restCoverage != null ? pctText(w.restCoverage) : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div style={{ fontSize: 12.5, color: T.dim }}>Weeks start on Monday. A star marks a part week: the evidence runs from {fmtDate(ev.from)} to {fmtDate(ev.to)}. The length of a day is first punch-in to last punch-out; where a punch is missing it is estimated from the first and last verified visit.</div>
          <Note>Team totals only. No names, no ranking and no score for any person appear in this card.</Note>
        </div>
      </Card>
    </div>
  );
}

const td = { padding: '8px 12px', borderTop: `1px solid ${T.border}`, color: T.text } as const;
const tdr = { ...td, textAlign: 'right' } as const;

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 14, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 13.5 }}>{title}</div>
      {children}
      <div style={{ fontSize: 12.5, color: T.dim }}>{note}</div>
    </div>
  );
}

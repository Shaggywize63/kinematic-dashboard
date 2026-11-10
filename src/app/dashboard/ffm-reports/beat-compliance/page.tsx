'use client';
import { useMemo, useState } from 'react';
import { presetRange } from '../../../../components/attendance/RangePresets';
import { ffmReports, type BeatCompliancePayload, type BeatRep, type BeatWeek } from '../../../../components/ffm/reports/ffmReportsApi';
import {
  ReportHeader, FilterCard, FilterSelect, StatGrid, Stat, Notes, StatusBox, DataTable, FooterRow,
  useReportData, useRepOptions, csvOf, downloadCsv, type Col,
} from '../../../../components/ffm/reports/ReportKit';
import { fmtDay, fmtInt, fmtPct, rangeProblem } from '../../../../components/ffm/reports/reportUtils';

/**
 * Beat Compliance — planned vs visited calls week by week (Mon–Sun), overall and per rep, with the
 * plan days on which a rep visited nobody at all. The first and last week of the range can be partial.
 * Data: GET /api/v1/analytics/ffm/reports/beat-compliance?from&to&user_id.
 */
export default function BeatComplianceReport() {
  const [from, setFrom] = useState(() => presetRange('month').from);
  const [to, setTo] = useState(() => presetRange('month').to);
  const [userId, setUserId] = useState('');
  const problem = rangeProblem(from, to);
  const { data, loading, error, reload } = useReportData<BeatCompliancePayload>(
    () => ffmReports.beatCompliance({ from, to, user_id: userId || undefined }).then((r) => r.data), [from, to, userId], !problem,
  );
  const options = useRepOptions(data?.rep_options);
  const weeks: BeatWeek[] = data?.weeks ?? [];
  const reps: BeatRep[] = data?.reps ?? [];

  const repCols: Array<Col<BeatRep>> = useMemo(() => [
    { key: 'fe_name', label: 'Rep', csv: (r) => r.fe_name },
    { key: 'planned', label: 'Planned calls', align: 'right', csv: (r) => r.planned },
    { key: 'visited', label: 'Visited', align: 'right', csv: (r) => r.visited },
    { key: 'missed', label: 'Missed', align: 'right', csv: (r) => r.missed },
    { key: 'adherence_pct', label: 'Adherence %', align: 'right', csv: (r) => r.adherence_pct, cell: (r) => fmtPct(r.adherence_pct) },
    { key: 'plan_days', label: 'Plan days', align: 'right', csv: (r) => r.plan_days },
    { key: 'zero_visit_days', label: 'Plan days with no visit', align: 'right', hint: 'days with a plan where nothing was visited', csv: (r) => r.zero_visit_days },
    ...weeks.map((w): Col<BeatRep> => ({
      key: `w_${w.week_start}`, label: `${w.week} %`, align: 'right', hint: `week of ${w.week_start}`,
      csv: (r) => r.by_week?.[w.week_start] ?? null, cell: (r) => fmtPct(r.by_week?.[w.week_start]),
    })),
  ], [weeks]);

  const weekCols: Array<Col<BeatWeek>> = useMemo(() => [
    { key: 'week', label: 'Week', csv: (w) => w.week },
    { key: 'week_start', label: 'Starts (Mon)', csv: (w) => w.week_start, cell: (w) => fmtDay(w.week_start) },
    { key: 'planned', label: 'Planned calls', align: 'right', csv: (w) => w.planned },
    { key: 'visited', label: 'Visited', align: 'right', csv: (w) => w.visited },
    { key: 'missed', label: 'Missed', align: 'right', csv: (w) => w.missed },
    { key: 'adherence_pct', label: 'Adherence %', align: 'right', csv: (w) => w.adherence_pct, cell: (w) => fmtPct(w.adherence_pct) },
    { key: 'active_reps', label: 'Reps with a plan', align: 'right', csv: (w) => w.active_reps },
  ], []);

  const exportCsv = () => {
    const totals = data?.totals;
    const repCsv = csvOf(repCols, reps, totals ? { planned: totals.planned, visited: totals.visited, missed: totals.missed, adherence_pct: totals.adherence_pct, plan_days: totals.plan_days, zero_visit_days: totals.zero_visit_days } : undefined, 'All reps');
    const weekCsv = csvOf(weekCols, weeks);
    downloadCsv(`beat-compliance-${from}_to_${to}.csv`, `${repCsv}\n\nWeekly totals\n${weekCsv}`);
  };

  const t = data?.totals;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ReportHeader
        title="Beat Compliance"
        intro="Planned vs visited calls by week, overall and per rep, plus the plan days on which nothing was visited."
        onExport={exportCsv} exportDisabled={loading || (reps.length === 0 && weeks.length === 0)}
      />
      <FilterCard idPrefix="ffm-bc" from={from} to={to} onRange={(f, e) => { setFrom(f); setTo(e); }}>
        <FilterSelect id="ffm-bc-rep" label="Rep" value={userId} onChange={setUserId}
          options={[{ value: '', label: 'All reps' }, ...options.map((o) => ({ value: o.id, label: o.name }))]} />
      </FilterCard>

      <StatusBox loading={loading} error={error} onRetry={reload}>
        <StatGrid>
          <Stat label="Adherence" value={fmtPct(t?.adherence_pct ?? 0)} hint={data?.median_adherence_pct != null ? `median rep ${fmtPct(data.median_adherence_pct)}` : undefined} />
          <Stat label="Planned calls" value={fmtInt(t?.planned ?? 0)} />
          <Stat label="Visited" value={fmtInt(t?.visited ?? 0)} />
          <Stat label="Missed" value={fmtInt(t?.missed ?? 0)} />
          <Stat label="Plan days, no visit" value={fmtInt(t?.zero_visit_days ?? 0)} hint={`of ${fmtInt(t?.plan_days ?? 0)} plan days`} />
        </StatGrid>

        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>By week</div>
        <DataTable testId="beat-week-table" cols={weekCols} rows={weeks} rowKey={(w) => w.week_start} minWidth={560}
          empty="No route plans in the selected range." initialSort={{ key: 'week_start', dir: 'asc' }} />

        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>By rep</div>
        <DataTable testId="beat-rep-table" cols={repCols} rows={reps} rowKey={(r) => r.fe_id} minWidth={760 + weeks.length * 90}
          empty="No route plans in the selected range."
          initialSort={{ key: 'fe_name', dir: 'asc' }}
          footer={t && reps.length > 0 ? <FooterRow cols={repCols} label="All reps" values={{
            planned: fmtInt(t.planned), visited: fmtInt(t.visited), missed: fmtInt(t.missed), adherence_pct: fmtPct(t.adherence_pct),
            plan_days: fmtInt(t.plan_days), zero_visit_days: fmtInt(t.zero_visit_days),
          }} /> : null}
        />
        <Notes>
          A call is one outlet for one rep on one day (several plans for the same outlet and day count once). It counts as visited when its status is visited,
          completed, done or checked out. Weeks run Monday to Sunday and the first and last week of the range can be partial. Plan days after today are not
          counted as missed. The median rep adherence is the basis for comparing reps; a low week can be leave, a holiday or a re-planned beat, so check before acting.
        </Notes>
      </StatusBox>
    </div>
  );
}

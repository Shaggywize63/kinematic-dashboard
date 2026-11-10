'use client';
import { useMemo, useState } from 'react';
import { crmAnalyticsPlus, type WorkloadRow } from '../../../../../lib/crmAnalyticsExtApi';
import PlusReport, { BarsChart, ChartCard, ChartGrid, usePlusReportData } from '../../../../../components/crm/analytics/PlusReport';
import { defaultReportRange, useReportCityKey } from '../../../../../components/crm/reports/ReportFilters';
import { Select } from '../../../../../components/ui';
import { useLeadFieldGate } from '../../../../../lib/crm/useLeadFieldGate';
import { fmtDays, fmtInt, fmtMinutes, fmtPct, type Column } from '../../../../../lib/crm/plusFormat';
import { usePageTitle } from '../../../../../lib/pageTitle';

const SLAS = [
  { v: 15, label: '15 minutes' }, { v: 30, label: '30 minutes' }, { v: 60, label: '1 hour' },
  { v: 120, label: '2 hours' }, { v: 240, label: '4 hours' }, { v: 1440, label: '24 hours' },
];

/**
 * Owner Workload and first-touch SLA: how much is on each owner's plate and how
 * fast new leads got a first touch. A workload view, not a score. Lead owner is
 * a built-in lead field: if an admin hides it, the report is withheld.
 */
export default function OwnerWorkloadPage() {
  usePageTitle('Owner Workload');
  const gate = useLeadFieldGate();
  const cityKey = useReportCityKey();
  const [range, setRange] = useState(() => defaultReportRange(30));
  const [sla, setSla] = useState(60);
  const { data, loading, error, reload } = usePlusReportData(() => crmAnalyticsPlus.ownerWorkload(range, sla), [range.from, range.to, sla, cityKey]);

  const ownerLabel = gate.labelFor('owner_id', 'Owner');
  const columns: Array<Column<WorkloadRow>> = useMemo(() => [
    { label: ownerLabel, value: (r) => r.owner },
    { label: 'Open leads', value: (r) => r.open_leads, display: (r) => fmtInt(r.open_leads), numeric: true },
    { label: 'Share of open leads %', value: (r) => r.share_of_open_pct, display: (r) => fmtPct(r.share_of_open_pct), numeric: true },
    { label: 'New leads in range', value: (r) => r.new_leads, display: (r) => fmtInt(r.new_leads), numeric: true },
    { label: 'Never touched', value: (r) => r.never_touched, display: (r) => fmtInt(r.never_touched), numeric: true },
    { label: 'Idle 7 days+', value: (r) => r.idle_7d, display: (r) => fmtInt(r.idle_7d), numeric: true },
    { label: 'Idle 14 days+', value: (r) => r.idle_14d, display: (r) => fmtInt(r.idle_14d), numeric: true },
    { label: 'Idle 30 days+', value: (r) => r.idle_30d, display: (r) => fmtInt(r.idle_30d), numeric: true },
    { label: 'Avg open lead age (days)', value: (r) => r.avg_open_age_days, display: (r) => fmtDays(r.avg_open_age_days), numeric: true },
    { label: 'Overdue follow-ups', value: (r) => r.overdue_followups, display: (r) => fmtInt(r.overdue_followups), numeric: true },
    { label: 'New leads touched', value: (r) => r.first_touch_leads, display: (r) => fmtInt(r.first_touch_leads), numeric: true },
    { label: 'Median first touch (minutes)', value: (r) => r.median_first_touch_minutes, display: (r) => fmtMinutes(r.median_first_touch_minutes), numeric: true },
    { label: 'First-touch SLA breach %', value: (r) => r.sla_breach_pct, display: (r) => fmtPct(r.sla_breach_pct), numeric: true },
  ], [ownerLabel]);

  const rows = data?.rows ?? [];
  const t = data?.totals;
  const blocked = gate.didLoad ? gate.blockedBy('owner_workload') : [];
  const chart = rows.map((r) => ({ name: r.owner, 'Open leads': r.open_leads, 'Idle 14 days+': r.idle_14d, 'Overdue follow-ups': r.overdue_followups }));
  const slaLabel = SLAS.find((s) => s.v === (data?.sla_minutes ?? sla))?.label ?? `${sla} minutes`;

  return (
    <PlusReport<WorkloadRow>
      testId="report-owner-workload"
      title="Owner Workload and Response Time"
      description="Open leads, idle leads and overdue follow-ups per owner, and how fast new leads got a first touch."
      range={{ value: range, onChange: setRange }}
      controls={(
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
          First-touch SLA
          <Select aria-label="First-touch SLA" value={String(sla)} onChange={(e) => setSla(Number(e.target.value))} style={{ width: 130 }}>
            {SLAS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </Select>
        </label>
      )}
      kpis={t ? [
        { label: 'Open leads', value: fmtInt(t.open_leads) },
        { label: 'Never touched', value: fmtInt(t.never_touched), hint: 'open leads with no activity' },
        { label: 'Idle 14 days+', value: fmtInt(t.idle_14d) },
        { label: 'Overdue follow-ups', value: fmtInt(t.overdue_followups) },
        { label: 'Median first touch', value: fmtMinutes(t.median_first_touch_minutes), hint: `${fmtInt(t.first_touch_leads)} new leads touched` },
        { label: 'SLA breach', value: fmtPct(t.sla_breach_pct), hint: `first touch slower than ${slaLabel}` },
      ] : []}
      columns={columns}
      rows={rows}
      totals={rows.length && t ? t : null}
      rowKey={(r, i) => `${r.owner_id ?? 'none'}-${i}`}
      loading={loading || !gate.didLoad}
      error={error}
      onRetry={reload}
      emptyTitle="No open leads or new leads in this range"
      emptyHint="Try a wider date range, or clear the city filter."
      csvName="owner-workload"
      blockedMessage={blocked.length ? `An admin turned off the ${ownerLabel} field in Settings, so leads cannot be grouped by it.` : null}
      notes={(
        <>
          This is a workload and responsiveness view, not a performance score: compare owners with similar territories and lead mix.
          <b> Idle N days+</b> = open leads whose last activity (or creation date, if never touched) is N or more days ago. <b>Overdue follow-ups</b> = open scheduled activities past their due time.
          <b> First touch</b> = minutes from lead creation to the first activity on it, for leads created in the date range; <b>SLA breach %</b> = touched leads whose first touch took longer than the chosen SLA.
          Leads with no owner are listed as Unassigned.
        </>
      )}
    >
      {rows.length > 0 && (
        <ChartGrid>
          <ChartCard title="Open leads, idle leads and overdue follow-ups by owner"><BarsChart data={chart} xKey="name" keys={['Open leads', 'Idle 14 days+', 'Overdue follow-ups']} /></ChartCard>
        </ChartGrid>
      )}
    </PlusReport>
  );
}

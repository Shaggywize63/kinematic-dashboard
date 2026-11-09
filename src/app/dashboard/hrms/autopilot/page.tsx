'use client';
// Compliance autopilot: this month's filings, how ready each one is from live data, one-click prepare, and the evidence of what was filed.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useHrmsDb } from '../../../../lib/hrms/db';
import type { ComplianceTask, HrmsDb } from '../../../../lib/hrms/types';
import { Badge, Button, Card, CardTitle, DataTable, EmptyState, HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam, type Col } from '../../../../components/hrms/ui';
import { autopilotSummary, readinessFor, taskStatus, type Readiness } from '../../../../lib/hrms/control/autopilot';
import { controlStore, recordFiling, reopenFiling, setManualCheck } from '../../../../lib/hrms/control/store';
import type { ControlState } from '../../../../lib/hrms/control/types';
import { diffDays, fmtDate } from '../../../../lib/hrms/format';
import AutoCard from '../../../../components/hrms/control/AutoCard';
import AutoCalendar from '../../../../components/hrms/control/AutoCalendar';
import { EvidenceModal, FileModal, PrepareModal } from '../../../../components/hrms/control/AutoModals';
import { ConfirmModal, Muted, Stack } from '../../../../components/hrms/control/parts';

const TABS = ['todo', 'filed'] as const;

export default function AutopilotPage() {
  const db = useHrmsDb();
  const state = controlStore.use();
  if (!db || !state) return <Loading />;
  return <Body db={db} state={state} />;
}

function Body({ db, state }: { db: HrmsDb; state: ControlState }) {
  const [tab, setTab] = useTabParam(TABS, 'todo');
  const [prepareId, setPrepareId] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const [reopenId, setReopenId] = useState<string | null>(null);
  const manual = state.autopilot.manual;

  const open = useMemo(() => db.compliance.filter((t) => taskStatus(t) !== 'filed')
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name))
    .map((t) => readinessFor(db, t, manual)), [db, manual]);
  const filed = useMemo(() => db.compliance.filter((t) => taskStatus(t) === 'filed').sort((a, b) => (b.filedOn ?? '').localeCompare(a.filedOn ?? '')), [db]);
  const summary = useMemo(() => autopilotSummary(db, manual), [db, manual]);
  const find = (id: string | null): Readiness | undefined => (id ? open.find((r) => r.task.id === id) : undefined);
  const prepare = find(prepareId); const filing = find(fileId);
  const evTask = evidenceId ? db.compliance.find((t) => t.id === evidenceId) : undefined;
  const reopenTask = reopenId ? db.compliance.find((t) => t.id === reopenId) : undefined;

  const cols: Col<ComplianceTask>[] = [
    { key: 'name', label: 'Filing', render: (t) => <div><div style={{ fontWeight: 600 }}>{t.name}</div><Muted>{db.entities.find((e) => e.id === t.entityId)?.name}{t.state ? `, ${t.state}` : ''}</Muted></div> },
    { key: 'law', label: 'Law', render: (t) => <Badge tone="neutral" mono>{t.law}</Badge> },
    { key: 'due', label: 'Due', nowrap: true, sortValue: (t) => t.dueOn, render: (t) => fmtDate(t.dueOn) },
    { key: 'filed', label: 'Filed', nowrap: true, sortValue: (t) => t.filedOn ?? '', render: (t) => fmtDate(t.filedOn) },
    { key: 'ref', label: 'Reference', nowrap: true, render: (t) => <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 12.5 }}>{t.reference}</span> },
    { key: 'ontime', label: 'Timing', nowrap: true, render: (t) => { const d = t.filedOn ? diffDays(t.dueOn, t.filedOn) : 0; return <Badge tone={d > 0 ? 'warn' : 'ok'} dot>{d > 0 ? `${d} ${d === 1 ? 'day' : 'days'} late` : 'On time'}</Badge>; } },
    { key: 'ev', label: '', align: 'right', render: (t) => <Button size="sm" onClick={() => setEvidenceId(t.id)} aria-label={`Evidence pack: ${t.name}`}>Evidence pack</Button> },
  ];

  return (
    <HrmsPage
      eyebrow="HRMS · Control"
      title="Compliance autopilot"
      description="This month's filings, how ready each one is from live data, and one click to prepare the working file. Filing itself still happens on the portals."
    >
      <StatGrid min={170}>
        <div data-testid="sum-ontime"><Stat label="Filed on time" value={summary.onTimePct == null ? '—' : `${summary.onTimePct}%`} hint={`${summary.onTime} of ${summary.filed} filed`} tone={summary.onTimePct == null ? undefined : summary.onTimePct >= 90 ? 'ok' : 'warn'} /></div>
        <div data-testid="sum-overdue"><Stat label="Overdue" value={summary.overdue} tone={summary.overdue ? 'red' : 'ok'} hint={summary.overdue ? 'Needs action now' : 'Nothing late'} /></div>
        <div data-testid="sum-week"><Stat label="Due this week" value={summary.dueThisWeek} tone={summary.dueThisWeek ? 'warn' : undefined} hint="Today and the next 7 days" /></div>
        <div data-testid="sum-ready"><Stat label="Average readiness" value={summary.avgReadiness == null ? '—' : `${summary.avgReadiness}%`} hint={`Across ${summary.open} open filings`} /></div>
      </StatGrid>

      <AutoCalendar db={db} />

      <TabBar value={tab} onChange={setTab} tabs={[{ key: 'todo', label: 'To file', count: open.length }, { key: 'filed', label: 'Filed, with evidence', count: filed.length }]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'todo' && (
          <Stack gap={12}>
            {open.length === 0 && <Card><EmptyState title="Everything is filed" description="Nothing is waiting. New due dates appear here when they are added to the compliance calendar." /></Card>}
            {open.map((r) => <AutoCard key={r.task.id} db={db} r={r} onManual={(c, v) => setManualCheck(r.task.id, c, v)} onPrepare={() => setPrepareId(r.task.id)} onFile={() => setFileId(r.task.id)} />)}
          </Stack>
        )}
        {tab === 'filed' && (
          <Card>
            <CardTitle>Filed, with evidence</CardTitle>
            <div data-testid="filed-table"><DataTable columns={cols} rows={filed} minWidth={820} empty="Nothing has been filed yet." /></div>
            <Muted style={{ marginTop: 10 }}>The evidence pack holds the reference, the dates, who filed it and the names of what was attached. The preview does not store the files.</Muted>
          </Card>
        )}
      </div>

      {prepare && <PrepareModal db={db} r={prepare} manual={manual} onManual={(c, v) => setManualCheck(prepare.task.id, c, v)} onClose={() => setPrepareId(null)} onFile={() => { setFileId(prepare.task.id); setPrepareId(null); }} />}
      {filing && <FileModal r={filing} onClose={() => setFileId(null)} onConfirm={(ref, att, note) => { recordFiling(filing.task.id, ref, att, note); toast.success('Marked as filed.'); setFileId(null); setTab('filed'); }} />}
      {evTask && <EvidenceModal db={db} task={evTask} evidence={state.autopilot.evidence[evTask.id]} onClose={() => setEvidenceId(null)} onReopen={() => { setReopenId(evTask.id); setEvidenceId(null); }} />}
      {reopenTask && (
        <ConfirmModal title="Reopen this filing?" confirmLabel="Reopen" danger onClose={() => setReopenId(null)} onConfirm={() => { reopenFiling(reopenTask.id); toast.success('Filing reopened.'); setReopenId(null); setTab('todo'); }}>
          “{reopenTask.name}” goes back to the list of open filings, and its reference and evidence are removed. Use this only if it was marked filed by mistake.
        </ConfirmModal>
      )}
    </HrmsPage>
  );
}

'use client';
// The other tabs of the monitoring ledger: employee notice, consent coverage, retention check and change log.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmptyState, Note, ProgressBar, T, downloadText, type Col } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { DEFAULT_WINDOW_DAYS, consentCoverage, noticeText, policyWindow, retentionFlags, retentionText, type RetentionFlag } from '../../../lib/hrms/control/monitoring';
import { requestConsent, shortenRetention } from '../../../lib/hrms/control/store';
import type { ControlState, MonitoringLogEntry, MonitoringRow } from '../../../lib/hrms/control/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import { Conf, Muted, Row, SimulationBadge, Stack } from './parts';
import { KeepReasonModal } from './MonModals';

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

// ───────────────────────────── notice ─────────────────────────────
export function NoticeTab({ rows }: { rows: MonitoringRow[] }) {
  const text = useMemo(() => noticeText(rows), [rows]);
  const [copied, setCopied] = useState(false);
  return (
    <Stack>
      <Card>
        <CardTitle right={<Row gap={8}><Conf level="indicative" /><Badge tone="neutral">English</Badge></Row>}>What an employee sees</CardTitle>
        <Muted style={{ marginBottom: 12 }}>This notice is written from the ledger. Change a row and the notice changes with it. It is a draft: have your advisor read it before you share it with employees.</Muted>
        <div data-testid="notice-text" style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '16px 18px', fontSize: 14, lineHeight: 1.65, color: T.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'all' }}>{text}</div>
        <Row gap={8} style={{ marginTop: 14 }}>
          <Button variant="primary" data-testid="copy-notice" onClick={async () => { const ok = await copyText(text); setCopied(ok); if (ok) toast.success('Notice copied.'); else toast.error('Could not copy. Select the text and copy it by hand.'); }}>{copied ? 'Copied' : 'Copy notice'}</Button>
          <Button onClick={() => downloadText('monitoring-notice.txt', text)}>Download as text</Button>
        </Row>
      </Card>
    </Stack>
  );
}

// ───────────────────────────── consent ─────────────────────────────
export function ConsentTab({ db, state }: { db: HrmsDb; state: ControlState }) {
  const rows = state.monitoring.rows.filter((r) => r.status !== 'blocked');
  const withConsent = rows.filter((r) => r.legalBasis === 'consent');
  const others = rows.filter((r) => r.legalBasis !== 'consent');
  const requested = (rowId: string, empId: string) => state.monitoring.consentRequests.find((c) => c.rowId === rowId && c.employeeId === empId);
  return (
    <Stack>
      <Note tone="info">Consent coverage counts the consent records in the Privacy module. A person has coverage when they have a record for the purpose that has not been withdrawn.</Note>
      {withConsent.map((r) => {
        const c = consentCoverage(db, r);
        const pct = c.covered ? Math.round((c.withConsent / c.covered) * 100) : 100;
        return (
          <div key={r.id} data-testid={`consent-${r.id}`}>
            <Card>
              <CardTitle right={<Badge tone={c.missing.length ? 'warn' : 'ok'} dot>{c.missing.length ? `${c.missing.length} missing` : 'Everyone covered'}</Badge>}>{r.name}</CardTitle>
              <Muted style={{ marginBottom: 10 }}>Consent purpose: “{c.purpose}”. Covers: {r.coverage.label}.</Muted>
              <ProgressBar pct={pct} tone={c.missing.length ? 'warn' : 'ok'} height={8} />
              <div style={{ fontSize: 13.5, color: T.text, marginTop: 6 }} data-testid={`consent-count-${r.id}`}>{c.withConsent} of {c.covered} covered {c.covered === 1 ? 'person has' : 'people have'} a current consent ({pct}%)</div>
              {c.missing.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 6 }}>Who is missing consent</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' }}>
                    {c.missing.map((m) => {
                      const req = requested(r.id, m.employee.id);
                      return (
                        <li key={m.employee.id} data-testid={`missing-${r.id}-${m.employee.id}`} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: '8px 0', borderTop: `1px solid ${T.border}` }}>
                          <div style={{ minWidth: 0 }}>
                            <Link href={`/dashboard/hrms/employees/${m.employee.id}`} style={{ fontWeight: 600, color: T.text, textDecoration: 'none' }}>{fullName(m.employee)}</Link>
                            <Muted>{m.reason === 'withdrawn' ? `Withdrew consent on ${fmtDate(m.since)}. Do not collect from this person; offer another way.` : 'No consent on record.'}</Muted>
                          </div>
                          {req
                            ? <Muted>Requested {fmtDate(req.requestedOn)} (simulation, nothing sent)</Muted>
                            : <Button size="sm" onClick={() => { requestConsent(r.id, m.employee.id, fullName(m.employee)); toast.success('Request recorded. Nothing was sent: this is a simulation.'); }} aria-label={`Request consent from ${fullName(m.employee)} for ${r.name}`}>Request consent</Button>}
                        </li>
                      );
                    })}
                  </ul>
                  <Row gap={8} style={{ marginTop: 8 }}><SimulationBadge>Simulation</SimulationBadge><Muted>The preview sends nothing. It records that a request would go out.</Muted></Row>
                </div>
              )}
            </Card>
          </div>
        );
      })}
      <Card>
        <CardTitle>Practices where consent is not the stated basis</CardTitle>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: T.dim, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {others.map((r) => <li key={r.id}><b style={{ color: T.text }}>{r.name}</b>: employment purpose, so there are no consent records to count. <Conf level="indicative" /></li>)}
        </ul>
        <Muted style={{ marginTop: 10 }}>The legal basis for each practice is a sample statement. Your advisor decides whether consent or another basis applies.</Muted>
      </Card>
    </Stack>
  );
}

// ───────────────────────────── retention ─────────────────────────────
export function RetentionTab({ db, rows }: { db: HrmsDb; rows: MonitoringRow[] }) {
  const flags = useMemo(() => retentionFlags(db, rows), [db, rows]);
  const [keep, setKeep] = useState<RetentionFlag | null>(null);
  const live = rows.filter((r) => r.status === 'on' || r.status === 'considering');
  type R = MonitoringRow;
  const cols: Col<R>[] = [
    { key: 'name', label: 'Practice', render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'kept', label: 'Kept for', nowrap: true, render: (r) => retentionText(r.retentionDays) },
    { key: 'window', label: 'Policy window', render: (r) => { const w = policyWindow(db, r); return <div><div>{retentionText(w.days)}</div><Muted>{w.source}</Muted></div>; } },
    {
      key: 'state', label: 'Check', nowrap: true, render: (r) => {
        const f = flags.find((x) => x.row.id === r.id);
        return f ? <Badge tone="warn" dot>Over by {retentionText(f.overBy)}</Badge> : r.retentionReason && r.retentionDays > policyWindow(db, r).days ? <Badge tone="info" dot>Longer, with a reason</Badge> : <Badge tone="ok" dot>Within the window</Badge>;
      },
    },
    {
      key: 'act', label: 'Recommended action', render: (r) => {
        const f = flags.find((x) => x.row.id === r.id);
        if (!f) return <Muted>None needed</Muted>;
        return (
          <div style={{ minWidth: 240 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{f.action}</div>
            <Row gap={6}>
              <Button size="sm" variant="primary" data-testid={`shorten-${r.id}`} onClick={() => { shortenRetention(r.id, f.windowDays); toast.success(`Retention shortened to ${retentionText(f.windowDays)}.`); }} aria-label={`Shorten ${r.name} to ${retentionText(f.windowDays)}`}>Shorten to {retentionText(f.windowDays)}</Button>
              <Button size="sm" data-testid={`keepreason-${r.id}`} onClick={() => setKeep(f)} aria-label={`Keep ${r.name} longer, with a reason`}>Keep, with a reason</Button>
            </Row>
          </div>
        );
      },
    },
  ];
  return (
    <Stack>
      <Card>
        <CardTitle right={<Conf level="indicative" />}>Retention check</CardTitle>
        <Muted style={{ marginBottom: 12 }}>
          Data should be kept only as long as the purpose needs it. A practice is flagged when it keeps data longer than its policy window: the matching rule on the Privacy page, or {DEFAULT_WINDOW_DAYS} days when there is none. Practices that are off or blocked collect nothing and are not checked.
        </Muted>
        <div data-testid="retention-flags"><Badge tone={flags.length ? 'warn' : 'ok'} dot>{flags.length ? `${flags.length} ${flags.length === 1 ? 'practice keeps' : 'practices keep'} data longer than the window` : 'Every active practice is within its window'}</Badge></div>
        <div style={{ marginTop: 14 }} data-testid="retention-table"><DataTable columns={cols} rows={live} minWidth={860} empty={<EmptyState title="Nothing is being collected" />} /></div>
        <Muted style={{ marginTop: 10 }}>The windows and the recommended actions are indicative. Retention periods are a legal and policy decision: confirm them with your advisor. The data-protection rules are not applied automatically.</Muted>
      </Card>
      {keep && <KeepReasonModal row={keep.row} windowDays={keep.windowDays} onClose={() => setKeep(null)} />}
    </Stack>
  );
}

// ───────────────────────────── change log ─────────────────────────────
export function LogTab({ log }: { log: MonitoringLogEntry[] }) {
  const cols: Col<MonitoringLogEntry>[] = [
    { key: 'at', label: 'When', nowrap: true, render: (l) => fmtDate(l.at.slice(0, 10)) },
    { key: 'by', label: 'By', nowrap: true, render: (l) => l.by },
    { key: 'row', label: 'Practice', render: (l) => <span style={{ fontWeight: 600 }}>{l.rowName}</span> },
    { key: 'action', label: 'Change', nowrap: true, render: (l) => l.action },
    { key: 'detail', label: 'Detail', render: (l) => <span style={{ fontSize: 13, color: T.dim }}>{l.detail ?? ''}</span> },
  ];
  return (
    <Card>
      <CardTitle>Change log</CardTitle>
      <div data-testid="monitoring-log"><DataTable columns={cols} rows={log} minWidth={760} empty="No changes yet." /></div>
      <Muted style={{ marginTop: 10 }}>Every switch, retention change and review is written here. Dates use the preview date ({fmtDate(PREVIEW_TODAY)} is today).</Muted>
    </Card>
  );
}

'use client';
// Run step 6, Pay: bank advice, EPFO ECR, mark as paid, and the payslips.
// Sample data: the files are built in the browser. Live data: the bank transfer list shown here is a preview with masked account
// numbers (the browser never holds the full ones); the file itself, with the full numbers, is built by the server when the
// download button is pressed, and so is the ECR.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, EmptyState, Note, SearchBox, Stat, StatGrid, T, type Col, downloadRows, downloadText } from '../ui';
import type { Employee, HrmsDb, PayRun, Payslip } from '../../../lib/hrms/types';
import { runTotals } from '../../../lib/hrms/engine';
import { markRunPaid } from '../../../lib/hrms/actions';
import { liveBankFile, useRunEcr } from '../../../lib/hrms/live/payrollCommands';
import { useLiveStatus } from '../../../lib/hrms/live/store';
import { fmtDateTime, fmtMonth, fullName, inr } from '../../../lib/hrms/format';
import { maskAccount } from '../../../lib/hrms/validators';
import { isLocked, previewBankFile } from './logic';
import { ConfirmModal, LinkButton, bigBtn, report } from './shared';
import type { Step } from './RunStepper';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function RunPay({ db, run, go }: { db: HrmsDb; run: PayRun; go: (s: Step) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'bank' | 'paid' | null>(null);
  /** What the server's file held the last time it was downloaded (counts and reasons only: never the account numbers). */
  const [sent, setSent] = useState<{ payments: number; total: number; skipped: { who: string; reason: string }[] } | null>(null);
  const isLive = useLiveStatus().source === 'live';
  const locked = isLocked(run);
  const entity = db.entities.find((e) => e.id === run.entityId);
  const bank = useMemo(() => (locked ? previewBankFile(db, run) : null), [db, run, locked]);
  const { ecr: ecrFile, loading: ecrLoading, error: ecrError } = useRunEcr(db, run, locked);
  const ecr = ecrFile ?? { text: '', rows: 0, blocked: [] as { employeeId: string; reason: string }[] };
  const totals = runTotals(run);
  const emp = (id: string): Employee | undefined => db.employees.find((e) => e.id === id);
  const nameOf = (id: string) => { const e = emp(id); return e ? fullName(e) : '—'; };

  if (!locked || !bank) {
    return (
      <Card>
        <EmptyState title="Freeze the run before paying"
          description="The bank file and the ECR are built from frozen payslips, so what you send to the bank is what you reviewed. Compute and freeze the run first."
          action={<Button variant="primary" style={bigBtn} onClick={() => go(run.payslips.length ? 'freeze' : 'compute')}>{run.payslips.length ? 'Go to Freeze' : 'Go to Compute'}</Button>} />
      </Card>
    );
  }

  const fileTotal = bank.rows.reduce((s, r) => s + Number(r[5]), 0);
  const skippedNet = bank.skipped.reduce((s, k) => s + (run.payslips.find((p) => p.employeeId === k.employeeId)?.net ?? 0), 0);
  const reconciles = Math.round(fileTotal + skippedNet) === Math.round(totals.net);
  const base = `${run.month}-${slug(entity?.name ?? 'entity')}`;
  const pfReg = entity?.registrations.find((r) => r.type === 'pf');

  const bankRows = bank.rows.map((r, i) => ({ id: `${r[0]}-${i}`, code: r[0]!, name: r[1]!, account: r[2]!, ifsc: r[3]!, bankName: r[4]!, amount: Number(r[5]) }));
  const bankCols: Col<(typeof bankRows)[number]>[] = [
    { key: 'code', label: 'Code', render: (r) => <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{r.code}</span> },
    { key: 'name', label: 'Account holder', render: (r) => r.name, sortValue: (r) => r.name },
    { key: 'account', label: 'Account', render: (r) => <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{maskAccount(r.account)}</span> },
    { key: 'ifsc', label: 'IFSC', render: (r) => <span style={{ fontFamily: T.mono, fontSize: 12.5 }}>{r.ifsc}</span> },
    { key: 'bank', label: 'Bank', render: (r) => r.bankName },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount), sortValue: (r) => r.amount, nowrap: true },
  ];
  const skipRows = bank.skipped.map((k) => ({ id: k.employeeId, ...k, net: run.payslips.find((p) => p.employeeId === k.employeeId)?.net ?? 0 }));
  const ecrBlocked = ecr.blocked.map((b) => ({ id: b.employeeId, ...b }));
  const blockedCols: Col<(typeof ecrBlocked)[number]>[] = [
    { key: 'emp', label: 'Employee', render: (r) => { const e = emp(r.employeeId); return e ? <EmployeeCell e={e} /> : '—'; } },
    { key: 'reason', label: 'Why the row is blocked', render: (r) => r.reason },
    { key: 'fix', label: '', align: 'right', render: (r) => <Link href={`/dashboard/hrms/employees/${r.employeeId}?tab=statutory`} style={{ color: T.info, fontWeight: 600, fontSize: 13 }}>Fix UAN</Link> },
  ];
  // Sample: the file is made here. Live: the server makes it (with the full account numbers) and the browser only turns its answer into a download.
  const downloadBank = async () => {
    if (!isLive) { downloadRows(`bank-advice-${base}`, bank.header, bank.rows); return; }
    setBusy('bank');
    try {
      const file = await liveBankFile(run.id);
      downloadRows(`bank-advice-${base}`, file.header, file.rows);
      setSent({
        payments: file.rows.length, total: file.rows.reduce((t, r) => t + Number(r[5]), 0),
        skipped: file.skipped.map((k) => ({ who: k.name ?? k.code ?? nameOf(k.employeeId ?? '') , reason: k.reason })),
      });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not get the bank file from the server.');
    } finally { setBusy(null); }
  };
  const slipRows = run.payslips.filter((s) => !q.trim() || `${nameOf(s.employeeId)} ${emp(s.employeeId)?.code ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const slipCols: Col<Payslip>[] = [
    { key: 'emp', label: 'Employee', render: (s) => { const e = emp(s.employeeId); return e ? <EmployeeCell e={e} href={false} /> : '—'; }, sortValue: (s) => nameOf(s.employeeId) },
    { key: 'net', label: 'Net pay', align: 'right', render: (s) => inr(s.net), sortValue: (s) => s.net, nowrap: true },
    { key: 'open', label: '', align: 'right', render: (s) => <LinkButton href={`/dashboard/hrms/payslips/${s.id}`} label={`Open payslip of ${nameOf(s.employeeId)}`}>Open payslip</LinkButton> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {run.status === 'paid' && <Note tone="ok">Marked as paid on {fmtDateTime(run.paidAt)}. The files below can still be downloaded again.</Note>}

      <Card>
        <CardTitle right={<Button variant="primary" style={{ height: 40 }} onClick={() => void downloadBank()} disabled={!bank.rows.length || busy === 'bank'}>Download bank file (CSV)</Button>}>Bank transfer file</CardTitle>
        {sent && (
          <div data-testid="bank-server-result" style={{ marginBottom: 14 }}>
            <Note tone="ok">
              Bank file downloaded from the server: {sent.payments} payment{sent.payments === 1 ? '' : 's'} totalling {inr(sent.total)}.
              {sent.skipped.length > 0 && <> Left out: {sent.skipped.map((k) => `${k.who} (${k.reason})`).join('; ')}.</>}
            </Note>
          </div>
        )}
        <StatGrid min={160}>
          <Stat label="Payments in the file" value={bank.rows.length} />
          <div data-testid="bank-total"><Stat label="File total" value={inr(fileTotal)} tone="ok" /></div>
          <Stat label="Skipped" value={bank.skipped.length} tone={bank.skipped.length ? 'warn' : undefined} hint={bank.skipped.length ? `${inr(skippedNet)} to pay another way` : 'Everyone is in the file'} />
          <Stat label="Run net pay" value={inr(totals.net)} hint={<Badge tone={reconciles ? 'ok' : 'red'} dot>{reconciles ? 'Reconciles' : 'Does not reconcile'}</Badge>} />
        </StatGrid>
        <div style={{ marginTop: 10, fontSize: 12.5, color: reconciles ? T.mute : T.red }}>
          {reconciles ? 'The file total plus the skipped payments equals the run\'s net pay.' : 'The file total plus the skipped payments does not equal the run\'s net pay. Do not send this file; recompute the run.'}
        </div>
        <div style={{ marginTop: 14 }}>
          <DataTable columns={bankCols} rows={bankRows} minWidth={760} empty="No payment can be made by bank transfer in this run." />
        </div>
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>
          {isLive
            ? 'The list shows masked account numbers. The file is built on the server with the full numbers the bank needs, and each download is recorded in the access log. Handle it as sensitive data.'
            : 'The preview masks account numbers; the downloaded file carries the full number the bank needs. Handle it as sensitive data.'}
        </div>
        {skipRows.length > 0 && (
          <div style={{ marginTop: 16 }} data-testid="bank-skipped">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, fontFamily: T.heading }}>Skipped, with the reason</div>
            <DataTable columns={[
              { key: 'emp', label: 'Employee', render: (r: (typeof skipRows)[number]) => { const e = emp(r.employeeId); return e ? <EmployeeCell e={e} /> : '—'; } },
              { key: 'reason', label: 'Reason', render: (r) => <Badge tone="warn" dot>{r.reason}</Badge> },
              { key: 'net', label: 'Net pay owed', align: 'right', render: (r) => inr(r.net) },
            ]} rows={skipRows} minWidth={520} />
          </div>
        )}
      </Card>

      <Card>
        <CardTitle right={<Button variant="primary" style={{ height: 40 }} onClick={() => downloadText(`ecr-${base}.txt`, ecr.text)} disabled={!ecr.rows}>Download ECR (text)</Button>}>EPFO ECR file</CardTitle>
        {isLive && ecrLoading && <div role="status" style={{ fontSize: 13, color: T.dim, marginBottom: 10 }}>Loading the ECR from the server…</div>}
        {isLive && ecrError && <div style={{ marginBottom: 10 }} data-testid="ecr-error"><Note tone="red">The ECR could not be loaded from the server: {ecrError}</Note></div>}
        <StatGrid min={160}>
          <Stat label="Rows in the ECR" value={ecr.rows} />
          <Stat label="Blocked rows" value={ecr.blocked.length} tone={ecr.blocked.length ? 'red' : 'ok'} hint={ecr.blocked.length ? 'Left out of the file' : 'None'} />
          <Stat label="PF establishment" value={<span style={{ fontSize: 17 }}>{pfReg?.number ?? 'Not registered'}</span>} />
        </StatGrid>
        {!pfReg && <div style={{ marginTop: 12 }}><Note tone="red">{entity?.name} has no PF registration on file, so this ECR cannot be filed. Add it under Organization.</Note></div>}
        {ecrBlocked.length > 0 && (
          <div style={{ marginTop: 14 }} data-testid="ecr-blocked">
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, fontFamily: T.heading }}>Blocked rows</div>
            <DataTable columns={blockedCols} rows={ecrBlocked} minWidth={520} />
            <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>EPFO rejects a row whose UAN is missing or not seeded with Aadhaar. Fix the UAN and download the file again; these people&apos;s PF is still deducted on the payslip.</div>
          </div>
        )}
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 10 }}>Layout is the sample ECR version 2 format used by this preview. Check it against the EPFO portal template before any real upload.</div>
      </Card>

      <Card>
        <CardTitle right={run.status === 'frozen'
          ? <Button variant="primary" style={bigBtn} disabled={busy === 'paid'} onClick={() => setConfirm(true)}>Mark as paid</Button>
          : <Badge tone="ok" dot>Paid</Badge>}>Payslips</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search payslips" />
          <DataTable columns={slipCols} rows={slipRows} minWidth={480} empty="No payslip matches this search." />
        </div>
      </Card>

      {confirm && (
        <ConfirmModal title="Mark this run as paid?" confirmLabel="Mark as paid" onClose={() => setConfirm(false)}
          disabled={busy === 'paid'}
          onConfirm={async () => {
            setBusy('paid');
            try {
              if (report(await markRunPaid(run.id), `${fmtMonth(run.month)} run marked as paid`)) setConfirm(false);
            } finally { setBusy(null); }
          }}>
          Confirm that the bank file for <b>{inr(fileTotal)}</b> has been paid{bank.skipped.length ? `, and that the ${bank.skipped.length} skipped payment${bank.skipped.length === 1 ? ' has' : 's have'} been settled another way` : ''}.
          A paid run is closed and cannot be unfrozen. {isLive ? 'This records the status only; it does not move money.' : 'This preview records the status only; it does not move money.'}
        </ConfirmModal>
      )}
    </div>
  );
}

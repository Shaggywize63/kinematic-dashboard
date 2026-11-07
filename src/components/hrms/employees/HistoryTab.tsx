'use client';
// Change log (every edit with old and new value) and the access log (every reveal of Aadhaar or bank data).

import { useState } from 'react';
import { Card, CardTitle, DataTable, SearchBox, T, type Col } from '../ui';
import type { AccessLogEntry, ChangeLogEntry, Employee, HrmsDb } from '../../../lib/hrms/types';
import { fmtDateTime } from '../../../lib/hrms/format';
import { formatHistoryValue } from './logic';

export default function HistoryTab({ e, db }: { e: Employee; db: HrmsDb }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const log = [...e.history].sort((a, b) => (a.at < b.at ? 1 : -1)).filter((h) => !needle || h.field.toLowerCase().includes(needle) || (h.to ?? '').toLowerCase().includes(needle) || (h.from ?? '').toLowerCase().includes(needle));
  const access = db.accessLog.filter((a) => a.employeeId === e.id).sort((a, b) => (a.at < b.at ? 1 : -1));

  const cols: Col<ChangeLogEntry>[] = [
    { key: 'field', label: 'Field', render: (h) => <strong style={{ fontWeight: 600 }}>{h.field}</strong>, sortValue: (h) => h.field.toLowerCase() },
    { key: 'from', label: 'From', render: (h) => (h.field.startsWith('Override:') && h.from && /^\d+$/.test(h.from) ? `₹${h.from}` : formatHistoryValue(db, h.field, h.from)) },
    { key: 'to', label: 'To', render: (h) => (h.field.startsWith('Override:') && h.to && /^\d+$/.test(h.to) ? `₹${h.to}` : formatHistoryValue(db, h.field, h.to)) },
    { key: 'by', label: 'By', render: (h) => h.by, sortValue: (h) => h.by },
    { key: 'at', label: 'When', render: (h) => fmtDateTime(h.at), sortValue: (h) => h.at, nowrap: true },
  ];
  const accessCols: Col<AccessLogEntry>[] = [
    { key: 'field', label: 'Data revealed', render: (a) => <strong style={{ fontWeight: 600 }}>{a.field}</strong> },
    { key: 'reason', label: 'Reason', render: (a) => a.reason },
    { key: 'by', label: 'By', render: (a) => a.byUser },
    { key: 'at', label: 'When', render: (a) => fmtDateTime(a.at), sortValue: (a) => a.at, nowrap: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <CardTitle right={<SearchBox value={q} onChange={setQ} placeholder="Filter by field or value" width={240} />}>Change log</CardTitle>
        <DataTable columns={cols} rows={log} minWidth={640} empty={needle ? 'No change matches this filter.' : 'No changes recorded yet. Edits on the other tabs appear here.'} />
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Newest first. Aadhaar and bank account changes are logged without the digits.</div>
      </Card>
      <Card>
        <CardTitle>Sensitive data access</CardTitle>
        <DataTable columns={accessCols} rows={access} minWidth={560} empty="Nobody has revealed Aadhaar or bank details for this employee." />
        <div style={{ fontSize: 12.5, color: T.mute, marginTop: 8 }}>Each reveal on the Statutory tab is recorded here with the reason given (DPDP).</div>
      </Card>
    </div>
  );
}

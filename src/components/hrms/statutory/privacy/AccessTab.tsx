'use client';
// Access log: who looked at which sensitive field of whom, when, and why.

import { useMemo, useState } from 'react';
import type { AccessLogEntry, Employee, HrmsDb } from '../../../../lib/hrms/types';
import { fmtDateTime, fullName } from '../../../../lib/hrms/format';
import { Field, Input, Select } from '../../../ui';
import { Button, Card, CardTitle, DataTable, EmployeeCell, Note, SearchBox, downloadRows, useIsCompact, type Col } from '../../ui';
import { Muted, Stack } from '../parts';

export default function AccessTab({ db }: { db: HrmsDb }) {
  const narrow = useIsCompact(900);
  const [q, setQ] = useState('');
  const [field, setField] = useState('all');
  const [user, setUser] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const emp = (id: string): Employee | undefined => db.employees.find((e) => e.id === id);
  const nameOf = (id: string) => (emp(id) ? fullName(emp(id)!) : id);
  const fields = useMemo(() => [...new Set(db.accessLog.map((a) => a.field))].sort(), [db.accessLog]);
  const users = useMemo(() => [...new Set(db.accessLog.map((a) => a.byUser))].sort(), [db.accessLog]);
  const dateError = from && to && from > to ? 'The start date is after the end date.' : '';

  const rows = db.accessLog
    .filter((a) => (field === 'all' || a.field === field) && (user === 'all' || a.byUser === user)
      && (!from || a.at.slice(0, 10) >= from) && (!to || a.at.slice(0, 10) <= to)
      && (!q.trim() || `${nameOf(a.employeeId)} ${a.byUser} ${a.field} ${a.reason}`.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => b.at.localeCompare(a.at));

  const cols: Col<AccessLogEntry>[] = [
    { key: 'at', label: 'When', sortValue: (a) => a.at, nowrap: true, render: (a) => fmtDateTime(a.at) },
    { key: 'by', label: 'Who looked', sortValue: (a) => a.byUser, render: (a) => a.byUser },
    { key: 'emp', label: 'Whose data', sortValue: (a) => nameOf(a.employeeId), render: (a) => (emp(a.employeeId) ? <EmployeeCell e={emp(a.employeeId)!} /> : a.employeeId) },
    { key: 'field', label: 'Field', sortValue: (a) => a.field, render: (a) => a.field },
    { key: 'reason', label: 'Reason given', sortValue: (a) => a.reason, render: (a) => a.reason || '—' },
  ];

  return (
    <Stack>
      <Note>
        Revealing a sensitive field (a full PAN, bank account or Aadhaar last four) in the <b>Employees</b> area asks for a reason and writes a row here. Exports that hold such a field in full, such as the bank advice report, write one too.
      </Note>
      <Card padding={16}>
        <CardTitle right={
          <Button size="sm" disabled={rows.length === 0} onClick={() => downloadRows('access-log.csv', ['When', 'Who looked', 'Employee code', 'Employee', 'Field', 'Reason given'],
            rows.map((a) => [a.at, a.byUser, emp(a.employeeId)?.code ?? '', nameOf(a.employeeId), a.field, a.reason]))}>
            Export CSV
          </Button>
        }>
          Access log
        </CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search person, field or reason" width={280} />
          <Field label="Field" style={{ width: narrow ? '100%' : 220 }}>
            <Select aria-label="Filter by field" value={field} onChange={(e) => setField(e.target.value)}>
              <option value="all">All fields</option>
              {fields.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Who looked" style={{ width: narrow ? '100%' : 230 }}>
            <Select aria-label="Filter by user" value={user} onChange={(e) => setUser(e.target.value)}>
              <option value="all">Anyone</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
          <Field label="From" style={{ width: narrow ? 'calc(50% - 6px)' : 160 }} error={dateError}>
            <Input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To" style={{ width: narrow ? 'calc(50% - 6px)' : 160 }}>
            <Input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Muted style={{ margin: '10px 0' }} >
          <span data-testid="access-count">{rows.length} of {db.accessLog.length} entries</span>
          {(q || field !== 'all' || user !== 'all' || from || to) && (
            <> · <button type="button" onClick={() => { setQ(''); setField('all'); setUser('all'); setFrom(''); setTo(''); }} style={{ border: 0, background: 'transparent', padding: 0, color: 'var(--info)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Clear filters</button></>
          )}
        </Muted>
        <DataTable columns={cols} rows={rows} minWidth={780} empty="No access log entries match these filters." />
      </Card>
    </Stack>
  );
}

'use client';
// Employees: searchable, filterable, sortable directory with the statutory-completeness view, CSV import and export.

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Badge, Button, DataTable, EmployeeCell, HrmsPage, Loading, ProgressBar, SearchBox, Stat, StatGrid, StatusBadge, Toolbar, T, downloadRows, useIsCompact,
  type Col,
} from '../../../../components/hrms/ui';
import { Select } from '../../../../components/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import type { Employee } from '../../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../../lib/hrms/format';
import ImportModal from '../../../../components/hrms/employees/ImportModal';
import { MissingChips } from '../../../../components/hrms/employees/shared';
import { EMPLOYMENT_TYPES, STATUS_OPTIONS, labelOf, profileHref, statutorySummary } from '../../../../components/hrms/employees/logic';

interface Row {
  id: string; e: Employee; name: string; designation: string; department: string; location: string; entity: string;
  pct: number; missing: string[];
}

export default function EmployeesPage() {
  const db = useHrmsDb();
  const router = useRouter();
  const narrow = useIsCompact(900);
  const [q, setQ] = useState('');
  const [entityId, setEntityId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [importing, setImporting] = useState(false);
  const closeImport = useCallback(() => setImporting(false), []);

  const all: Row[] = useMemo(() => {
    if (!db) return [];
    return db.employees
      .map((e) => {
        const s = statutorySummary(db, e);
        return {
          id: e.id, e, name: fullName(e),
          designation: db.designations.find((x) => x.id === e.designationId)?.name ?? '—',
          department: db.departments.find((x) => x.id === e.departmentId)?.name ?? '—',
          location: db.locations.find((x) => x.id === e.locationId)?.name ?? '—',
          entity: db.entities.find((x) => x.id === e.entityId)?.name ?? '—',
          pct: s.comp.pct, missing: s.comp.missing,
        };
      })
      .sort((a, b) => a.e.code.localeCompare(b.e.code));
  }, [db]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (needle && !(r.name.toLowerCase().includes(needle) || r.e.code.toLowerCase().includes(needle) || r.e.email.toLowerCase().includes(needle))) return false;
      if (entityId && r.e.entityId !== entityId) return false;
      if (locationId && r.e.locationId !== locationId) return false;
      if (departmentId && r.e.departmentId !== departmentId) return false;
      if (status && r.e.status !== status) return false;
      if (type && r.e.employmentType !== type) return false;
      if (incompleteOnly && r.missing.length === 0) return false;
      return true;
    });
  }, [all, q, entityId, locationId, departmentId, status, type, incompleteOnly]);

  if (!db) return <Loading />;

  const count = (s: Employee['status']) => all.filter((r) => r.e.status === s).length;
  const incompleteCount = all.filter((r) => r.e.status !== 'exited' && r.missing.length > 0).length;
  const filtersOn = !!(q || entityId || locationId || departmentId || status || type || incompleteOnly);
  const locationOptions = db.locations.filter((l) => !entityId || l.entityId === entityId);

  const columns: Col<Row>[] = [
    { key: 'name', label: 'Employee', render: (r) => <EmployeeCell e={r.e} sub={`${r.e.code}`} />, sortValue: (r) => r.name.toLowerCase(), width: 230 },
    { key: 'designation', label: 'Designation', render: (r) => r.designation, sortValue: (r) => r.designation.toLowerCase() },
    { key: 'department', label: 'Department', render: (r) => r.department, sortValue: (r) => r.department.toLowerCase() },
    { key: 'location', label: 'Location', render: (r) => r.location, sortValue: (r) => r.location.toLowerCase() },
    { key: 'type', label: 'Type', render: (r) => labelOf(EMPLOYMENT_TYPES, r.e.employmentType), sortValue: (r) => r.e.employmentType },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.e.status} />, sortValue: (r) => r.e.status, nowrap: true },
    { key: 'joined', label: 'Joined', render: (r) => fmtDate(r.e.joinDate), sortValue: (r) => r.e.joinDate },
    {
      key: 'statutory', label: 'Statutory data', width: 190, sortValue: (r) => r.pct,
      render: (r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}><ProgressBar pct={r.pct} tone={r.pct >= 100 ? 'ok' : r.pct >= 75 ? 'info' : r.pct >= 50 ? 'warn' : 'red'} /></div>
            <span style={{ fontSize: 12, color: T.dim, fontVariantNumeric: 'tabular-nums', minWidth: 34, textAlign: 'right' }}>{r.pct}%</span>
          </div>
          <MissingChips missing={r.missing} />
        </div>
      ),
    },
  ];

  function exportCsv() {
    downloadRows('employees.csv',
      ['Code', 'Name', 'Email', 'Mobile', 'Designation', 'Department', 'Location', 'Legal entity', 'Employment type', 'Status', 'Join date', 'Statutory complete %', 'Missing'],
      rows.map((r) => [r.e.code, r.name, r.e.email, r.e.mobile, r.designation, r.department, r.location, r.entity, labelOf(EMPLOYMENT_TYPES, r.e.employmentType), labelOf(STATUS_OPTIONS, r.e.status), r.e.joinDate, r.pct, r.missing.join('; ')]));
  }
  function clearFilters() { setQ(''); setEntityId(''); setLocationId(''); setDepartmentId(''); setStatus(''); setType(''); setIncompleteOnly(false); }

  return (
    <HrmsPage
      title="Employees"
      description={`${all.length} people across ${db.entities.length} legal entities. Sample data, not live.`}
      actions={
        <>
          <Button onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          <Button onClick={() => setImporting(true)}>Import CSV</Button>
          <Button variant="primary" href="/dashboard/hrms/employees/new" style={{ minHeight: 40 }}>Add employee</Button>
        </>
      }
    >
      <StatGrid min={170}>
        <Stat label="Active" value={count('active')} tone="ok" />
        <Stat label="On notice" value={count('on_notice')} tone="warn" />
        <Stat label="Onboarding" value={count('onboarding')} tone="info" />
        <Stat label="Incomplete statutory data" value={incompleteCount} tone={incompleteCount ? 'red' : 'ok'} hint="Excludes people who have left" />
      </StatGrid>

      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, code or email" width={280} />
        <Select aria-label="Legal entity" value={entityId} style={{ width: narrow ? '100%' : 190 }} onChange={(e) => { setEntityId(e.target.value); setLocationId(''); }}>
          <option value="">All legal entities</option>
          {db.entities.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <Select aria-label="Location" value={locationId} style={{ width: narrow ? '100%' : 170 }} onChange={(e) => setLocationId(e.target.value)}>
          <option value="">All locations</option>
          {locationOptions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <Select aria-label="Department" value={departmentId} style={{ width: narrow ? '100%' : 160 }} onChange={(e) => setDepartmentId(e.target.value)}>
          <option value="">All departments</option>
          {db.departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </Select>
        <Select aria-label="Status" value={status} style={{ width: narrow ? '100%' : 150 }} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
        <Select aria-label="Employment type" value={type} style={{ width: narrow ? '100%' : 160 }} onChange={(e) => setType(e.target.value)}>
          <option value="">All employment types</option>
          {EMPLOYMENT_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text, minHeight: 36, cursor: 'pointer' }}>
          <input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--red)' }} />
          Incomplete only
        </label>
        {filtersOn && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
      </Toolbar>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: T.dim }} aria-live="polite">
        <span data-testid="employee-count">Showing {rows.length} of {all.length}</span>
        {filtersOn && rows.length === 0 && <Badge tone="neutral">No match</Badge>}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        minWidth={860}
        onRowClick={(r) => router.push(profileHref(r.id))}
        empty={filtersOn ? 'No employees match these filters. Clear a filter or change the search.' : 'No employees yet. Add the first one or import a CSV.'}
      />
      <p style={{ margin: 0, fontSize: 12.5, color: T.mute }}>
        Export covers the filtered list and leaves out PAN, Aadhaar and bank details. Statutory completeness counts PAN, Aadhaar, UAN (and Aadhaar seeding), ESIC number where ESI applies at the current gross, bank account, mandatory documents and salary structure.
      </p>

      {importing && <ImportModal db={db} onClose={closeImport} />}
    </HrmsPage>
  );
}

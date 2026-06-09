'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../lib/api';

/**
 * Field-Force Report Builder. Mirrors the UX of the Lead Management
 * builder at /dashboard/crm/reports/builder but scoped to the entities
 * field-force admins actually report on: the team roster, attendance
 * punches, visit logs, and form submissions.
 *
 * Why a separate page rather than a shared component: the field
 * picker, default columns, and the underlying API methods differ
 * enough that abstracting them would add more indirection than the
 * file saves. Keeping the two builders independent also means we can
 * iterate on FFM-specific cuts (e.g. geofence compliance, route
 * adherence) without touching the CRM surface.
 */

type Entity = 'team' | 'attendance' | 'visits' | 'submissions';

type FieldDef = {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'enum' | 'boolean';
  enumOptions?: string[];
};

const ENTITY_FIELDS: Record<Entity, FieldDef[]> = {
  team: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'employee_id', label: 'Employee ID', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'mobile', label: 'Mobile', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'is_active', label: 'Active', type: 'boolean' },
    { key: 'kini_used_this_month', label: 'KINI used', type: 'number' },
    { key: 'kini_monthly_cap', label: 'KINI cap', type: 'number' },
  ],
  attendance: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'employee_id', label: 'Employee ID', type: 'text' },
    { key: 'status', label: 'Status', type: 'enum', enumOptions: ['checked_in', 'checked_out', 'absent', 'leave'] },
    { key: 'display_status', label: 'Display status', type: 'text' },
    { key: 'checkin_at', label: 'Check-in', type: 'date' },
    { key: 'checkout_at', label: 'Check-out', type: 'date' },
    { key: 'total_hours', label: 'Hours', type: 'number' },
    { key: 'checkin_address', label: 'Check-in address', type: 'text' },
  ],
  visits: [
    { key: 'user_name', label: 'Rep', type: 'text' },
    { key: 'store_name', label: 'Outlet', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'visit_type', label: 'Type', type: 'text' },
    { key: 'checkin_at', label: 'Check-in', type: 'date' },
    { key: 'checkout_at', label: 'Check-out', type: 'date' },
    { key: 'duration_minutes', label: 'Duration (min)', type: 'number' },
    { key: 'status', label: 'Status', type: 'enum', enumOptions: ['completed', 'in_progress', 'cancelled'] },
  ],
  submissions: [
    { key: 'user_name', label: 'Rep', type: 'text' },
    { key: 'template_name', label: 'Form', type: 'text' },
    { key: 'submitted_at', label: 'Submitted', type: 'date' },
    { key: 'status', label: 'Status', type: 'enum', enumOptions: ['draft', 'submitted', 'approved', 'rejected'] },
    { key: 'store_name', label: 'Outlet', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
  ],
};

const ENTITY_LABELS: Record<Entity, string> = {
  team: 'Team Roster',
  attendance: 'Attendance',
  visits: 'Visit Logs',
  submissions: 'Form Submissions',
};

type Op =
  | 'eq' | 'neq' | 'contains' | 'starts_with'
  | 'gt' | 'gte' | 'lt' | 'lte' | 'between'
  | 'is_empty' | 'is_not_empty';

const OPS_BY_TYPE: Record<FieldDef['type'], Op[]> = {
  text: ['contains', 'eq', 'neq', 'starts_with', 'is_empty', 'is_not_empty'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  date: ['eq', 'gt', 'gte', 'lt', 'lte', 'between', 'is_empty', 'is_not_empty'],
  enum: ['eq', 'neq', 'is_empty', 'is_not_empty'],
  boolean: ['eq'],
};

const OP_LABELS: Record<Op, string> = {
  eq: 'equals', neq: 'not equals', contains: 'contains', starts_with: 'starts with',
  gt: 'greater than', gte: '≥', lt: 'less than', lte: '≤', between: 'between',
  is_empty: 'is empty', is_not_empty: 'is not empty',
};

type Filter = { field: string; op: Op; value: string; value2?: string };

const DEFAULT_FIELDS: Record<Entity, string[]> = {
  team: ['name', 'employee_id', 'role', 'city', 'is_active'],
  attendance: ['name', 'employee_id', 'status', 'checkin_at', 'checkout_at', 'total_hours'],
  visits: ['user_name', 'store_name', 'city', 'checkin_at', 'duration_minutes', 'status'],
  submissions: ['user_name', 'template_name', 'submitted_at', 'status', 'store_name'],
};

export default function FfmReportBuilderPage() {
  const [entity, setEntity] = useState<Entity>('team');
  const [selectedFields, setSelectedFields] = useState<string[]>(DEFAULT_FIELDS.team);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const fields = ENTITY_FIELDS[entity];

  useEffect(() => {
    setSelectedFields(DEFAULT_FIELDS[entity]);
    setFilters([]);
    setSortBy('');
    setRows([]);
    setHasRun(false);
  }, [entity]);

  const fetchData = async (): Promise<any[]> => {
    setLoading(true);
    try {
      // Each entity uses its existing list endpoint. The visits and
      // submissions endpoints sometimes return rows with nested
      // relations (users / stores / templates) — we flatten the
      // commonly-displayed names here so filters and the table can
      // reference them as plain keys.
      if (entity === 'team') {
        const r = await api.getUsers({ limit: '500' }) as { data?: any[] } | { success?: boolean; data?: any[] };
        return ((r as any)?.data ?? []) as any[];
      }
      if (entity === 'attendance') {
        const r = await api.getAttendanceTeam() as { data?: any[] };
        return ((r as any)?.data ?? []).map((row: any) => ({
          ...row,
          name: row.users?.name ?? row.name,
          employee_id: row.users?.employee_id ?? row.employee_id,
        }));
      }
      if (entity === 'visits') {
        const r = await api.getVisitLogs() as { data?: any[] };
        return ((r as any)?.data ?? []).map((row: any) => ({
          ...row,
          user_name: row.users?.name ?? row.user_name ?? row.name,
          store_name: row.stores?.name ?? row.store_name ?? row.outlet_name,
        }));
      }
      const r = await api.getAdminSubmissions() as { data?: any[] } | { success?: boolean; data?: any[] };
      return (((r as any)?.data ?? []) as any[]).map((row: any) => ({
        ...row,
        user_name: row.users?.name ?? row.user_name ?? row.name,
        template_name: row.form_templates?.name ?? row.template_name,
        store_name: row.stores?.name ?? row.store_name,
      }));
    } catch (e: any) {
      toast.error(e?.message || 'Failed to fetch');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const passesFilter = (row: any, f: Filter): boolean => {
    const fdef = fields.find((x) => x.key === f.field);
    const v = row?.[f.field];
    if (f.op === 'is_empty') return v === null || v === undefined || v === '';
    if (f.op === 'is_not_empty') return v !== null && v !== undefined && v !== '';
    if (f.value === '') return true;
    const isDate = fdef?.type === 'date';
    const isNum = fdef?.type === 'number';
    const norm = (x: any) => {
      if (x === null || x === undefined) return null;
      if (isDate) return new Date(x).getTime();
      if (isNum) return Number(x);
      return String(x).toLowerCase();
    };
    const va = norm(v);
    const fa = isDate ? new Date(f.value).getTime() : isNum ? Number(f.value) : f.value.toLowerCase();
    const fb = f.value2 ? (isDate ? new Date(f.value2).getTime() : isNum ? Number(f.value2) : f.value2.toLowerCase()) : null;
    if (va === null) return false;
    switch (f.op) {
      case 'eq': return va === fa;
      case 'neq': return va !== fa;
      case 'contains': return String(va).includes(String(fa));
      case 'starts_with': return String(va).startsWith(String(fa));
      case 'gt': return (va as number) > (fa as number);
      case 'gte': return (va as number) >= (fa as number);
      case 'lt': return (va as number) < (fa as number);
      case 'lte': return (va as number) <= (fa as number);
      case 'between': return fb !== null && (va as number) >= (fa as number) && (va as number) <= (fb as number);
      default: return true;
    }
  };

  const runReport = async () => {
    if (selectedFields.length === 0) {
      toast.error('Pick at least one field to display');
      return;
    }
    const data = await fetchData();
    let filtered = data.filter((row) => filters.every((f) => passesFilter(row, f)));
    if (sortBy) {
      filtered = [...filtered].sort((a: any, b: any) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (av < bv ? -1 : 1) * (sortDir === 'asc' ? 1 : -1);
      });
    }
    setRows(filtered);
    setHasRun(true);
  };

  const exportCsv = () => {
    if (!rows.length) return;
    const cols = selectedFields
      .map((k) => fields.find((f) => f.key === k))
      .filter((f): f is FieldDef => !!f);
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = cols.map((c) => escape(c.label)).join(',');
    const lines = rows.map((r) => cols.map((c) => escape(r[c.key])).join(','));
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ffm-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleField = (key: string) =>
    setSelectedFields((s) => (s.includes(key) ? s.filter((x) => x !== key) : [...s, key]));

  const addFilter = () => {
    const first = fields[0];
    if (!first) return;
    setFilters((f) => [...f, { field: first.key, op: OPS_BY_TYPE[first.type][0], value: '' }]);
  };

  const updateFilter = (i: number, patch: Partial<Filter>) =>
    setFilters((f) => f.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const removeFilter = (i: number) => setFilters((f) => f.filter((_, idx) => idx !== i));

  const colsForTable = useMemo(
    () => selectedFields.map((k) => fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f),
    [selectedFields, fields],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text)' }}>FFM Report Builder</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
            Pick an entity, choose columns, filter, sort &mdash; then export to CSV.
            <Link href="/dashboard/ffm-reports" style={{ color: 'var(--primary)', marginLeft: 8 }}>← Back to reports</Link>
          </p>
        </div>
      </header>

      <Section title="Entity">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(Object.keys(ENTITY_LABELS) as Entity[]).map((e) => (
            <button
              key={e}
              onClick={() => setEntity(e)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${entity === e ? 'var(--primary)' : 'var(--border)'}`,
                background: entity === e ? 'var(--primary)' : 'var(--s3)',
                color: entity === e ? '#fff' : 'var(--text)',
              }}
            >
              {ENTITY_LABELS[e]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Fields">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
          {fields.map((f) => {
            const checked = selectedFields.includes(f.key);
            return (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={checked} onChange={() => toggleField(f.key)} />
                {f.label}
              </label>
            );
          })}
        </div>
      </Section>

      <Section
        title="Filters"
        action={
          <button
            onClick={addFilter}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
          >
            + Add filter
          </button>
        }
      >
        {filters.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No filters — every row is included.</div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filters.map((f, i) => {
            const def = fields.find((x) => x.key === f.field) ?? fields[0];
            const ops = OPS_BY_TYPE[def.type];
            return (
              <div key={i} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                  value={f.field}
                  onChange={(e) => {
                    const newDef = fields.find((x) => x.key === e.target.value);
                    const newOp = newDef ? OPS_BY_TYPE[newDef.type][0] : f.op;
                    updateFilter(i, { field: e.target.value, op: newOp, value: '', value2: '' });
                  }}
                  style={selectStyle}
                >
                  {fields.map((x) => (<option key={x.key} value={x.key}>{x.label}</option>))}
                </select>
                <select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as Op, value: '', value2: '' })} style={selectStyle}>
                  {ops.map((op) => (<option key={op} value={op}>{OP_LABELS[op]}</option>))}
                </select>
                {f.op !== 'is_empty' && f.op !== 'is_not_empty' && (
                  def.type === 'enum' ? (
                    <select value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={selectStyle}>
                      <option value="">— pick —</option>
                      {(def.enumOptions ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
                    </select>
                  ) : def.type === 'boolean' ? (
                    <select value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={selectStyle}>
                      <option value="">— pick —</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : (
                    <input
                      type={def.type === 'date' ? 'date' : def.type === 'number' ? 'number' : 'text'}
                      value={f.value}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                      style={inputStyle}
                    />
                  )
                )}
                {f.op === 'between' && (
                  <input
                    type={def.type === 'date' ? 'date' : 'number'}
                    value={f.value2 ?? ''}
                    onChange={(e) => updateFilter(i, { value2: e.target.value })}
                    style={inputStyle}
                  />
                )}
                <button
                  onClick={() => removeFilter(i)}
                  style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Sort">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
            <option value="">— none —</option>
            {fields.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
          </select>
          <select value={sortDir} onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')} style={selectStyle}>
            <option value="desc">descending</option>
            <option value="asc">ascending</option>
          </select>
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={runReport}
          disabled={loading}
          style={{
            background: 'var(--primary)', color: '#fff', border: 'none', padding: '10px 18px',
            borderRadius: 8, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', fontSize: 13,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'Running…' : 'Run report'}
        </button>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          style={{
            background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)',
            padding: '10px 18px', borderRadius: 8, fontWeight: 700,
            cursor: rows.length ? 'pointer' : 'not-allowed', fontSize: 13,
            opacity: rows.length ? 1 : 0.5,
          }}
        >
          ⬇ Export CSV
        </button>
      </div>

      {hasRun && (
        <div style={{ overflowX: 'auto', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ background: 'var(--s3)', color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              <tr>{colsForTable.map((c) => (<th key={c.key} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700 }}>{c.label}</th>))}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  {colsForTable.map((c) => (
                    <td key={c.key} style={{ padding: '10px 12px', color: 'var(--text)' }}>
                      {formatCell(r[c.key], c.type)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={colsForTable.length} style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)' }}>No rows matched the filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown, type: FieldDef['type']): string {
  if (v === null || v === undefined || v === '') return '—';
  if (type === 'date') {
    const d = new Date(v as string);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  }
  if (type === 'boolean') return v ? 'Yes' : 'No';
  if (type === 'number') return Number(v).toLocaleString('en-IN');
  return String(v);
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '6px 10px', borderRadius: 6, fontSize: 13,
};
const inputStyle: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '6px 10px', borderRadius: 6, fontSize: 13,
};

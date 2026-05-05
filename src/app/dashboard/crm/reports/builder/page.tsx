'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmLeads, crmContacts, crmAccounts, crmDeals, crmActivities } from '../../../../../lib/crmApi';

type Entity = 'leads' | 'contacts' | 'accounts' | 'deals' | 'activities';

type FieldDef = { key: string; label: string; type: 'text' | 'number' | 'date' | 'enum' | 'boolean'; enumOptions?: string[] };

const ENTITY_FIELDS: Record<Entity, FieldDef[]> = {
  leads: [
    { key: 'first_name', label: 'First Name', type: 'text' },
    { key: 'last_name', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'company', label: 'Company', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'status', label: 'Status', type: 'enum', enumOptions: ['new', 'working', 'qualified', 'unqualified'] },
    { key: 'score', label: 'Score', type: 'number' },
    { key: 'score_grade', label: 'Grade', type: 'enum', enumOptions: ['A', 'B', 'C', 'D'] },
    { key: 'source_name', label: 'Source', type: 'text' },
    { key: 'owner_name', label: 'Owner', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'is_b2c', label: 'B2C', type: 'boolean' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
  contacts: [
    { key: 'first_name', label: 'First Name', type: 'text' },
    { key: 'last_name', label: 'Last Name', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'department', label: 'Department', type: 'text' },
    { key: 'account_name', label: 'Account', type: 'text' },
    { key: 'owner_name', label: 'Owner', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'do_not_contact', label: 'Do Not Contact', type: 'boolean' },
    { key: 'email_opt_out', label: 'Email Opt-Out', type: 'boolean' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
  accounts: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'domain', label: 'Domain', type: 'text' },
    { key: 'industry', label: 'Industry', type: 'text' },
    { key: 'annual_revenue', label: 'Annual Revenue', type: 'number' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'text' },
    { key: 'country', label: 'Country', type: 'text' },
    { key: 'owner_name', label: 'Owner', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
  deals: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'currency', label: 'Currency', type: 'text' },
    { key: 'status', label: 'Status', type: 'enum', enumOptions: ['open', 'won', 'lost'] },
    { key: 'stage_name', label: 'Stage', type: 'text' },
    { key: 'pipeline_name', label: 'Pipeline', type: 'text' },
    { key: 'probability', label: 'Probability %', type: 'number' },
    { key: 'expected_close_date', label: 'Expected Close', type: 'date' },
    { key: 'actual_close_date', label: 'Actual Close', type: 'date' },
    { key: 'account_name', label: 'Account', type: 'text' },
    { key: 'owner_name', label: 'Owner', type: 'text' },
    { key: 'lost_reason', label: 'Lost Reason', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
  activities: [
    { key: 'type', label: 'Type', type: 'enum', enumOptions: ['call', 'email', 'meeting', 'task', 'note', 'sms', 'whatsapp'] },
    { key: 'subject', label: 'Subject', type: 'text' },
    { key: 'status', label: 'Status', type: 'enum', enumOptions: ['open', 'planned', 'in_progress', 'completed', 'done', 'cancelled'] },
    { key: 'priority', label: 'Priority', type: 'enum', enumOptions: ['low', 'normal', 'medium', 'high', 'urgent'] },
    { key: 'due_at', label: 'Due', type: 'date' },
    { key: 'completed_at', label: 'Completed', type: 'date' },
    { key: 'owner_name', label: 'Owner', type: 'text' },
    { key: 'created_at', label: 'Created', type: 'date' },
  ],
};

const ENTITY_LABELS: Record<Entity, string> = {
  leads: 'Leads',
  contacts: 'Contacts',
  accounts: 'Accounts',
  deals: 'Deals',
  activities: 'Activities',
};

type Op = 'eq' | 'neq' | 'contains' | 'starts_with' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'is_empty' | 'is_not_empty';

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

export default function ReportBuilderPage() {
  const [entity, setEntity] = useState<Entity>('leads');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [groupBy, setGroupBy] = useState('');
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const fields = ENTITY_FIELDS[entity];

  // Default fields when entity changes
  useEffect(() => {
    const defaults: Record<Entity, string[]> = {
      leads: ['first_name', 'last_name', 'email', 'company', 'status', 'score', 'owner_name'],
      contacts: ['first_name', 'last_name', 'email', 'phone', 'account_name', 'owner_name'],
      accounts: ['name', 'industry', 'annual_revenue', 'city', 'owner_name'],
      deals: ['name', 'account_name', 'amount', 'stage_name', 'status', 'expected_close_date', 'owner_name'],
      activities: ['type', 'subject', 'status', 'due_at', 'owner_name'],
    };
    setSelectedFields(defaults[entity]);
    setFilters([]);
    setGroupBy('');
    setSortBy('');
    setRows([]);
    setHasRun(false);
  }, [entity]);

  const fetchData = async () => {
    setLoading(true);
    try {
      let r;
      if (entity === 'leads') r = await crmLeads.list();
      else if (entity === 'contacts') r = await crmContacts.list();
      else if (entity === 'accounts') r = await crmAccounts.list();
      else if (entity === 'deals') r = await crmDeals.list();
      else r = await crmActivities.list();
      return r.data || [];
    } catch (e: any) {
      toast.error(e.message || 'Failed to fetch');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const passesFilter = (row: any, f: Filter): boolean => {
    const v = row[f.field];
    if (f.op === 'is_empty') return v === null || v === undefined || v === '';
    if (f.op === 'is_not_empty') return v !== null && v !== undefined && v !== '';
    if (f.value === '' && f.op !== 'is_empty' && f.op !== 'is_not_empty') return true;
    const fdef = fields.find((x) => x.key === f.field);
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
    let filtered = data.filter((row: any) => filters.every((f) => passesFilter(row, f)));
    if (sortBy) {
      filtered = [...filtered].sort((a: any, b: any) => {
        const av = a[sortBy], bv = b[sortBy];
        if (av === bv) return 0;
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        return (av < bv ? -1 : 1) * (sortDir === 'asc' ? 1 : -1);
      });
    }
    setRows(filtered);
    setHasRun(true);
    toast.success(`Report: ${filtered.length} row${filtered.length === 1 ? '' : 's'}`);
  };

  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const groups: Record<string, any[]> = {};
    rows.forEach((r) => {
      const key = String(r[groupBy] ?? '— (empty)');
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return groups;
  }, [rows, groupBy]);

  const downloadCSV = () => {
    if (rows.length === 0) return toast.error('Run the report first');
    const headers = selectedFields.map((k) => fields.find((f) => f.key === k)?.label || k);
    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(',')];
    rows.forEach((r) => {
      lines.push(selectedFields.map((k) => escape(r[k])).join(','));
    });
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entity}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const addFilter = () => {
    const f = fields[0];
    setFilters([...filters, { field: f.key, op: OPS_BY_TYPE[f.type][0], value: '' }]);
  };

  const updateFilter = (i: number, patch: Partial<Filter>) => {
    setFilters(filters.map((f, idx) => idx === i ? { ...f, ...patch } : f));
  };

  const removeFilter = (i: number) => setFilters(filters.filter((_, idx) => idx !== i));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>Custom Report Builder</h2>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
            Pick an entity, select fields, add filters, group, and download as CSV.
          </div>
        </div>
        <Link href="/dashboard/crm/reports" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '6px 12px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}>← All Reports</Link>
      </div>

      {/* Builder */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        {/* Entity */}
        <Section title="1. Choose entity">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(ENTITY_LABELS) as Entity[]).map((e) => (
              <button
                key={e}
                onClick={() => setEntity(e)}
                style={{
                  padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  background: entity === e ? 'var(--primary)' : 'var(--s3)',
                  color: entity === e ? '#fff' : 'var(--text)',
                  border: `1px solid ${entity === e ? 'var(--primary)' : 'var(--border)'}`,
                }}
              >
                {ENTITY_LABELS[e]}
              </button>
            ))}
          </div>
        </Section>

        {/* Fields */}
        <Section title="2. Select fields to display">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
            <button onClick={() => setSelectedFields(fields.map((f) => f.key))} style={btnTiny}>Select All</button>
            <button onClick={() => setSelectedFields([])} style={btnTiny}>Clear</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 6 }}>
            {fields.map((f) => {
              const checked = selectedFields.includes(f.key);
              return (
                <label
                  key={f.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    background: checked ? 'var(--primary)' : 'var(--s3)',
                    color: checked ? '#fff' : 'var(--text)',
                    borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedFields(checked ? selectedFields.filter((k) => k !== f.key) : [...selectedFields, f.key])}
                    style={{ accentColor: '#fff' }}
                  />
                  {f.label}
                </label>
              );
            })}
          </div>
        </Section>

        {/* Filters */}
        <Section title="3. Filters (all must match)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filters.map((f, i) => {
              const fdef = fields.find((x) => x.key === f.field);
              const ops = fdef ? OPS_BY_TYPE[fdef.type] : ['eq' as Op];
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={f.field} onChange={(e) => updateFilter(i, { field: e.target.value, op: OPS_BY_TYPE[fields.find((x) => x.key === e.target.value)!.type][0], value: '', value2: '' })} style={input}>
                    {fields.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  </select>
                  <select value={f.op} onChange={(e) => updateFilter(i, { op: e.target.value as Op })} style={input}>
                    {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
                  </select>
                  {!['is_empty', 'is_not_empty'].includes(f.op) && (
                    fdef?.type === 'enum' ? (
                      <select value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={input}>
                        <option value="">—</option>
                        {fdef.enumOptions?.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : fdef?.type === 'boolean' ? (
                      <select value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={input}>
                        <option value="">—</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : fdef?.type === 'date' ? (
                      <>
                        <input type="date" value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={input} />
                        {f.op === 'between' && <input type="date" value={f.value2 || ''} onChange={(e) => updateFilter(i, { value2: e.target.value })} style={input} />}
                      </>
                    ) : fdef?.type === 'number' ? (
                      <>
                        <input type="number" value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={input} placeholder="Value" />
                        {f.op === 'between' && <input type="number" value={f.value2 || ''} onChange={(e) => updateFilter(i, { value2: e.target.value })} style={input} placeholder="And" />}
                      </>
                    ) : (
                      <input value={f.value} onChange={(e) => updateFilter(i, { value: e.target.value })} style={input} placeholder="Value" />
                    )
                  )}
                  <button onClick={() => removeFilter(i)} style={{ ...btnTiny, color: '#ef4444', borderColor: '#ef4444' }}>✕</button>
                </div>
              );
            })}
            <button onClick={addFilter} style={{ ...btnTiny, alignSelf: 'flex-start' }}>+ Add Filter</button>
          </div>
        </Section>

        {/* Group + Sort */}
        <Section title="4. Group & sort (optional)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Group by</span>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} style={input}>
                <option value="">— None —</option>
                {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={input}>
                <option value="">— None —</option>
                {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Direction</span>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value as any)} style={input}>
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>
        </Section>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button onClick={runReport} disabled={loading} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            {loading ? 'Running…' : '▶ Run Report'}
          </button>
          {hasRun && rows.length > 0 && (
            <button onClick={downloadCSV} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 20px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              ⬇ Download CSV
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {hasRun && (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
            Results: {rows.length} row{rows.length === 1 ? '' : 's'}
            {groupBy && grouped && ` · ${Object.keys(grouped).length} groups`}
          </div>
          {rows.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-dim)' }}>No rows match. Adjust filters and try again.</div>
          ) : groupBy && grouped ? (
            <div>
              {Object.entries(grouped).map(([groupKey, groupRows]) => (
                <div key={groupKey}>
                  <div style={{ padding: '8px 16px', background: 'var(--s3)', fontSize: 12, fontWeight: 700, color: 'var(--text)', borderTop: '1px solid var(--border)' }}>
                    {fields.find((f) => f.key === groupBy)?.label || groupBy}: <strong>{groupKey}</strong> ({groupRows.length})
                  </div>
                  <ResultTable fields={fields} selectedFields={selectedFields} rows={groupRows} />
                </div>
              ))}
            </div>
          ) : (
            <ResultTable fields={fields} selectedFields={selectedFields} rows={rows} />
          )}
        </div>
      )}
    </div>
  );
}

function ResultTable({ fields, selectedFields, rows }: { fields: FieldDef[]; selectedFields: string[]; rows: any[] }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {selectedFields.map((k) => {
              const f = fields.find((x) => x.key === k);
              return <th key={k} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{f?.label || k}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {selectedFields.map((k) => {
                const f = fields.find((x) => x.key === k);
                let v = r[k];
                if (f?.type === 'date' && v) v = new Date(v).toLocaleDateString();
                if (f?.type === 'boolean') v = v ? '✓' : '';
                if (v === null || v === undefined) v = '—';
                return <td key={k} style={{ padding: '8px 12px', color: 'var(--text)', borderBottom: '1px solid var(--border)' }}>{String(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12 };
const btnTiny: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 };

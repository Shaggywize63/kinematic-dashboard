'use client';
/**
 * People Directory — Tata Tiscon (and any client with crm_people_directory
 * entitlement) uses this to keep a per-client address book of dealers,
 * influencers, and referrers that sit alongside the pipelined contacts.
 *
 * Surface design follows the existing CRM list pages (Accounts, Contacts):
 *   - Sticky toolbar with search, "+ New Person", and the "Bulk Import" link
 *   - Table with the 5 stored columns + a row-action menu (Edit / Delete)
 *   - Modal-based create + edit so a CRM admin can capture a row inline
 *     without leaving the directory view
 *
 * RBAC is enforced server-side via `requireModuleAccess('crm_settings')`;
 * the sidebar entry mirrors that gate (see layout.tsx) so users without
 * permission don't see the link at all.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../lib/api';
import {
  crmPeopleDirectory, crmPeopleDirectoryTypes,
  type PeopleDirectoryEntry, type PeopleDirectoryType,
} from '../../../../lib/crmApi';
import { useTableSort, SortLabel } from '../../../../lib/tableSort';
import { usePagination } from '../../../../components/shared/Pagination';

// One row from /api/v1/crm/locations — the per-tenant city allow-list
// managed under Settings → Locations. We only care about the city name
// for the People Directory dropdown.
interface CityRow { id?: string; city?: string | null; is_active?: boolean | null }

type Row = PeopleDirectoryEntry & { id: string };

function downloadTemplate() {
  const rows = [
    // `id` is the tenant-supplied identifier reps type by hand.
    'id,first_name,last_name,mobile,email,type,city,address',
    'EMP-001,Ravi,Kumar,9988776655,ravi@example.com,Dealer,Bhagalpur,"Shop 12, Main Road"',
    'EMP-002,Priya,Sharma,8877665544,priya@example.com,Architect,Patna,"Flat 3, Building B"',
  ];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'people-directory-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function PeopleDirectoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(''); // empty = all types
  // City filter — narrows to people whose `city` matches the selected
  // option. Options come from the same /api/v1/crm/locations list that
  // populates the editor's city dropdown so the filter never offers a
  // city the directory can't contain. Empty = all cities.
  const [cityFilter, setCityFilter] = useState<string>('');
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  // Admin-managed catalogue of role labels (Dealer / Engineer / Architect / …).
  // Loaded once on mount + refreshed after an inline add so the dropdown in
  // the create / edit modal always reflects the live list.
  const [types, setTypes] = useState<PeopleDirectoryType[]>([]);
  // Cities for the dropdown — sourced from /api/v1/crm/locations (the
  // per-tenant State/City allow-list managed under Settings →
  // Locations). Reps reported the previous source (crm_cities, the
  // India-wide master list) leaked 800+ rows the admin had never
  // curated; the locations table is what they actually maintain, so
  // it's the right source of truth here.
  const [cities, setCities] = useState<string[]>([]);

  const loadTypes = async () => {
    try {
      const r = await crmPeopleDirectoryTypes.list({ limit: 200 });
      setTypes(((r.data as PeopleDirectoryType[]) || []).filter((t) => t.is_active !== false));
    } catch { setTypes([]); }
  };

  const loadCities = async () => {
    try {
      const r = await api.get<{ success?: boolean; data?: CityRow[] } | CityRow[]>(
        '/api/v1/crm/locations',
      );
      // The endpoint sometimes returns the raw array, sometimes wraps in
      // { data }. Handle both so we don't have to chase wrappers.
      const arr: CityRow[] = Array.isArray(r) ? r : (r.data ?? []);
      const names = Array.from(new Set(
        arr
          .filter((row) => row.is_active !== false)
          .map((row) => (row.city ?? '').trim())
          .filter(Boolean),
      ));
      names.sort((a, b) => a.localeCompare(b));
      setCities(names);
    } catch { setCities([]); }
  };

  const refresh = async () => {
    setLoading(true);
    try {
      // The generic crud helper applies any non-reserved query key as
      // `.eq(...)`, so passing `type` here narrows the server-side scan
      // rather than us filtering in memory.
      // No page limit — People Directory is a per-tenant roster and
      // the screen is the place you'd come specifically to see every
      // entry. Backend returns un-paged for this resource (see
      // crm.routes.ts), so omitting `limit` here lets the full set
      // surface to the rep instead of clipping at 200.
      const params: Record<string, string | number | undefined> = {};
      const s = search.trim(); if (s) params.q = s;
      if (typeFilter) params.type = typeFilter;
      if (cityFilter) params.city = cityFilter;
      const r = await crmPeopleDirectory.list(params);
      setRows(((r.data as Row[]) || []).filter((x) => !!x.id));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load People Directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); loadTypes(); loadCities(); /* eslint-disable-next-line */ }, []);
  // Debounce search so each keystroke doesn't fire a new request.
  // Refire on type-filter change too — without it the dropdown only takes
  // effect after the next keystroke / re-render (the bug pattern flagged
  // in CLAUDE.md).
  useEffect(() => {
    const t = setTimeout(() => { refresh(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, typeFilter, cityFilter]);

  const totalLabel = useMemo(
    () => loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`,
    [loading, rows.length],
  );

  // Type-aware client-side column sorting for the directory table. "ID" sorts by
  // the tenant-supplied `code`; "Name" by the combined first + last name.
  const rowVal = useCallback((r: Row, key: string): unknown => {
    switch (key) {
      case 'id': return r.code;
      case 'name': return [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
      case 'type': return r.type;
      case 'mobile': return r.mobile;
      case 'email': return r.email;
      case 'city': return r.city;
      case 'address': return r.address;
      default: return (r as unknown as Record<string, unknown>)[key];
    }
  }, []);
  const { sorted, sort, toggle } = useTableSort<Row>(rows, rowVal, { key: null, dir: 'asc' });
  const { pageItems: pagedPeople, bar } = usePagination(sorted);

  const handleSave = async () => {
    if (!editing) return;
    const body = {
      first_name: editing.first_name?.trim() || null,
      last_name:  editing.last_name?.trim()  || null,
      mobile:     editing.mobile?.trim()     || null,
      email:      editing.email?.trim()      || null,
      address:    editing.address?.trim()    || null,
      type:       editing.type?.trim()       || null,
      city:       editing.city?.trim()       || null,
      code:       editing.code?.trim()       || null,
    };
    if (!body.first_name && !body.last_name && !body.mobile && !body.email) {
      toast.error('Provide at least a name, mobile, or email');
      return;
    }
    try {
      if (editing.id) {
        await crmPeopleDirectory.update(editing.id, body);
        toast.success('Person updated');
      } else {
        await crmPeopleDirectory.create(body);
        toast.success('Person added');
      }
      setEditing(null);
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    }
  };

  // Inline "+ Add new type" handler — POSTs the new label, then refetches
  // the catalogue and pre-selects it on the currently editing row so the
  // admin can keep typing without losing context.
  const addType = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const r = await crmPeopleDirectoryTypes.create({ name: trimmed });
      const created = (r.data as PeopleDirectoryType | undefined)?.name ?? trimmed;
      await loadTypes();
      setEditing((cur) => cur ? { ...cur, type: created } : cur);
      toast.success(`Added type "${created}"`);
    } catch (err: any) {
      toast.error(err?.message || 'Could not add type');
    }
  };

  // CSV export — same client + filter scope as the list endpoint. We
  // fetch via the bearer token rather than using window.open, because
  // /api/v1 sits behind a Bearer auth gate so opening the URL plainly
  // returns 401. Stream the response into a blob and trigger a download.
  const handleExport = async () => {
    try {
      // Build the CSV client-side from the list endpoint instead of
      // /people-directory/export. The dedicated /export route was
      // shadowed for a while by the generic /:id GET handler (Express
      // matches in registration order, so /export got treated as
      // ":id = export" and the backend returned 404). The fix is
      // shipping in the matching backend PR, but the client-side
      // approach works against every backend version we'll ever
      // need to support without a deploy gate. Same filters the
      // list view uses (search + type) so the export reflects what
      // the rep currently sees on screen.
      const params: Record<string, string | number | undefined> = {};
      const s = search.trim(); if (s) params.q = s;
      if (typeFilter) params.type = typeFilter;
      if (cityFilter) params.city = cityFilter;
      const r = await crmPeopleDirectory.list(params);
      const data = ((r.data as Row[]) || []).filter((x) => !!x.id);
      if (data.length === 0) {
        toast.error('Nothing to export — adjust the filters first.');
        return;
      }
      const esc = (v: unknown): string => {
        if (v == null) return '';
        const str = String(v);
        return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      // User-facing "id" column = the typed `code` value. System
      // UUIDs stay internal so reps work in their own ID space.
      const header = ['id', 'first_name', 'last_name', 'mobile', 'email', 'type', 'city', 'address', 'created_at'];
      const colFor = (k: string): keyof PeopleDirectoryEntry => (k === 'id' ? 'code' : (k as keyof PeopleDirectoryEntry));
      const lines = data.map((row) => header.map((k) => esc((row as unknown as Record<string, unknown>)[colFor(k) as string])).join(','));
      const csv = `${header.join(',')}\n${lines.join('\n')}\n`;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `people-directory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      toast.error(err?.message || 'Export failed');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await crmPeopleDirectory.remove(id);
      toast.success('Deleted');
      refresh();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  return (
    <div style={{ maxWidth: 1200 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>People Directory</h1>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            Per-client address book — dealers, influencers, referrers. Records here are searchable from any lookup field configured against this object.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleExport} style={btnSecondary}>Export CSV</button>
          <button onClick={downloadTemplate} style={btnSecondary}>Download template</button>
          <Link
            href="/dashboard/crm/people-directory/import"
            style={btnSecondary}
          >Bulk Import</Link>
          <button
            onClick={() => setEditing({})}
            style={btnPrimary}
          >+ New Person</button>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, mobile or email"
          style={{
            flex: 1, minWidth: 220, maxWidth: 360,
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 14,
          }}
        />
        {/* Type filter — narrows by people_directory_types.name. Default
            "All types" keeps the historical (unfiltered) behaviour. */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 13,
          }}
        >
          <option value="">All types</option>
          {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
        </select>
        {/* City filter — same options as the editor city dropdown so a
            rep can narrow the directory to a specific city. Server-side
            via ?city=<name> on the list endpoint. */}
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          title="Filter by city"
          style={{
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 13,
          }}
        >
          <option value="">All cities</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{totalLabel}</span>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s3)', color: 'var(--text-dim)', textAlign: 'left' }}>
              <th style={{ ...thStyle, width: 140 }}><SortLabel label="ID" sortKey="id" sort={sort} onToggle={toggle} /></th>
              <th style={thStyle}><SortLabel label="Name" sortKey="name" sort={sort} onToggle={toggle} /></th>
              <th style={thStyle}><SortLabel label="Type" sortKey="type" sort={sort} onToggle={toggle} /></th>
              <th style={thStyle}><SortLabel label="Mobile" sortKey="mobile" sort={sort} onToggle={toggle} /></th>
              <th style={thStyle}><SortLabel label="Email" sortKey="email" sort={sort} onToggle={toggle} /></th>
              <th style={thStyle}><SortLabel label="City" sortKey="city" sort={sort} onToggle={toggle} /></th>
              <th style={thStyle}><SortLabel label="Address" sortKey="address" sort={sort} onToggle={toggle} /></th>
              <th style={{ ...thStyle, width: 110, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: 36, textAlign: 'center', color: 'var(--text-dim)' }}>
                  {search.trim() || typeFilter || cityFilter
                    ? 'No matching entries.'
                    : (<>Nothing here yet. Use <strong>Bulk Import</strong> to load a roster from CSV/XLSX, or <strong>+ New Person</strong> to add one.</>)}
                </td>
              </tr>
            )}
            {pagedPeople.map((r) => {
              const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{r.code || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={tdStyle}>{fullName || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={tdStyle}>
                    {r.type
                      ? <span style={typePill}>{r.type}</span>
                      : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={tdStyle}>{r.mobile || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={tdStyle}>{r.email || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={tdStyle}>{r.city || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={{ ...tdStyle, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.address || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <button onClick={() => setEditing(r)} style={rowBtn}>Edit</button>
                    <button onClick={() => handleDelete(r.id)} style={{ ...rowBtn, color: '#E11D48' }}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bar}

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? 'Edit person' : 'Add person'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {/* ID is the tenant-supplied identifier (employee / dealer
                code) that reps type by hand. Stored in `code` server-
                side; surfaced as "ID" everywhere user-facing because
                that's how Tata Tiscon refers to it on their existing
                rosters. The system UUID stays internal — not shown. */}
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="ID">
                <input
                  value={editing.code ?? ''}
                  onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  placeholder="Employee / dealer ID"
                  style={inputStyle}
                />
              </Field>
            </div>
            <Field label="First name">
              <input value={editing.first_name ?? ''} onChange={(e) => setEditing({ ...editing, first_name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Last name">
              <input value={editing.last_name ?? ''} onChange={(e) => setEditing({ ...editing, last_name: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Mobile">
              <input value={editing.mobile ?? ''} onChange={(e) => setEditing({ ...editing, mobile: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Email">
              <input type="email" value={editing.email ?? ''} onChange={(e) => setEditing({ ...editing, email: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Type">
              <TypePicker
                value={editing.type ?? ''}
                types={types}
                onChange={(v) => setEditing({ ...editing, type: v })}
                onAddNew={addType}
              />
            </Field>
            <Field label="City">
              {cities.length > 0 ? (
                <select
                  value={editing.city ?? ''}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value || null })}
                  style={inputStyle}
                >
                  <option value="">— Select —</option>
                  {/* Tolerate a previously-saved value that's no longer
                      in the allow-list (renamed / deactivated): surface
                      it at the top so the rep doesn't lose context. */}
                  {editing.city && !cities.includes(editing.city) && (
                    <option value={editing.city}>{editing.city} (legacy)</option>
                  )}
                  {cities.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              ) : (
                // Fallback to free-text while the city list loads / when
                // the tenant hasn't added any cities under Settings →
                // Locations yet.
                <input
                  value={editing.city ?? ''}
                  onChange={(e) => setEditing({ ...editing, city: e.target.value })}
                  placeholder="No cities configured — add some in Settings → Locations"
                  style={inputStyle}
                />
              )}
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Address">
                <textarea
                  value={editing.address ?? ''}
                  onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                  rows={3}
                  style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                />
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={() => setEditing(null)} style={btnSecondary}>Cancel</button>
            <button onClick={handleSave} style={btnPrimary}>{editing.id ? 'Save changes' : 'Add'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)' }}>
      <div style={{ marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 14,
          padding: 20, width: 560, maxWidth: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <h2 style={{ margin: '0 0 16px', fontSize: 17, color: 'var(--text)', fontWeight: 700 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Type picker — dropdown bound to the per-(org, client) catalog. The
 * trailing "+ Add new…" item flips the control into a tiny inline input
 * so the admin doesn't have to leave the create / edit modal just to
 * seed a new label. Mirrors the inline category-add patterns on the
 * leads + products forms.
 */
function TypePicker({
  value, types, onChange, onAddNew,
}: {
  value: string;
  types: PeopleDirectoryType[];
  onChange: (v: string) => void;
  onAddNew: (name: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  if (creating) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New type (e.g. Mason)"
          onKeyDown={async (e) => {
            if (e.key === 'Enter') { await onAddNew(draft); setDraft(''); setCreating(false); }
            else if (e.key === 'Escape') { setDraft(''); setCreating(false); }
          }}
          style={{ ...inputStyle, flex: 1 }}
        />
        <button
          onClick={async () => { await onAddNew(draft); setDraft(''); setCreating(false); }}
          style={{ ...btnSecondary, padding: '8px 10px' }}
        >Add</button>
        <button onClick={() => { setDraft(''); setCreating(false); }} style={{ ...btnSecondary, padding: '8px 10px' }}>×</button>
      </div>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__add__') setCreating(true);
        else onChange(e.target.value);
      }}
      style={inputStyle}
    >
      <option value="">— Pick a type —</option>
      {types.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
      <option value="__add__">+ Add new type…</option>
    </select>
  );
}

// Inline styles match the rest of the CRM surfaces — see the project's
// CLAUDE.md: "Inline styles (no CSS modules)".
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' };
const rowBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 10 };
const btnPrimary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer', textDecoration: 'none' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 };
const typePill: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 50, fontSize: 11, fontWeight: 700,
  background: 'rgba(225,29,72,0.12)', color: '#E11D48', letterSpacing: 0.3,
};

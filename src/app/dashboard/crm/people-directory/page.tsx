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
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmPeopleDirectory, type PeopleDirectoryEntry } from '../../../../lib/crmApi';

type Row = PeopleDirectoryEntry & { id: string };

export default function PeopleDirectoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Row> | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await crmPeopleDirectory.list({ q: search.trim() || undefined, limit: 200 });
      setRows(((r.data as Row[]) || []).filter((x) => !!x.id));
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load People Directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);
  // Debounce search so each keystroke doesn't fire a new request.
  useEffect(() => {
    const t = setTimeout(() => { refresh(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const totalLabel = useMemo(
    () => loading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`,
    [loading, rows.length],
  );

  const handleSave = async () => {
    if (!editing) return;
    const body = {
      first_name: editing.first_name?.trim() || null,
      last_name:  editing.last_name?.trim()  || null,
      mobile:     editing.mobile?.trim()     || null,
      email:      editing.email?.trim()      || null,
      address:    editing.address?.trim()    || null,
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, mobile or email"
          style={{
            flex: 1, maxWidth: 360,
            padding: '8px 12px', borderRadius: 8,
            background: 'var(--s2)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 14,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{totalLabel}</span>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--s3)', color: 'var(--text-dim)', textAlign: 'left' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Mobile</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Address</th>
              <th style={{ ...thStyle, width: 110, textAlign: 'right' }}></th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 36, textAlign: 'center', color: 'var(--text-dim)' }}>
                  {search.trim()
                    ? 'No matching entries.'
                    : (<>Nothing here yet. Use <strong>Bulk Import</strong> to load a roster from CSV/XLSX, or <strong>+ New Person</strong> to add one.</>)}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{fullName || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={tdStyle}>{r.mobile || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={tdStyle}>{r.email || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                  <td style={{ ...tdStyle, maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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

      {editing && (
        <Modal onClose={() => setEditing(null)} title={editing.id ? 'Edit person' : 'Add person'}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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

// Inline styles match the rest of the CRM surfaces — see the project's
// CLAUDE.md: "Inline styles (no CSS modules)".
const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 };
const tdStyle: React.CSSProperties = { padding: '10px 12px', color: 'var(--text)' };
const rowBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', marginLeft: 10 };
const btnPrimary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13, border: 'none', cursor: 'pointer' };
const btnSecondary: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer', textDecoration: 'none' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 };

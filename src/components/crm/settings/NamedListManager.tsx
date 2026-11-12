'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { isB2bClientActive } from '../../../lib/b2bClient';
import { apiErrorText } from '../../../lib/sparkAccounts';
import { usePageTitle } from '../../../lib/pageTitle';
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select, T } from '../../ui';
import type { NamedListItem } from '../../../types/crm';

// A small master-list manager (name, description, product count, on/off) used by Settings -> Makes and Settings -> Brands
// (connected-B2B only). The two pages differ only in wording and the API they pass in. Server messages for
// DUPLICATE / IN_USE / NOT_MIGRATED are shown right next to the action that caused them.

type Wrapped<X> = { success?: boolean; data: X };
export interface NamedListApi {
  list: (params?: Record<string, string | number | boolean | undefined | null>) => Promise<Wrapped<NamedListItem[]>>;
  create: (body: Partial<NamedListItem>) => Promise<unknown>;
  update: (id: string, body: Partial<NamedListItem>) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}

export interface NamedListManagerProps {
  /** Singular and plural, lower case: "make" / "makes". */
  noun: string;
  nounPlural: string;
  title: string;
  description: string;
  /** Shown when the list is empty (and nothing is being searched for). */
  emptyText: string;
  /** Placeholder for the name field of the add row, e.g. "Make name (e.g. Festo)". */
  namePlaceholder: string;
  api: NamedListApi;
}

type Status = '' | 'true' | 'false';

export default function NamedListManager({ noun, nounPlural, title, description, emptyText, namePlaceholder, api }: NamedListManagerProps) {
  usePageTitle(title);
  // Read after mount: the gate looks at localStorage.
  const [b2b, setB2b] = useState<boolean | null>(null);
  useEffect(() => { setB2b(isB2bClientActive()); }, []);

  const [items, setItems] = useState<NamedListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status>('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebouncedQ(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  // Add row.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [addError, setAddError] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const newNameRef = useRef<HTMLInputElement | null>(null);

  // Edit / delete-confirm state is per row; messages are shown under the row they belong to.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const setRowErr = (id: string, msg: string) => setRowError((m) => {
    const n = { ...m };
    if (msg) n[id] = msg; else delete n[id];
    return n;
  });

  const reqSeq = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const r = await api.list({ q: debouncedQ || undefined, is_active: status || undefined });
      if (seq !== reqSeq.current) return;
      setItems(r.data || []); setLoadError('');
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setItems([]); setLoadError(apiErrorText(e, `Could not load the ${nounPlural}`));
    } finally { if (seq === reqSeq.current) setLoading(false); }
  }, [api, debouncedQ, status, nounPlural]);
  useEffect(() => { if (b2b) reload(); }, [b2b, reload]);
  useEffect(() => { if (adding) newNameRef.current?.focus(); }, [adding]);

  const startAdd = () => { setAdding(true); setAddError(''); setNewName(''); setNewDesc(''); };
  const cancelAdd = () => { setAdding(false); setAddError(''); setNewName(''); setNewDesc(''); };

  const create = async () => {
    const name = newName.trim();
    if (!name) { setAddError('Name is required.'); return; }
    setAddBusy(true); setAddError('');
    try {
      await api.create({ name, description: newDesc.trim() || null, is_active: true });
      setNewName(''); setNewDesc('');
      newNameRef.current?.focus(); // stay open so several can be typed in a row
      await reload();
    } catch (e) { setAddError(apiErrorText(e, `Could not add the ${noun}`)); }
    finally { setAddBusy(false); }
  };

  const startEdit = (it: NamedListItem) => {
    setEditId(it.id); setEditName(it.name); setEditDesc(it.description || ''); setConfirmId(null); setRowErr(it.id, '');
  };
  const saveEdit = async (it: NamedListItem) => {
    const name = editName.trim();
    if (!name) { setRowErr(it.id, 'Name is required.'); return; }
    setBusyId(it.id); setRowErr(it.id, '');
    try {
      await api.update(it.id, { name, description: editDesc.trim() || null });
      setEditId(null);
      await reload();
    } catch (e) { setRowErr(it.id, apiErrorText(e, 'Could not save')); }
    finally { setBusyId(null); }
  };

  const toggle = async (it: NamedListItem) => {
    setBusyId(it.id); setRowErr(it.id, '');
    try {
      await api.update(it.id, { is_active: !it.is_active });
      await reload();
    } catch (e) { setRowErr(it.id, apiErrorText(e, 'Could not change this')); }
    finally { setBusyId(null); }
  };

  const remove = async (it: NamedListItem) => {
    setBusyId(it.id); setRowErr(it.id, '');
    try {
      await api.remove(it.id);
      setConfirmId(null);
      await reload();
    } catch (e) { setConfirmId(null); setRowErr(it.id, apiErrorText(e, 'Could not delete')); }
    finally { setBusyId(null); }
  };

  const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: T.dim, textTransform: 'uppercase', textAlign: 'left', borderBottom: `1px solid ${T.border}`, background: 'var(--s2)', fontWeight: 700, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'middle' };
  const errStyle: React.CSSProperties = { fontSize: 12, color: T.red, lineHeight: 1.4 };
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const searching = debouncedQ !== '' || status !== '';

  const header = (
    <PageHeader
      eyebrow={<Link href="/dashboard/crm/settings" style={{ color: 'inherit', textDecoration: 'none' }}>Settings</Link>}
      title={title}
      description={description}
      compact
      actions={b2b ? <Button variant="primary" icon={<Plus size={16} strokeWidth={1.8} />} onClick={startAdd} disabled={adding}>{`Add ${noun}`}</Button> : undefined}
    />
  );

  if (b2b === null) return <div style={{ color: T.dim }}>Loading...</div>;
  if (!b2b) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
        {header}
        <Card><div style={{ fontSize: 13, color: T.dim }}>{title} are not used by this client.</div></Card>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 960 }}>
      {header}

      {loadError && (
        <div role="alert" data-testid="nl-load-error" style={{ ...errStyle, background: T.redWash, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 14px', fontSize: 13 }}>{loadError}</div>
      )}

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 14, flexWrap: 'wrap', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200, maxWidth: 360 }}>
            <Search size={15} strokeWidth={1.6} aria-hidden style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
            <Input aria-label={`Search ${nounPlural}`} placeholder={`Search ${nounPlural}...`} value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
          <Select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value as Status)} style={{ width: 150 }}>
            <option value="">All</option>
            <option value="true">Active only</option>
            <option value="false">Switched off</option>
          </Select>
          <span style={{ fontSize: 12, color: T.mute, marginLeft: 'auto' }}>{loading ? 'Loading...' : `${items.length} ${items.length === 1 ? noun : nounPlural}`}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>Description</th>
                <th style={{ ...th, textAlign: 'right' }}>Products</th>
                <th style={th}>Active</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {adding && (
                <tr data-testid="nl-add-row" style={{ background: 'var(--s3)' }}>
                  <td style={td}>
                    <Input ref={newNameRef} aria-label={`New ${noun} name`} placeholder={namePlaceholder} value={newName}
                      onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') cancelAdd(); }} />
                  </td>
                  <td style={td}>
                    <Input aria-label={`New ${noun} description`} placeholder="Description (optional)" value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') cancelAdd(); }} />
                  </td>
                  <td style={td} />
                  <td style={td} />
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <Button size="sm" variant="primary" onClick={create} disabled={addBusy} style={{ marginRight: 6 }}>{addBusy ? 'Adding...' : 'Add'}</Button>
                    <Button size="sm" variant="ghost" onClick={cancelAdd}>Done</Button>
                  </td>
                </tr>
              )}
              {adding && addError && (
                <tr><td colSpan={5} style={{ ...td, background: 'var(--s3)', paddingTop: 0 }}><div role="alert" data-testid="nl-add-error" style={errStyle}>{addError}</div></td></tr>
              )}

              {!loading && !loadError && items.length === 0 && !adding && (
                <tr><td colSpan={5} style={{ padding: 0, borderBottom: `1px solid ${T.border}` }}>
                  <EmptyState
                    title={searching ? `No ${nounPlural} match.` : emptyText}
                    action={!searching ? <Button variant="primary" icon={<Plus size={16} strokeWidth={1.8} />} onClick={startAdd}>{`Add ${noun}`}</Button> : undefined}
                  />
                </td></tr>
              )}

              {items.map((it) => {
                const editing = editId === it.id;
                const confirming = confirmId === it.id;
                const busy = busyId === it.id;
                const err = rowError[it.id];
                return (
                  <RowFragment key={it.id}>
                    <tr data-testid={`nl-row-${it.id}`}>
                      <td style={td}>
                        {editing ? (
                          <Input aria-label={`${cap(noun)} name`} value={editName} autoFocus onChange={(e) => { setEditName(e.target.value); setRowErr(it.id, ''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(it); if (e.key === 'Escape') setEditId(null); }} />
                        ) : (
                          <span style={{ fontWeight: 600, opacity: it.is_active ? 1 : 0.6 }}>
                            {it.name}
                            {!it.is_active && <Badge style={{ marginLeft: 8 }}>Off</Badge>}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, color: T.dim }}>
                        {editing ? (
                          <Input aria-label={`${cap(noun)} description`} value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(it); if (e.key === 'Escape') setEditId(null); }} />
                        ) : (it.description || '—')}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{it.product_count ?? 0}</td>
                      <td style={td}>
                        <button type="button" role="switch" aria-checked={it.is_active} aria-label={`${it.name} active`} disabled={busy} onClick={() => toggle(it)}
                          style={{ width: 38, height: 22, borderRadius: 999, border: `1px solid ${T.border}`, background: it.is_active ? T.ok : 'var(--s3)', position: 'relative', cursor: busy ? 'default' : 'pointer', padding: 0, opacity: busy ? 0.6 : 1 }}>
                          <span aria-hidden style={{ position: 'absolute', top: 2, left: it.is_active ? 18 : 2, width: 16, height: 16, borderRadius: 999, background: '#fff', transition: 'left .12s ease', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
                        </button>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {editing ? (
                          <>
                            <Button size="sm" variant="primary" onClick={() => saveEdit(it)} disabled={busy} style={{ marginRight: 6 }}>{busy ? 'Saving...' : 'Save'}</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditId(null); setRowErr(it.id, ''); }}>Cancel</Button>
                          </>
                        ) : confirming ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: T.dim }}>{`Delete "${it.name}"?`}</span>
                            <Button size="sm" variant="danger" onClick={() => remove(it)} disabled={busy}>{busy ? 'Deleting...' : 'Yes, delete'}</Button>
                            <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button>
                          </span>
                        ) : (
                          <>
                            <Button size="sm" variant="secondary" onClick={() => startEdit(it)} style={{ marginRight: 6 }} aria-label={`Edit ${it.name}`}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setConfirmId(it.id); setRowErr(it.id, ''); }} aria-label={`Delete ${it.name}`}>Delete</Button>
                          </>
                        )}
                      </td>
                    </tr>
                    {err && (
                      <tr><td colSpan={5} style={{ ...td, paddingTop: 0 }}><div role="alert" data-testid={`nl-row-error-${it.id}`} style={errStyle}>{err}</div></td></tr>
                    )}
                  </RowFragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// tbody children must be <tr>; a fragment keeps a row and its message row together under one key.
function RowFragment({ children }: { children: React.ReactNode }) { return <>{children}</>; }

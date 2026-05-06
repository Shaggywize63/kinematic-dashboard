'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmProductCategories } from '../../../../../lib/crmApi';
import type { ProductCategory } from '../../../../../types/crm';

// Product category management. Backend already exposes /api/v1/crm/product-categories
// via the attach() pattern (clientScoped, with sort_order ordering). This page
// adds the missing UI surface — a flat list with inline create / rename /
// delete and a simple parent picker so categories can nest.

export default function ProductCategoriesPage() {
  const [items, setItems] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; parent_category_id: string; color: string; sort_order: number }>({
    name: '', description: '', parent_category_id: '', color: '#6366f1', sort_order: 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; description: string; parent_category_id: string; color: string; sort_order: number }>({
    name: '', description: '', parent_category_id: '', color: '#6366f1', sort_order: 0,
  });

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmProductCategories.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load categories'); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const resetAdd = () => {
    setForm({ name: '', description: '', parent_category_id: '', color: '#6366f1', sort_order: 0 });
    setShowAdd(false);
  };

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    try {
      await crmProductCategories.create({
        name: form.name.trim(),
        description: form.description || undefined,
        parent_category_id: form.parent_category_id || undefined,
        color: form.color || undefined,
        sort_order: Number(form.sort_order) || 0,
      } as any);
      toast.success('Category created');
      resetAdd();
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
  };

  const startEdit = (c: ProductCategory) => {
    setEditingId(c.id);
    setEditForm({
      name: c.name,
      description: c.description ?? '',
      parent_category_id: c.parent_category_id ?? '',
      color: c.color ?? '#6366f1',
      sort_order: c.sort_order ?? 0,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!editForm.name.trim()) { toast.error('Name is required'); return; }
    setBusyId(editingId);
    try {
      await crmProductCategories.update(editingId, {
        name: editForm.name.trim(),
        description: editForm.description || null,
        parent_category_id: editForm.parent_category_id || null,
        color: editForm.color || null,
        sort_order: Number(editForm.sort_order) || 0,
      } as any);
      setEditingId(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Save failed'); }
    finally { setBusyId(null); }
  };

  const remove = async (c: ProductCategory) => {
    if (!confirm(`Delete category "${c.name}"? Products mapped to it will be left without a category.`)) return;
    setBusyId(c.id);
    try {
      await crmProductCategories.remove(c.id);
      toast.success('Category deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusyId(null); }
  };

  const parentName = (id?: string | null) => id ? items.find((c) => c.id === id)?.name ?? '—' : '—';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Product Categories</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', maxWidth: 640 }}>Group products into a category tree. Used in the products list and on deal line items.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/dashboard/crm/products" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Back to Products</Link>
          <button onClick={() => { resetAdd(); setShowAdd(true); }} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ New Category</button>
        </div>
      </div>

      {showAdd && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>New Category</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Field label="Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. TMT Bars" style={input} /></Field>
            <Field label="Parent (optional)">
              <select value={form.parent_category_id} onChange={(e) => setForm({ ...form, parent_category_id: e.target.value })} style={input}>
                <option value="">— None (top-level) —</option>
                {items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Sort order"><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} style={input} /></Field>
            <Field label="Colour"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ ...input, padding: 4, height: 36 }} /></Field>
            <Field label="Description"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="optional" style={input} /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={resetAdd} style={btnGhost}>Cancel</button>
            <button onClick={create} style={btnPrimary}>Create</button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Parent</th>
              <th style={th}>Sort</th>
              <th style={th}>Colour</th>
              <th style={th}>Description</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No categories yet — click <strong style={{ color: 'var(--text)' }}>+ New Category</strong> to add one.</td></tr>}
            {items.map((c) => editingId === c.id ? (
              <tr key={c.id} style={{ background: 'var(--s3)' }}>
                <td style={td}><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} style={input} /></td>
                <td style={td}>
                  <select value={editForm.parent_category_id} onChange={(e) => setEditForm({ ...editForm, parent_category_id: e.target.value })} style={input}>
                    <option value="">— None —</option>
                    {items.filter((x) => x.id !== c.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </td>
                <td style={td}><input type="number" value={editForm.sort_order} onChange={(e) => setEditForm({ ...editForm, sort_order: Number(e.target.value) })} style={input} /></td>
                <td style={td}><input type="color" value={editForm.color} onChange={(e) => setEditForm({ ...editForm, color: e.target.value })} style={{ ...input, padding: 4, height: 32, width: 56 }} /></td>
                <td style={td}><input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={input} /></td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={saveEdit} disabled={busyId === c.id} style={btnPrimary}>Save</button>{' '}
                  <button onClick={() => setEditingId(null)} style={btnGhost}>Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: c.color ?? '#6366f1', display: 'inline-block' }} />
                    <strong style={{ color: 'var(--text)' }}>{c.name}</strong>
                  </span>
                </td>
                <td style={td}>{parentName(c.parent_category_id)}</td>
                <td style={td}>{c.sort_order ?? 0}</td>
                <td style={td}><span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.color ?? '—'}</span></td>
                <td style={td}>{c.description || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button onClick={() => startEdit(c)} style={btnGhost}>Edit</button>{' '}
                  <button onClick={() => remove(c)} disabled={busyId === c.id} style={btnDanger}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { width: '100%', background: 'var(--s4)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
const btnDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #E01E2C', color: '#E01E2C', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' };

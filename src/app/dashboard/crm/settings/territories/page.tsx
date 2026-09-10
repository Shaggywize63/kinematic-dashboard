'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { crmTerritories } from '../../../../../lib/crmApi';
import type { Territory } from '../../../../../types/crm';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, FormGrid, IconButton, Input, PageHeader, Select, T, useIsCompact } from '../../../../../components/ui';
import { usePageTitle } from '../../../../../lib/pageTitle';
import LogoSpinner from '../../../../../components/shared/LogoSpinner';

export default function TerritoriesPage() {
  usePageTitle('Territories');
  const narrow = useIsCompact(900);
  const [items, setItems] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmTerritories.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setCreating(true);
    try {
      await crmTerritories.create({ name: name.trim(), description: description.trim() || null, parent_id: parentId || null } as any);
      toast.success('Territory added');
      setName(''); setDescription(''); setParentId('');
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return toast.error('Name is required');
    try {
      await crmTerritories.update(id, { name: editName.trim() } as any);
      toast.success('Updated');
      setEditingId(null);
      reload();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  const remove = async (t: Territory) => {
    if (!window.confirm(`Delete territory "${t.name}"? Sub-territories using this as parent will be orphaned.`)) return;
    setBusy((b) => ({ ...b, [t.id]: true }));
    try {
      await crmTerritories.remove(t.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [t.id]: false })); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Territories"
        description="Sales territory hierarchy. Nest regions under a parent to build the tree reps and reports are scoped by."
        compact={narrow}
      />

      <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>Add territory</Eyebrow>
          <div style={{ fontSize: 13, color: T.dim }}>Pick a parent to nest it, or leave it top-level.</div>
        </div>
        <FormGrid narrow={narrow} columns={3}>
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. North Region)" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
          </Field>
          <Field label="Parent">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Top-level —</option>
              {items.map((t) => <option key={t.id} value={t.id}>Under: {t.name}</option>)}
            </Select>
          </Field>
        </FormGrid>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={create} disabled={creating} icon={<Plus size={16} strokeWidth={2} />}>
            {creating ? 'Adding...' : 'Add Territory'}
          </Button>
        </div>
      </Card>

      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
          <Eyebrow>Territories</Eyebrow>
          {!loading && <Badge mono>{items.length}</Badge>}
        </div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 16px', color: T.dim, fontSize: 13 }}>
            <LogoSpinner size={18} />
            Loading...
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Network size={18} strokeWidth={1.6} />}
            title="No territories yet"
            description="Add one above to start the hierarchy."
          />
        ) : (
          <div>
            {items.map((t, idx) => {
              const parent = t.parent_id ? items.find((x) => x.id === t.parent_id) : null;
              const isEditing = editingId === t.id;
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', fontSize: 13.5, color: T.text,
                    borderBottom: idx === items.length - 1 ? 'none' : `1px solid ${T.border}`, flexWrap: narrow ? 'wrap' : 'nowrap',
                  }}
                >
                  {isEditing ? (
                    <>
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1, minWidth: 180 }} aria-label="Territory name" />
                      <Button size="sm" onClick={() => saveEdit(t.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500 }}>{t.name}</span>
                          {parent && <Badge>under {parent.name}</Badge>}
                        </div>
                        {t.description && <div style={{ fontSize: 12.5, color: T.dim }}>{t.description}</div>}
                      </div>
                      <IconButton label="Edit" onClick={() => { setEditingId(t.id); setEditName(t.name); }}>
                        <Pencil size={16} strokeWidth={1.6} />
                      </IconButton>
                      <IconButton label="Delete" onClick={() => remove(t)} disabled={!!busy[t.id]} style={{ color: T.red, opacity: busy[t.id] ? 0.5 : 1 }}>
                        <Trash2 size={16} strokeWidth={1.6} />
                      </IconButton>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

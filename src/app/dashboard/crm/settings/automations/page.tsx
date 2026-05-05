'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmAutomations } from '../../../../../lib/crmApi';
import type { Automation } from '../../../../../types/crm';

const TRIGGERS = [
  { value: 'lead_created', label: 'Lead created' },
  { value: 'lead_status_changed', label: 'Lead status changed' },
  { value: 'lead_score_threshold', label: 'Lead score crosses threshold' },
  { value: 'deal_stage_changed', label: 'Deal stage changed' },
  { value: 'deal_won', label: 'Deal won' },
  { value: 'deal_lost', label: 'Deal lost' },
  { value: 'task_due', label: 'Task is due' },
];

const ACTIONS = [
  { value: 'send_email', label: 'Send email (template)' },
  { value: 'send_whatsapp', label: 'Send WhatsApp (template)' },
  { value: 'assign_owner', label: 'Assign owner' },
  { value: 'create_task', label: 'Create follow-up task' },
  { value: 'add_note', label: 'Add internal note' },
  { value: 'webhook', label: 'POST to webhook URL' },
];

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState(TRIGGERS[0].value);
  const [action, setAction] = useState(ACTIONS[0].value);
  const [actionDetail, setActionDetail] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const r = await crmAutomations.list();
      setItems(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Load failed'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setCreating(true);
    try {
      await crmAutomations.create({
        name: name.trim(),
        trigger,
        actions: [{ type: action, detail: actionDetail.trim() || null }],
        is_active: true,
      } as any);
      toast.success('Automation created');
      setName(''); setActionDetail('');
      reload();
    } catch (e: any) { toast.error(e.message || 'Create failed'); }
    finally { setCreating(false); }
  };

  const toggleActive = async (a: Automation) => {
    setBusy((b) => ({ ...b, [a.id + '_t']: true }));
    try {
      await crmAutomations.update(a.id, { is_active: !a.is_active } as any);
      toast.success(a.is_active ? 'Paused' : 'Activated');
      reload();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
    finally { setBusy((b) => ({ ...b, [a.id + '_t']: false })); }
  };

  const remove = async (a: Automation) => {
    if (!window.confirm(`Delete automation "${a.name}"?`)) return;
    setBusy((b) => ({ ...b, [a.id + '_d']: true }));
    try {
      await crmAutomations.remove(a.id);
      toast.success('Deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
    finally { setBusy((b) => ({ ...b, [a.id + '_d']: false })); }
  };

  const triggerLabel = (t: string) => TRIGGERS.find((x) => x.value === t)?.label || t;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>New Automation</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 12 }}>
          Run an action automatically when a CRM event happens. Backend support for individual triggers/actions may vary — check API logs after firing.
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Automation name (e.g. Notify Slack on hot leads)" style={{ ...input, width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={input}>
            {TRIGGERS.map((t) => <option key={t.value} value={t.value}>When: {t.label}</option>)}
          </select>
          <select value={action} onChange={(e) => setAction(e.target.value)} style={input}>
            {ACTIONS.map((a) => <option key={a.value} value={a.value}>Then: {a.label}</option>)}
          </select>
        </div>
        <input
          value={actionDetail}
          onChange={(e) => setActionDetail(e.target.value)}
          placeholder={
            action === 'webhook' ? 'Webhook URL'
            : action === 'send_email' || action === 'send_whatsapp' ? 'Template ID or name'
            : action === 'assign_owner' ? 'User ID or territory ID'
            : action === 'create_task' ? 'Task title'
            : 'Detail (optional)'
          }
          style={{ ...input, width: '100%', marginBottom: 12 }}
        />
        <button onClick={create} disabled={creating} style={btnPrimary}>{creating ? 'Creating...' : '+ Create Automation'}</button>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Configured Automations ({items.length})</div>
        {loading ? <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading...</div> : items.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No automations configured yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((a) => (
              <div key={a.id} style={{ padding: 12, background: 'var(--s3)', borderRadius: 8, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    {a.name}
                    {!a.is_active && <span style={{ marginLeft: 8, fontSize: 10, background: 'var(--s2)', color: 'var(--text-dim)', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>PAUSED</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>Trigger: {triggerLabel(a.trigger)}</div>
                </div>
                <button onClick={() => toggleActive(a)} disabled={!!busy[a.id + '_t']} style={btnSmallGhost}>{a.is_active ? 'Pause' : 'Activate'}</button>
                <button onClick={() => remove(a)} disabled={!!busy[a.id + '_d']} style={{ ...btnSmallDanger, opacity: busy[a.id + '_d'] ? 0.5 : 1 }}>{busy[a.id + '_d'] ? '...' : 'Delete'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };
const btnSmallDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11 };

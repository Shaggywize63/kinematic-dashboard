'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmActivities } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';

const TYPES = [
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'task', label: 'Task' },
  { value: 'note', label: 'Note' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const ENTITY_TYPES = [
  { value: '', label: '— None —' },
  { value: 'lead', label: 'Lead' },
  { value: 'contact', label: 'Contact' },
  { value: 'deal', label: 'Deal' },
  { value: 'account', label: 'Account' },
];

export default function NewActivityPage() {
  const router = useRouter();
  const [type, setType] = useState<string>('call');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (api.getUsers({ limit: '500' }) as Promise<any>)
      .then((u) => {
        const list: UserOption[] = (u.data || u || []).map((x: any) => ({
          id: x.id, name: x.name || x.full_name || x.email || 'User',
        }));
        setUsers(list);
      })
      .catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return toast.error('Subject is required');
    setBusy(true);
    const payload: Record<string, unknown> = {
      type,
      subject: subject.trim(),
      body: body.trim() || undefined,
      due_at: dueAt || undefined,
      assigned_to: assignedTo || undefined,
    };
    if (entityType && entityId.trim()) {
      payload.linked_to_type = entityType;
      payload.linked_to_id = entityId.trim();
    }
    try {
      await crmActivities.create(payload as any);
      toast.success('Activity logged successfully');
      router.push('/dashboard/crm/activities');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save activity');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 680 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>Log Activity</h2>
      <p style={{ margin: '-4px 0 18px', fontSize: 13, color: 'var(--text-dim)' }}>
        Record a call, meeting, task, note, or message. Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
      </p>

      <Section title="Activity Details">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Field label="Type *">
            <select value={type} onChange={(e) => setType(e.target.value)} style={input}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="Subject *">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="e.g. Discovery call with Acme" style={input} />
          </Field>
        </div>
        <Field label="Notes / Description" style={{ marginTop: 12 }}>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What was discussed, outcome, follow-up points…" style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
          <Field label={type === 'task' ? 'Due Date & Time' : 'Scheduled At'}>
            <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} style={input} />
          </Field>
          <Field label="Assign To">
            <UserSearchSelect
              options={users}
              value={assignedTo}
              onChange={setAssignedTo}
              placeholder="Search team member…"
              emptyLabel="Unassigned"
            />
          </Field>
        </div>
      </Section>

      <Section title="Link to Entity (optional)">
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Optionally attach this activity to a lead, deal, contact, or account.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <Field label="Entity Type">
            <select value={entityType} onChange={(e) => { setEntityType(e.target.value); setEntityId(''); }} style={input}>
              {ENTITY_TYPES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </Field>
          {entityType && (
            <Field label={`${entityType[0].toUpperCase() + entityType.slice(1)} ID`}>
              <input
                value={entityId}
                onChange={(e) => setEntityId(e.target.value)}
                placeholder={`Paste ${entityType} ID…`}
                style={input}
              />
            </Field>
          )}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => router.back()} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={busy} style={btnPrimary}>{busy ? 'Saving…' : 'Log Activity'}</button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: 'pointer' };

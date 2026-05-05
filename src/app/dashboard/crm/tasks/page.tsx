'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmTasks } from '../../../../lib/crmApi';
import api from '../../../../lib/api';
import type { Task } from '../../../../types/crm';
import UserSearchSelect, { type UserOption } from '../../../../components/crm/shared/UserSearchSelect';
import { getStoredUser, canAccess } from '../../../../lib/auth';

const PRIORITY_OPTIONS: Array<{ value: Task['priority']; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newDue, setNewDue] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newPriority, setNewPriority] = useState<Task['priority']>('normal');
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    try {
      const r = await crmTasks.list();
      setTasks(r.data || []);
    } catch (e: any) { toast.error(e.message || 'Failed to load tasks'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const user = getStoredUser();
    if (user && canAccess(user.role, ['sub_admin'])) setIsAdmin(true);

    reload();
    (api.getUsers({ limit: '500' }) as Promise<any>)
      .then((u) => {
        const list: UserOption[] = (u.data || u || []).map((x: any) => ({
          id: x.id, name: x.name || x.full_name || x.email || 'User',
        }));
        setUsers(list);
      })
      .catch(() => {});
  }, []);

  const createTask = async () => {
    if (!newSubject.trim()) return toast.error('Subject is required');
    setCreating(true);
    try {
      await crmTasks.create({
        subject: newSubject.trim(),
        due_at: newDue || undefined,
        assigned_to: newAssignee || undefined,
        priority: newPriority,
        status: 'open',
      } as any);
      toast.success('Task created');
      setNewSubject(''); setNewDue(''); setNewAssignee(''); setNewPriority('normal');
      setShowCreate(false);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Create failed');
    } finally { setCreating(false); }
  };

  const setStatus = async (t: Task, status: Task['status']) => {
    try {
      await crmTasks.update(t.id, { status } as any);
      toast.success('Task updated');
      reload();
    } catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  const remove = async (t: Task) => {
    if (!window.confirm(`Delete task "${t.subject}"?`)) return;
    try {
      await crmTasks.remove(t.id);
      toast.success('Task deleted');
      reload();
    } catch (e: any) { toast.error(e.message || 'Delete failed'); }
  };

  const userName = (id?: string | null) => id ? (users.find((u) => u.id === id)?.name || 'User') : null;

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;

  const groups: Record<string, Task[]> = { open: [], in_progress: [], done: [] };
  tasks.forEach((t) => { (groups[t.status] || (groups[t.status] = [])).push(t); });

  const overdueTasks = tasks.filter((t) => t.status !== 'done' && t.due_at && new Date(t.due_at) < new Date());

  return (
    <div>
      {/* Admin summary banner */}
      {isAdmin && tasks.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { label: 'Total', value: tasks.length, color: 'var(--primary)' },
            { label: 'Open', value: groups.open?.length || 0, color: '#6366f1' },
            { label: 'In Progress', value: groups.in_progress?.length || 0, color: '#f59e0b' },
            { label: 'Done', value: groups.done?.length || 0, color: '#10b981' },
            { label: 'Overdue', value: overdueTasks.length, color: '#ef4444' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 16px', minWidth: 80, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
          {isAdmin && ' · Admin view — all tasks across org'}
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {showCreate ? '✕ Cancel' : '+ New Task'}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Create New Task</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createTask()}
              placeholder="Task subject / title *"
              style={fieldInput}
            />
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as Task['priority'])} style={fieldInput}>
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label} priority</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Due Date & Time</div>
              <input type="datetime-local" value={newDue} onChange={(e) => setNewDue(e.target.value)} style={fieldInput} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>
                {isAdmin ? 'Assign To (any team member)' : 'Assign To'}
              </div>
              <UserSearchSelect
                options={users}
                value={newAssignee}
                onChange={setNewAssignee}
                placeholder="Search team member…"
                emptyLabel="Unassigned"
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={createTask} disabled={creating} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {creating ? 'Creating…' : 'Create Task'}
            </button>
            <button onClick={() => { setShowCreate(false); setNewSubject(''); }} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {(['open', 'in_progress', 'done'] as const).map((status) => (
          <div key={status} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              {status === 'in_progress' ? 'In Progress' : status === 'done' ? 'Done' : 'Open'} ({groups[status]?.length || 0})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(groups[status] || []).length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: '8px 0' }}>No tasks here</div>
              )}
              {(groups[status] || []).map((t) => {
                const overdue = t.due_at && status !== 'done' && new Date(t.due_at) < new Date();
                const assignee = userName((t as any).assigned_to || t.owner_id);
                const priorityColor: Record<string, string> = { urgent: '#ef4444', high: '#f59e0b', normal: 'var(--primary)', low: 'var(--text-dim)' };
                return (
                  <div key={t.id} style={{ background: 'var(--s3)', border: `1px solid ${overdue ? '#ef4444' : 'var(--border)'}`, borderRadius: 10, padding: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{t.subject}</div>
                      {t.priority && (
                        <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', padding: '2px 5px', borderRadius: 4, background: 'var(--s2)', color: priorityColor[t.priority] || 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                          {t.priority}
                        </span>
                      )}
                    </div>
                    {assignee && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>👤 {assignee}</div>
                    )}
                    {isAdmin && (t as any).owner_name && (t as any).owner_name !== assignee && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 2 }}>🏷 Owner: {(t as any).owner_name}</div>
                    )}
                    {t.due_at && (
                      <div style={{ fontSize: 11, color: overdue ? '#ef4444' : 'var(--text-dim)', marginBottom: 6 }}>
                        {overdue ? '⚠ Overdue · ' : ''}Due {new Date(t.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {(t as any).related_type && (
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                        🔗 {(t as any).related_type}: <code style={{ fontSize: 10 }}>{((t as any).related_id || '').slice(0, 8)}…</code>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {status !== 'open' && <button onClick={() => setStatus(t, 'open')} style={chip}>Open</button>}
                      {status !== 'in_progress' && <button onClick={() => setStatus(t, 'in_progress')} style={chip}>In Progress</button>}
                      {status !== 'done' && <button onClick={() => setStatus(t, 'done')} style={chipGreen}>Done</button>}
                      <button onClick={() => remove(t)} style={chipDanger}>Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const fieldInput: React.CSSProperties = { width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };
const chip: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '2px 8px', borderRadius: 999, fontSize: 10, cursor: 'pointer' };
const chipGreen: React.CSSProperties = { background: 'transparent', border: '1px solid #10b981', color: '#10b981', padding: '2px 8px', borderRadius: 999, fontSize: 10, cursor: 'pointer' };
const chipDanger: React.CSSProperties = { background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', padding: '2px 8px', borderRadius: 999, fontSize: 10, cursor: 'pointer' };

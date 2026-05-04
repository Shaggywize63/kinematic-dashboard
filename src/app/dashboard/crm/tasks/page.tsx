'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmTasks } from '../../../../lib/crmApi';
import type { Task } from '../../../../types/crm';

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try { const r = await crmTasks.list(); setTasks(r.data || []); }
    catch (e: any) { toast.error(e.message || 'Failed'); } finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const setStatus = async (t: Task, status: Task['status']) => {
    try { await crmTasks.update(t.id, { status }); reload(); }
    catch (e: any) { toast.error(e.message || 'Failed'); }
  };

  if (loading) return <div style={{ color: 'var(--text-dim)' }}>Loading...</div>;

  const groups: Record<string, Task[]> = { open: [], in_progress: [], done: [] };
  tasks.forEach((t) => { (groups[t.status] || (groups[t.status] = [])).push(t); });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
      {(['open', 'in_progress', 'done'] as const).map((status) => (
        <div key={status} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>{status.replace('_', ' ')} ({groups[status]?.length || 0})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(groups[status] || []).map((t) => (
              <div key={t.id} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{t.subject}</div>
                {t.due_at && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Due {new Date(t.due_at).toLocaleDateString()}</div>}
                <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                  {status !== 'open' && <button onClick={() => setStatus(t, 'open')} style={chip}>To Open</button>}
                  {status !== 'in_progress' && <button onClick={() => setStatus(t, 'in_progress')} style={chip}>In Progress</button>}
                  {status !== 'done' && <button onClick={() => setStatus(t, 'done')} style={chip}>Done</button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const chip: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '2px 8px', borderRadius: 999, fontSize: 10, cursor: 'pointer' };

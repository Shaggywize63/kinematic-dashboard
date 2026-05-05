'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../lib/api';
import OwnerAvatar from './OwnerAvatar';

type UserOption = { id: string; name: string };

interface Props {
  currentOwnerId?: string | null;
  currentOwnerName?: string | null;
  onAssign: (userId: string | null) => Promise<void>;
  size?: number;
}

export default function InlineOwnerAssign({ currentOwnerId, currentOwnerName, onAssign, size = 24 }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const loadUsers = async () => {
    if (users.length > 0 || loading) return;
    setLoading(true);
    try {
      const r = await api.getUsers({ limit: '500' }) as any;
      const list: UserOption[] = (r.data || r || []).map((u: any) => ({
        id: u.id,
        name: u.name || u.full_name || u.email || 'User',
      }));
      setUsers(list);
    } catch { setUsers([]); } finally { setLoading(false); }
  };

  const assign = async (userId: string | null) => {
    setBusy(true);
    try {
      await onAssign(userId);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Assign failed');
    } finally { setBusy(false); }
  };

  const filtered = search
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((v) => !v); loadUsers(); }}
        disabled={busy}
        title="Click to reassign"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent',
          border: '1px dashed transparent', padding: '2px 6px', borderRadius: 6,
          color: 'var(--text)', cursor: busy ? 'wait' : 'pointer', fontSize: 12,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
      >
        <OwnerAvatar name={currentOwnerName} size={size} />
        <span>{busy ? '…' : (currentOwnerName || 'Unassigned')}</span>
        <span style={{ fontSize: 9, color: 'var(--text-dim)', marginLeft: 2 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 200, minWidth: 220,
          maxHeight: 280, overflowY: 'auto',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team member…"
              style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', borderRadius: 6, fontSize: 12, boxSizing: 'border-box' }}
            />
          </div>
          {currentOwnerId && (
            <button
              onClick={() => assign(null)}
              style={{ width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#ef4444', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}
            >
              ✕ Unassign
            </button>
          )}
          {loading && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>Loading…</div>}
          {!loading && filtered.length === 0 && <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-dim)' }}>No users found</div>}
          {filtered.slice(0, 50).map((u) => (
            <button
              key={u.id}
              onClick={() => assign(u.id)}
              disabled={u.id === currentOwnerId}
              style={{
                width: '100%', display: 'block', padding: '8px 14px', background: u.id === currentOwnerId ? 'var(--s3)' : 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)',
                color: u.id === currentOwnerId ? 'var(--text-dim)' : 'var(--text)',
                textAlign: 'left', cursor: u.id === currentOwnerId ? 'default' : 'pointer', fontSize: 13,
              }}
            >
              {u.name}{u.id === currentOwnerId && <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--primary)' }}>● current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

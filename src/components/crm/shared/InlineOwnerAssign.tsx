'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../../lib/api';
import OwnerAvatar from './OwnerAvatar';

type UserOption = { id: string; name: string };

interface Props {
  currentOwnerId?: string | null;
  currentOwnerName?: string | null;
  onAssign: (userId: string | null) => Promise<void>;
  size?: number;
  recordLabel?: string;
}

// Trigger button that opens a centered popup modal for owner reassignment.
// Used in list rows for leads, contacts, deals.
export default function InlineOwnerAssign({ currentOwnerId, currentOwnerName, onAssign, size = 24, recordLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    if (users.length > 0) return;
    setLoading(true);
    (api.getUsers({ limit: '500', scope: 'assignable' }) as Promise<any>)
      .then((r) => {
        const list: UserOption[] = (r.data || r || []).map((u: any) => ({
          id: u.id,
          name: u.name || u.full_name || u.email || 'User',
        }));
        setUsers(list);
      })
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [open]);  // eslint-disable-line react-hooks/exhaustive-deps

  const assign = async (userId: string | null) => {
    setBusy(true);
    try {
      await onAssign(userId);
      setOpen(false);
      setSearch('');
    } catch (e: any) {
      toast.error(e?.message || 'Assign failed');
    } finally { setBusy(false); }
  };

  const filtered = search
    ? users.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
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
        <div
          onClick={() => !busy && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--s2)', border: '1px solid var(--border)',
              borderRadius: 14, padding: 0, maxWidth: 440, width: '100%',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 2 }}>Assign owner</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{recordLabel || 'Pick a team member'}</div>
                {currentOwnerName && (
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                    Currently assigned to <strong style={{ color: 'var(--text)' }}>{currentOwnerName}</strong>
                  </div>
                )}
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}
              >×</button>
            </div>

            <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team member…"
                style={{ width: '100%', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, maxHeight: 360 }}>
              {currentOwnerId && (
                <button
                  onClick={() => assign(null)}
                  disabled={busy}
                  style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#ef4444', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  ✕ Unassign
                </button>
              )}
              {loading && <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--text-dim)' }}>Loading users…</div>}
              {!loading && filtered.length === 0 && <div style={{ padding: '14px 18px', fontSize: 12, color: 'var(--text-dim)' }}>No matching users.</div>}
              {filtered.slice(0, 100).map((u) => (
                <button
                  key={u.id}
                  onClick={() => assign(u.id)}
                  disabled={busy || u.id === currentOwnerId}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', background: u.id === currentOwnerId ? 'var(--s3)' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    color: u.id === currentOwnerId ? 'var(--text-dim)' : 'var(--text)',
                    textAlign: 'left',
                    cursor: busy || u.id === currentOwnerId ? 'default' : 'pointer',
                    fontSize: 13,
                  }}
                >
                  <OwnerAvatar name={u.name} size={28} />
                  <span style={{ flex: 1 }}>{u.name}</span>
                  {u.id === currentOwnerId && <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>● current</span>}
                </button>
              ))}
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => !busy && setOpen(false)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

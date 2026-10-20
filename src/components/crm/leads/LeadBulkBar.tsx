'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Trash2, UserCheck, UserPlus, X } from 'lucide-react';
import { Button, IconButton, T } from '../../ui';
import OwnerAvatar from '../shared/OwnerAvatar';

export interface BulkUser { id: string; name: string }

/**
 * Floating bar that appears once rows are selected. Sticks to the bottom of
 * the viewport while the list scrolls, so the actions are always one click
 * away from a selection made anywhere on the page. Assign actions are omitted
 * entirely when the viewer may not assign owners (admin_only clients).
 */
export default function LeadBulkBar({
  count, canAssign, busy, users, usersLoading, myId, onLoadUsers, onAssignToMe, onAssignTo, onDelete, onClear,
}: {
  count: number;
  canAssign: boolean;
  busy: boolean;
  users: BulkUser[];
  usersLoading: boolean;
  myId: string | null;
  onLoadUsers: () => void;
  onAssignToMe: () => void;
  onAssignTo: (id: string, name: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // The selection can empty out (cleared / assigned / deleted) with the popover open.
  useEffect(() => { if (count === 0) { setOpen(false); setSearch(''); } }, [count]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? users.filter((u) => u.name.toLowerCase().includes(q)) : users;
    // You first, so "assign to myself" is always at the top.
    return [...list].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : a.name.localeCompare(b.name)));
  }, [users, search, myId]);

  if (count === 0) return null;

  return (
    <div style={{ position: 'sticky', bottom: 16, zIndex: 60, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
      <div
        ref={wrapRef}
        role="toolbar"
        aria-label="Bulk actions"
        style={{
          pointerEvents: 'auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
          padding: '8px 10px 8px 16px', borderRadius: T.radius.lg, background: T.card, border: `1px solid ${T.borderStrong}`,
          boxShadow: 'var(--shadow-pop)', maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap', paddingRight: 12, borderRight: `1px solid ${T.border}` }}>
          <span style={{ fontFamily: T.mono }}>{count}</span> selected
        </span>

        {canAssign && (
          <Button size="sm" onClick={onAssignToMe} disabled={busy} icon={<UserCheck size={14} strokeWidth={1.8} />}>Assign to me</Button>
        )}
        {canAssign && (
          <Button
            size="sm"
            onClick={() => { setOpen((o) => !o); onLoadUsers(); }}
            disabled={busy}
            aria-haspopup="listbox"
            aria-expanded={open}
            icon={<UserPlus size={14} strokeWidth={1.8} />}
            style={open ? { borderColor: T.info } : undefined}
          >
            Assign to…
          </Button>
        )}
        <Button size="sm" variant="danger" onClick={onDelete} disabled={busy} title="Soft-delete the selected leads" icon={<Trash2 size={14} strokeWidth={1.8} />}>
          {busy ? 'Deleting…' : `Delete ${count}`}
        </Button>
        <IconButton label="Clear selection" onClick={onClear} disabled={busy}><X size={16} strokeWidth={1.8} /></IconButton>

        {canAssign && open && (
          <div
            role="listbox"
            aria-label="Assign to"
            style={{
              position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', width: 264,
              background: T.card, border: `1px solid ${T.borderStrong}`, borderRadius: T.radius.lg, boxShadow: 'var(--shadow-pop)', padding: 8,
              display: 'flex', flexDirection: 'column', gap: 6,
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px', border: `1px solid ${T.border}`, borderRadius: T.radius.sm, background: T.field, color: T.mute }}>
              <Search size={14} strokeWidth={1.8} aria-hidden />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users"
                aria-label="Search users"
                style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: T.text, fontSize: 13, fontFamily: 'inherit' }}
              />
            </label>
            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {usersLoading && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>Loading users…</div>}
              {!usersLoading && shown.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12.5, color: T.dim }}>{users.length === 0 ? 'No users found' : 'No match'}</div>}
              {shown.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => { onAssignTo(u.id, u.name); setOpen(false); setSearch(''); }}
                  className="km-navrow"
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px', background: 'transparent', border: 0, borderRadius: 6, color: T.text, textAlign: 'left', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
                >
                  <OwnerAvatar name={u.name} size={24} />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                  {u.id === myId && <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.08em', color: T.mute }}>YOU</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

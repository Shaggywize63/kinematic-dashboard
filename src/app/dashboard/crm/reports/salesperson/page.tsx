'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import api from '../../../../../lib/api';
import { T } from '../../../../../components/ui';
import { usePageTitle } from '../../../../../lib/pageTitle';
import { tintFor } from '../../../../../components/crm/reports/reportTints';

// Salesperson picker (web parity with the mobile apps). Management lands here
// from Reports → "Salesperson Sales" and picks a rep to open their drill-down
// (/dashboard/crm/reports/salesperson/[userId]). Unlike the Rep Leaderboard,
// this lists every salesperson the manager can see even when there are no deals
// yet — so the drill-down is always reachable. The user list is the caller's
// hierarchy subtree (scope=assignable), exactly like the mobile picker.
interface PickUser { id: string; name?: string; full_name?: string; email?: string; role?: string }

export default function SalespersonPickerPage() {
  usePageTitle('Salesperson Sales', 'Pick a salesperson to see their sales target vs achieved, contributing customers, daily & weekly progress, 6-month history and assigned leads.');
  const [users, setUsers] = useState<PickUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await api.getUsers({ scope: 'assignable', limit: '500' });
        if (cancelled) return;
        const list: PickUser[] = res?.data || res || [];
        setUsers(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const nameOf = (u: PickUser) => u.name || u.full_name || u.email || 'Salesperson';
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const sorted = [...users].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    if (!term) return sorted;
    return sorted.filter((u) => nameOf(u).toLowerCase().includes(term) || (u.email || '').toLowerCase().includes(term));
  }, [users, q]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ position: 'relative', maxWidth: 420 }}>
        <Search size={16} strokeWidth={1.6} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.mute }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search salesperson"
          style={{
            width: '100%', background: 'var(--s3)', border: `1px solid ${T.border}`, color: T.text,
            borderRadius: 10, padding: '9px 12px 9px 36px', fontSize: 14, outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <Muted>Loading salespeople…</Muted>
      ) : shown.length === 0 ? (
        <Muted>{users.length === 0 ? 'No salespeople to show.' : 'No match.'}</Muted>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {shown.map((u) => (
            <Link
              key={u.id}
              href={`/dashboard/crm/reports/salesperson/${u.id}`}
              className="km-clickable"
              style={{
                background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14,
                textDecoration: 'none', display: 'flex', gap: 10, alignItems: 'center', color: 'inherit',
              }}
            >
              <span aria-hidden className="km-lz" style={{
                width: 36, height: 36, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--s3)', color: T.dim, fontWeight: 800, fontSize: 14, ['--tint' as string]: tintFor(u.id),
              } as React.CSSProperties}>{nameOf(u).slice(0, 1).toUpperCase()}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(u)}</div>
                {(u.role || u.email) && (
                  <div style={{ fontSize: 12, color: T.dim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[u.role, u.email].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <ChevronRight size={16} strokeWidth={1.6} style={{ color: T.mute, flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div className="km-empty" data-state={typeof children === 'string' && children.startsWith('Loading') ? 'loading' : undefined} style={{ color: T.dim, fontSize: 13, padding: 8 }}>{children}</div>;
}

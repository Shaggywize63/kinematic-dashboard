'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import api, { setImpersonateUser } from '../lib/api';
import Modal from './crm/shared/Modal';

// Only the Kinematic master admin may impersonate. Everyone else never sees
// this control (the component returns null), and the backend independently
// gates the header to this same real caller — so a non-master sending it is a
// no-op.
const MASTER_EMAIL = 's@kinematicapp.com';

type SearchUser = {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  org_id?: string;
  client_id?: string;
  org_role_name?: string;
};

/**
 * Master-admin "Impersonate User" entry point. Renders a button (co-located
 * with the existing "Login as client" flow on the Clients page) that opens a
 * debounced user search. Picking a user starts impersonation (sets the
 * X-Impersonate-User-Id header state + routes org/client scope to the target)
 * and reloads so the whole app reflects that user.
 */
export default function ImpersonationControl() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMaster = (user?.email || '').toLowerCase() === MASTER_EMAIL;

  // Debounced search against the master-admin-only search endpoint. Empty
  // query clears the list without a round-trip.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = q.trim();
    if (!term) { setResults([]); setLoading(false); setErr(''); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r: any = await api.get(
          `/api/v1/auth/impersonate/search?q=${encodeURIComponent(term)}&limit=25`,
          { noCache: true } as RequestInit,
        );
        const d: SearchUser[] = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];
        setResults(d);
        setErr('');
      } catch (e: any) {
        setErr(e?.message || 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, open]);

  const start = useCallback((u: SearchUser) => {
    setStarting(u.id);
    setImpersonateUser({
      id: u.id,
      name: u.name,
      email: u.email,
      org_id: u.org_id,
      client_id: u.client_id,
    });
    // Full reload so /auth/me + every page re-resolves as the target user.
    window.location.reload();
  }, []);

  if (!isMaster) return null;

  const openModal = () => { setOpen(true); setQ(''); setResults([]); setErr(''); };

  return (
    <>
      <button
        onClick={openModal}
        title="Impersonate a user (master admin)"
        style={{
          height: 40, padding: '0 18px', border: '1px solid var(--border)',
          borderRadius: 11, background: 'var(--s3)', color: 'var(--text)',
          fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'DM Sans', sans-serif",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#EA580C'; e.currentTarget.style.color = '#EA580C'; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text)'; }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
        Impersonate User
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Impersonate User"
        subtitle="Master admin only — view the dashboard as any user."
        width={520}
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or email…"
          style={{
            width: '100%', background: 'var(--s3)', border: '1.5px solid var(--border)',
            color: 'var(--text)', borderRadius: 11, padding: '11px 14px', fontSize: 14,
            outline: 'none', fontFamily: "'DM Sans', sans-serif", marginBottom: 14,
          }}
        />

        {err && (
          <div style={{ color: 'var(--primary)', fontSize: 13, marginBottom: 12 }}>{err}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>Searching…</div>
          ) : !q.trim() ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Start typing a name or email to find a user.
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>No users match.</div>
          ) : results.map((u) => {
            const roleLabel = u.org_role_name || u.role || '';
            const busy = starting === u.id;
            return (
              <button
                key={u.id}
                onClick={() => start(u)}
                disabled={!!starting}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  width: '100%', textAlign: 'left', background: 'var(--s3)',
                  border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px',
                  cursor: starting ? 'default' : 'pointer', opacity: starting && !busy ? 0.5 : 1,
                }}
                onMouseEnter={(e) => { if (!starting) e.currentTarget.style.borderColor = '#EA580C'; }}
                onMouseLeave={(e) => { if (!starting) e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.name || 'Unnamed user'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.email || '—'}{roleLabel ? ` · ${roleLabel}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#EA580C', whiteSpace: 'nowrap' }}>
                  {busy ? 'Starting…' : 'View as →'}
                </span>
              </button>
            );
          })}
        </div>
      </Modal>
    </>
  );
}

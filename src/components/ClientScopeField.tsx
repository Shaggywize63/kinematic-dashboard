'use client';
import { useEffect, useState } from 'react';
import { useClient } from '../context/ClientContext';
import { getStoredUser } from '../lib/auth';
import api from '../lib/api';

interface ClientLite { id: string; name: string }

const PLATFORM_ROLES = new Set(['super_admin', 'main_admin', 'admin', 'platform_admin']);

/**
 * Client-scope field for super-admin / platform-admin create flows.
 *
 * - When the global picker has a client selected, this renders a green
 *   "Creating for: <client>" pill (informational, no input needed).
 * - When the picker is empty AND the user is a platform admin (no JWT
 *   client_id), this renders a required <select> so the admin must
 *   explicitly choose which tenant the new record belongs to.
 * - For client-pinned users (regular admins with JWT client_id), the
 *   field is invisible — the backend stamps client_id from JWT.
 *
 * Use the `value` and `onChange` props to bind to the form's client_id.
 * The first effect seeds `value` from the active picker on mount.
 */
export default function ClientScopeField({
  value,
  onChange,
  required = true,
}: {
  value: string;
  onChange: (clientId: string) => void;
  required?: boolean;
}) {
  const { selectedClientId } = useClient();
  const [user] = useState(() => getStoredUser());
  const [clients, setClients] = useState<ClientLite[]>([]);
  const [loaded, setLoaded] = useState(false);

  const role = (user?.role ?? '').toLowerCase();
  const isPlatformAdmin = PLATFORM_ROLES.has(role);
  const jwtPinnedClient = (user as { client_id?: string | null } | null)?.client_id ?? null;

  // Seed from picker on mount; keep in sync if picker changes.
  useEffect(() => {
    if (selectedClientId && selectedClientId !== value) {
      onChange(selectedClientId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  // For platform admins with no picker selection, fetch the client list once.
  useEffect(() => {
    if (!isPlatformAdmin || jwtPinnedClient) return;
    if (selectedClientId) return; // picker active, no need to load list
    if (loaded) return;
    (async () => {
      try {
        const res = await api.get<{ data: ClientLite[] } | ClientLite[]>('/api/v1/clients');
        const list = Array.isArray(res) ? res : (res as { data: ClientLite[] }).data ?? [];
        setClients(list);
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    })();
  }, [isPlatformAdmin, jwtPinnedClient, selectedClientId, loaded]);

  // Client-pinned (regular) users: backend stamps from JWT, render nothing.
  if (jwtPinnedClient || !isPlatformAdmin) return null;

  const activeName = selectedClientId
    ? clients.find((c) => c.id === selectedClientId)?.name ?? 'selected client'
    : '';

  // Picker active: show informational pill.
  if (selectedClientId) {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          background: 'rgba(34,197,94,0.12)',
          border: '1px solid rgba(34,197,94,0.4)',
          borderRadius: 999,
          fontSize: 12,
          color: '#22c55e',
          fontWeight: 600,
          marginBottom: 14,
        }}
      >
        <span style={{ width: 6, height: 6, background: '#22c55e', borderRadius: '50%' }} />
        Creating for: {activeName || 'selected client'}
      </div>
    );
  }

  // No picker: force the admin to pick a client for this record.
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
        Client
        {required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        style={{
          background: 'var(--s3)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '8px 12px',
          borderRadius: 8,
          fontSize: 13,
        }}
      >
        <option value="">— Select a client —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
        No client selected in the global filter — choose which tenant this record belongs to.
      </span>
    </label>
  );
}

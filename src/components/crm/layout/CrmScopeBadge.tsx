'use client';
import { useEffect, useState } from 'react';
import { useClient } from '@/context/ClientContext';
import api from '@/lib/api';
import { getStoredUser } from '@/lib/auth';

interface Client { id: string; name: string }

// Small chip rendered above CRM children showing which client (if any) the
// admin is currently scoped to. Helps avoid the "configured the wrong
// pipeline because I forgot which client was selected" mistake.
export default function CrmScopeBadge() {
  const { selectedClientId } = useClient();
  const [clients, setClients] = useState<Client[]>([]);
  const user = getStoredUser();
  const isClientLevel = !!(user as any)?.client_id;

  useEffect(() => {
    if (clients.length > 0) return;
    api.get<{ data: Client[] }>('/api/v1/misc/clients')
      .then((res: any) => setClients(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, [clients.length]);

  // For client-level users, show a locked badge with their client name.
  if (isClientLevel) {
    const myClient = clients.find((c) => c.id === (user as any).client_id);
    return (
      <div style={badgeBase('#10b981')}>
        <span>🔒</span>
        <span>Your client: <strong>{myClient?.name || 'Loading…'}</strong></span>
      </div>
    );
  }

  if (!selectedClientId) {
    return (
      <div style={badgeBase('#6366f1')}>
        <span>🌐</span>
        <span>Org-level view <span style={{ opacity: 0.7 }}>· settings here are defaults visible to all clients</span></span>
      </div>
    );
  }

  const selected = clients.find((c) => c.id === selectedClientId);
  return (
    <div style={badgeBase('#3E9EFF')}>
      <span>🔵</span>
      <span>Configuring for: <strong>{selected?.name || selectedClientId.slice(0, 8) + '…'}</strong></span>
    </div>
  );
}

function badgeBase(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
    background: `${color}15`, color, border: `1px solid ${color}40`,
    marginBottom: 12,
  };
}

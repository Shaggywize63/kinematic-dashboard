'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmTelephony } from '../../../lib/crmApi';
import { useAuth } from '../../../hooks/useAuth';
import { userHasModule } from '../../../lib/auth';
import api from '../../../lib/api';

interface Props {
  leadId: string;
  phone?: string | null;
  /** The lead's client. Decides whether IVR is on when the viewer is a platform admin (who sees every client's leads). */
  clientId?: string | null;
  size?: 'sm' | 'md';
}

// Recorded / IVR calling is a per-client switch (Client Management → IVR Calling = the `ivr_call` module). A user who belongs
// to a client is governed by that client's entitlement. A platform admin has no client of their own and bypasses the module
// list, so for them the LEAD's client decides — otherwise IVR would show on every client's leads. The original trial operator
// and leads with no client keep the old rule. The server enforces the same thing on POST /crm/telephony/click-to-call.
const TRIAL_EMAIL = 's@kinematicapp.com';
const IVR_MODULE = 'ivr_call';
const CACHE_MS = 60_000;

const clientIvr = new Map<string, { at: number; p: Promise<boolean> }>();
function clientHasIvr(clientId: string): Promise<boolean> {
  const hit = clientIvr.get(clientId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.p;
  const p = api.get(`/api/v1/clients/${clientId}/modules`, { noCache: true } as RequestInit)
    .then((r: any) => {
      const d = r?.data ?? r;
      return Array.isArray(d?.enabled_modules) && d.enabled_modules.includes(IVR_MODULE);
    })
    .catch(() => false);
  clientIvr.set(clientId, { at: Date.now(), p });
  return p;
}

/**
 * "Call (recorded)" pill. Placing the call bridges the rep and the lead on the
 * org's telephony provider with server-side recording; the recording then
 * flows into Conversation Analysis automatically. The button POSTs to the
 * backend (which resolves the numbers + provider config) and reports the
 * provider's queued/ringing status.
 *
 * Self-gating: renders nothing unless the signed-in user is the trial operator
 * and the lead has a phone number — same self-hiding contract as CallButton.
 */
export default function RecordedCallButton({ leadId, phone, clientId, size = 'sm' }: Props) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [clientOn, setClientOn] = useState<boolean | null>(null);

  const ownRule = (user?.email || '').toLowerCase() === TRIAL_EMAIL || userHasModule(user, IVR_MODULE);
  // A platform admin (no client of their own) looking at a client's lead: that client's switch decides.
  const byLeadClient = !!user && !(user as { client_id?: string | null }).client_id && !!clientId;

  useEffect(() => {
    if (!byLeadClient || !clientId) { setClientOn(null); return; }
    let alive = true;
    setClientOn(null);
    clientHasIvr(clientId).then(on => { if (alive) setClientOn(on); });
    return () => { alive = false; };
  }, [byLeadClient, clientId]);

  const enabled = byLeadClient ? clientOn === true : ownRule;
  if (!enabled || !phone) return null;

  const dim = size === 'sm' ? { pad: '4px 9px', fs: 11, ic: 12 } : { pad: '8px 14px', fs: 13, ic: 14 };

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await crmTelephony.clickToCall({ lead_id: leadId });
      toast.success(
        `Calling ${r.to} — your phone (${r.from}) will ring first, then we bridge the lead. Recording → Call Insights.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not place the recorded call';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title="Place a recorded IVR call — your phone rings first, then the lead; recording flows into Call Insights"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: dim.pad,
        background: busy ? 'var(--s3)' : '#7C3AED',
        color: '#fff',
        border: 'none',
        borderRadius: 7,
        fontSize: dim.fs,
        fontWeight: 700,
        cursor: busy ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        opacity: busy ? 0.7 : 1,
      }}
    >
      <svg width={dim.ic} height={dim.ic} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z" />
        <circle cx="18" cy="6" r="3" fill="#EF4444" />
      </svg>
      {busy ? 'Calling…' : 'IVR Call'}
    </button>
  );
}

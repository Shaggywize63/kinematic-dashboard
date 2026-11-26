'use client';
import { useState, useEffect, useCallback } from 'react';
import api from '../../../lib/api';
import { getStoredUser, canAccess } from '../../../lib/auth';
import { AlertTriangle, Check, CheckCircle2, Clock, Inbox, Lock, MapPin, Phone, RefreshCw, ShieldCheck, type LucideIcon } from 'lucide-react';
import { IconTile, InlineIcon } from '../../../components/ui/PageIcon';

// SOS Alerts — the manager/admin side of the field-safety panic button. A rep
// triggers SOS from the app (POST /sos/trigger), which captures their live
// location and notifies their supervisor + every city-manager and admin (an
// in-app notification + this feed). Here a supervisor sees each alert, opens
// the location on a map, and acknowledges / resolves it. Reads the same
// /api/v1/sos the mobile supervisors use.

const C = {
  red: '#E01E2C', green: '#00D97E', yellow: '#FFB800', blue: '#3E9EFF',
  gray: 'var(--textSec)', grayd: 'var(--textTert)', s2: 'var(--s2)', border: 'var(--border)',
};

interface SOSAlert {
  id: string;
  user_id: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  message?: string | null;
  status: 'active' | 'acknowledged' | 'resolved';
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
  users?: { name?: string; mobile?: string; employee_id?: string } | null;
  zones?: { name?: string } | null;
}

const STATUS: Record<string, { bg: string; color: string; label: string; icon: LucideIcon }> = {
  active:       { bg: 'rgba(224,30,44,0.14)',  color: '#E01E2C', label: 'ACTIVE',       icon: AlertTriangle },
  acknowledged: { bg: 'rgba(255,184,0,0.14)',  color: '#FFB800', label: 'Acknowledged', icon: Clock },
  resolved:     { bg: 'rgba(0,217,126,0.12)',  color: '#00D97E', label: 'Resolved',     icon: CheckCircle2 },
};

// Supervisors and above — mirrors the backend's requireSupervisorOrAbove on /sos.
const ALLOWED_ROLES = ['supervisor', 'city_manager', 'sub_admin', 'main_admin', 'admin', 'super_admin', 'client'];

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SOSPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [alerts, setAlerts] = useState<SOSAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const u = getStoredUser();
    setAuthorized(!!u && canAccess(String(u.role || ''), ALLOWED_ROLES));
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await api.getSOSAlerts() as { data?: SOSAlert[] } | SOSAlert[];
      const rows = ((r as { data?: SOSAlert[] }).data ?? (r as SOSAlert[])) || [];
      // Active first, then most recent.
      rows.sort((a, b) => {
        const rank = (s: string) => (s === 'active' ? 0 : s === 'acknowledged' ? 1 : 2);
        return rank(a.status) - rank(b.status) || +new Date(b.created_at) - +new Date(a.created_at);
      });
      setAlerts(rows);
    } catch {
      /* leave the last good list on a transient error */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    load();
    // SOS is time-critical — poll so a new alert appears without a manual refresh.
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [authorized, load]);

  const act = async (id: string, kind: 'acknowledge' | 'resolve') => {
    setBusyId(id);
    try {
      if (kind === 'acknowledge') await api.acknowledgeSOSAlert(id);
      else await api.resolveSOSAlert(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (authorized === null) return null;
  if (!authorized) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: C.gray }}>
        <InlineIcon icon={Lock} /> <div style={{ marginTop: 10 }}>You don&apos;t have access to SOS alerts.</div>
      </div>
    );
  }

  const activeCount = alerts.filter((a) => a.status === 'active').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <IconTile icon={ShieldCheck} size={36} iconSize={20} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>SOS Alerts</div>
            <div style={{ fontSize: 12, color: C.gray }}>Emergency alerts from field staff — location and status</div>
          </div>
        </div>
        <button onClick={load} style={btnGhost}><InlineIcon icon={RefreshCw} /> Refresh</button>
      </div>

      {activeCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(224,30,44,0.12)', border: '1px solid rgba(224,30,44,0.35)', color: C.red, fontWeight: 700 }}>
          <InlineIcon icon={AlertTriangle} /> {activeCount} active SOS alert{activeCount === 1 ? '' : 's'} need attention
        </div>
      )}

      {loading && alerts.length === 0 ? (
        <div style={{ color: C.gray, padding: 30 }}>Loading…</div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, color: C.gray }}>
          <IconTile icon={Inbox} /> <div style={{ marginTop: 10 }}>No SOS alerts. Field staff are safe.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts.map((a) => {
            const st = STATUS[a.status] ?? STATUS.active;
            const hasLoc = typeof a.latitude === 'number' && typeof a.longitude === 'number';
            const mapHref = hasLoc ? `https://www.google.com/maps?q=${a.latitude},${a.longitude}` : null;
            return (
              <div key={a.id} style={{
                border: `1px solid ${a.status === 'active' ? 'rgba(224,30,44,0.45)' : C.border}`,
                borderRadius: 12, padding: 14, background: C.s2,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <InlineIcon icon={st.icon} /> {a.users?.name || 'Field staff'}
                      {a.users?.employee_id && <span style={{ color: C.grayd, fontWeight: 500, fontSize: 12 }}>· {a.users.employee_id}</span>}
                    </div>
                    <div style={{ color: C.gray, fontSize: 12, marginTop: 3 }}>
                      {timeAgo(a.created_at)}{a.zones?.name ? ` · ${a.zones.name}` : ''}
                    </div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>

                {a.message && <div style={{ fontSize: 13, color: 'var(--text)' }}>&ldquo;{a.message}&rdquo;</div>}

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
                  {a.users?.mobile && (
                    <a href={`tel:${a.users.mobile}`} style={{ color: C.blue, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <InlineIcon icon={Phone} /> {a.users.mobile}
                    </a>
                  )}
                  {mapHref ? (
                    <a href={mapHref} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <InlineIcon icon={MapPin} /> Open location{a.address ? ` · ${a.address}` : ''}
                    </a>
                  ) : (
                    <span style={{ color: C.grayd, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <InlineIcon icon={MapPin} /> No location captured
                    </span>
                  )}
                </div>

                {a.status !== 'resolved' && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {a.status === 'active' && (
                      <button onClick={() => act(a.id, 'acknowledge')} disabled={busyId === a.id} style={btnGhost}>
                        <InlineIcon icon={Clock} /> Acknowledge
                      </button>
                    )}
                    <button onClick={() => act(a.id, 'resolve')} disabled={busyId === a.id} style={btnPrimary}>
                      <InlineIcon icon={Check} /> Mark resolved
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)',
};
const btnGhost: React.CSSProperties = { ...btnBase, background: 'var(--s3)', color: 'var(--text)' };
const btnPrimary: React.CSSProperties = { ...btnBase, background: 'var(--primary)', color: '#fff', borderColor: 'transparent' };

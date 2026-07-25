'use client';
/**
 * AI Assistant Access — super-admin control for the MCP connector entitlement
 * (paid add-on). Lists every org's on/off state and toggles it via
 * PUT /api/v1/admin/mcp-connector/:orgId. Backed by the central
 * mcp_connector_orgs table; the OAuth authorize step + the MCP tool layer read
 * the same flag, so a change here immediately governs who can connect Claude /
 * ChatGPT to their CRM.
 */
import { useEffect, useState, useCallback } from 'react';
import api from '../../../../lib/api';
import { getStoredUser } from '../../../../lib/auth';

type ConnectorOrg = {
  org_id: string;
  project_key: string | null;
  label: string | null;
  enabled: boolean;
  updated_at?: string | null;
};

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 };
const input: React.CSSProperties = { width: '100%', background: 'var(--s4)', border: `1px solid ${C.border}`, padding: '9px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 };

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} title={on ? 'Enabled — click to disable' : 'Disabled — click to enable'}
      style={{ width: 46, height: 26, borderRadius: 14, background: on ? C.green : 'var(--s4)', border: `1px solid ${on ? C.green : C.border}`, position: 'relative', cursor: disabled ? 'wait' : 'pointer', flex: '0 0 auto', opacity: disabled ? 0.6 : 1, transition: 'background .16s' }}>
      <span style={{ position: 'absolute', top: 2, left: 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(20px)' : 'none', transition: 'transform .16s', boxShadow: '0 1px 2px rgba(0,0,0,.35)' }} />
    </button>
  );
}

export default function AiAssistantAccessPage() {
  const [rows, setRows] = useState<ConnectorOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ org_id: '', label: '', project_key: 'default', enabled: true });
  const [saving, setSaving] = useState(false);

  const user = typeof window !== 'undefined' ? getStoredUser() : null;
  const isSuperAdmin = (user?.role || '').toLowerCase() === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r: any = await api.get('/api/v1/admin/mcp-connector');
      setRows(((r?.data ?? r) || []) as ConnectorOrg[]);
      setError('');
    } catch (e: any) { setError(e.message || 'Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isSuperAdmin) load(); else setLoading(false); }, [isSuperAdmin, load]);

  const setEnabled = async (org: ConnectorOrg, enabled: boolean) => {
    setBusy((b) => ({ ...b, [org.org_id]: true }));
    setRows((rs) => rs.map((r) => r.org_id === org.org_id ? { ...r, enabled } : r)); // optimistic
    try {
      await api.put(`/api/v1/admin/mcp-connector/${org.org_id}`, { enabled });
    } catch (e: any) {
      setRows((rs) => rs.map((r) => r.org_id === org.org_id ? { ...r, enabled: !enabled } : r));
      alert(e.message || 'Update failed');
    } finally { setBusy((b) => ({ ...b, [org.org_id]: false })); }
  };

  const addOrg = async () => {
    const orgId = addForm.org_id.trim();
    if (!UUID_RE.test(orgId)) { alert('Enter a valid organisation id (UUID).'); return; }
    if (!addForm.label.trim()) { alert('Give the organisation a label.'); return; }
    setSaving(true);
    try {
      await api.put(`/api/v1/admin/mcp-connector/${orgId}`, {
        enabled: addForm.enabled,
        label: addForm.label.trim(),
        project_key: addForm.project_key.trim() || null,
      });
      setShowAdd(false);
      setAddForm({ org_id: '', label: '', project_key: 'default', enabled: true });
      load();
    } catch (e: any) { alert(e.message || 'Add failed'); }
    finally { setSaving(false); }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ ...card, maxWidth: 560, margin: '40px auto', textAlign: 'center', color: C.gray, fontSize: 14 }}>
        Only platform super-admins can manage AI assistant access.
      </div>
    );
  }

  const enabledCount = rows.filter((r) => r.enabled).length;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 40, maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <a href="/dashboard/settings" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Settings</a>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '6px 0 4px' }}>AI Assistant Access</h1>
          <p style={{ color: C.gray, fontSize: 13, margin: 0, maxWidth: 620 }}>
            Control which organisations can connect Claude / ChatGPT to their CRM (the MCP connector). It&apos;s a paid add-on — <b style={{ color: C.white }}>off by default</b>. Enabling an org lets its users sign in from the assistant and act on their own CRM, scoped to their role.
          </p>
        </div>
        <button onClick={() => setShowAdd((v) => !v)} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {showAdd ? 'Close' : '+ Add organisation'}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Add an organisation</div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 16 }}>Enter the organisation&apos;s id (UUID). New tenants usually live in their own Supabase project; use their project key (e.g. <code>default</code> or the tenant&apos;s key).</div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <span style={label}>Label</span>
              <input value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })} placeholder="e.g. Acme Corp" style={input} />
            </div>
            <div>
              <span style={label}>Project key</span>
              <input value={addForm.project_key} onChange={(e) => setAddForm({ ...addForm, project_key: e.target.value })} placeholder="default" style={input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Organisation id (UUID)</span>
              <input value={addForm.org_id} onChange={(e) => setAddForm({ ...addForm, org_id: e.target.value })} placeholder="00000000-0000-0000-0000-000000000000" style={{ ...input, fontFamily: 'monospace' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.gray, cursor: 'pointer' }}>
              <input type="checkbox" checked={addForm.enabled} onChange={(e) => setAddForm({ ...addForm, enabled: e.target.checked })} style={{ accentColor: C.green }} />
              Enable immediately
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowAdd(false)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.gray, padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={addOrg} disabled={saving} style={{ background: C.red, border: 'none', color: '#fff', padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving…' : 'Add'}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.s3 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Organisations</span>
          <span style={{ fontSize: 12, color: C.gray }}>{enabledCount} of {rows.length} enabled</span>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.gray, fontSize: 13 }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: 24, color: C.red, fontSize: 13 }}>{error}</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: C.gray, fontSize: 13 }}>No organisations yet. Add one above.</div>
        ) : rows.map((r, i) => (
          <div key={r.org_id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.white }}>
                {r.label || 'Untitled org'}
                {r.enabled
                  ? <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: C.green, background: 'rgba(0,217,126,0.12)', border: '1px solid rgba(0,217,126,0.3)', padding: '2px 7px', borderRadius: 6 }}>ENABLED</span>
                  : <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, color: C.grayd, background: 'var(--s4)', border: `1px solid ${C.border}`, padding: '2px 7px', borderRadius: 6 }}>OFF</span>}
              </div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 3, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.org_id}{r.project_key ? ` · ${r.project_key}` : ''}
              </div>
            </div>
            <Toggle on={r.enabled} disabled={!!busy[r.org_id]} onClick={() => setEnabled(r, !r.enabled)} />
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, color: C.gray, marginTop: 14, lineHeight: 1.6 }}>
        Changes take effect within a minute. A disabled org can no longer obtain a token <i>and</i> any tool call from an existing token is refused — so turning it off revokes access immediately.
      </div>
    </div>
  );
}

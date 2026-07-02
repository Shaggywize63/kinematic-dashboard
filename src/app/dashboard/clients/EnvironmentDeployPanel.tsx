'use client';
import { useCallback, useEffect, useState } from 'react';
import api, { setActingAs } from '../../../lib/api';
import { getStoredProjectKey, DEFAULT_PROJECT } from '../../../lib/projects';

type Pair = {
  project: string;
  staging_org_id: string;
  staging_name: string;
  prod_org_id: string | null;
  prod_name: string | null;
};

// Super-admin "deploy staging config to production" panel. Lists every
// staging->prod org pair across all projects and lets you Preview (dry-run) or
// Promote the config (settings / field overrides). Never touches transactional
// data — that's enforced by the backend's promote_org_config().
export default function EnvironmentDeployPanel() {
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r: any = await api.get('/api/v1/environments', { noCache: true } as RequestInit);
      const d = Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : [];
      setPairs(d);
    } catch { /* keep panel quiet if unavailable */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (p: Pair, dryRun: boolean) => {
    const key = p.staging_org_id;
    if (!dryRun && !window.confirm(`Promote ${p.staging_name} config to ${p.prod_name}? This updates production settings/field-overrides (no records are copied).`)) return;
    setBusy(key); setMsg(m => ({ ...m, [key]: '' }));
    try {
      const r: any = await api.post('/api/v1/environments/promote', {
        project: p.project, staging_org_id: p.staging_org_id, dry_run: dryRun,
      });
      const d = r?.data ?? r;
      const res = d?.result ?? {};
      const line = dryRun
        ? `Preview: ${res.crm_settings_rows ?? 0} settings + ${res.org_settings_rows ?? 0} org-settings would sync.`
        : `Deployed ✓ — ${res.crm_settings_rows ?? 0} settings + ${res.org_settings_rows ?? 0} org-settings promoted.`;
      setMsg(m => ({ ...m, [key]: line }));
    } catch (e: any) {
      setMsg(m => ({ ...m, [key]: e?.message || 'Failed' }));
    } finally { setBusy(null); }
  };

  // Enter a staging org to edit its config (super-admin impersonation via
  // X-Org-Id). Only same-project staging orgs are reachable with the current
  // session's token; cross-project ones need that project's session first.
  const currentProject = (getStoredProjectKey() || DEFAULT_PROJECT);
  const enterStaging = (p: Pair) => {
    if (!window.confirm(`Enter "${p.staging_name}" to edit its config? You'll act on the staging org until you Exit.`)) return;
    const su = {
      token: localStorage.getItem('kinematic_token'),
      refresh: localStorage.getItem('kinematic_refresh_token'),
      user: localStorage.getItem('kinematic_user'),
      project: localStorage.getItem('kinematic_supabase_project'),
      client: localStorage.getItem('kinematic_selected_client'),
    };
    localStorage.setItem('kinematic_su_session', JSON.stringify(su));
    localStorage.removeItem('kinematic_selected_client');
    setActingAs({ org_id: p.staging_org_id, name: p.staging_name });
    window.location.href = '/dashboard/crm/leads';
  };

  if (!pairs.length) return null;

  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Staging → Production Deploy</div>
      <div style={{ fontSize: 12, color: 'var(--textTert)', marginBottom: 14 }}>
        Promote configuration (pipelines/fields/products live at staging creation; this deploys settings &amp; field-overrides). No leads/deals/contacts are ever copied.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pairs.map(p => (
          <div key={p.staging_org_id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {p.staging_name} <span style={{ color: 'var(--textTert)' }}>→</span> {p.prod_name || '(no target)'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--textTert)' }}>project: {p.project}{msg[p.staging_org_id] ? ` · ${msg[p.staging_org_id]}` : ''}</div>
            </div>
            {p.project === currentProject && (
              <button onClick={() => enterStaging(p)} disabled={busy === p.staging_org_id}
                style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Enter
              </button>
            )}
            <button onClick={() => run(p, true)} disabled={busy === p.staging_org_id}
              style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              Preview
            </button>
            <button onClick={() => run(p, false)} disabled={busy === p.staging_org_id}
              style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: '#3E9EFF', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: busy === p.staging_org_id ? 0.6 : 1 }}>
              {busy === p.staging_org_id ? 'Working…' : 'Deploy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

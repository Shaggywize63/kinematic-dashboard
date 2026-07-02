'use client';
import { useCallback, useEffect, useState } from 'react';
import api from '../../lib/api';

type Change = { tbl: string; src_id: string; nkey: string; label: string; status: string };

const TBL_LABELS: Record<string, string> = {
  org_settings: 'Settings', crm_settings: 'Field overrides & settings', crm_pipelines: 'Pipelines',
  crm_deal_stages: 'Deal stages', crm_lead_sources: 'Lead sources', crm_product_categories: 'Product categories',
  crm_products: 'Products', crm_activity_types: 'Activity types', crm_activity_subjects: 'Activity subjects',
  crm_custom_field_defs: 'Custom fields', org_roles: 'Roles', people_directory_types: 'People directory types',
  crm_email_templates: 'Email templates', crm_verified_senders: 'Verified senders',
};

// Checklist modal: shows what differs between the staging org and its prod org,
// lets the super-admin tick the changes to deploy, and promotes only those.
export default function StagingDeployModal({ project, stagingOrgId, name, onClose }:
  { project: string; stagingOrgId: string; name?: string; onClose: () => void }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setMsg('');
    try {
      const r: any = await api.get(`/api/v1/environments/diff?project=${encodeURIComponent(project)}&staging_org_id=${encodeURIComponent(stagingOrgId)}`, { noCache: true } as RequestInit);
      const d: Change[] = Array.isArray(r) ? r : (r?.data ?? []);
      setChanges(d);
      const s: Record<string, boolean> = {}; d.forEach(c => { s[c.src_id] = true; }); setSel(s);
    } catch (e: any) { setMsg(e?.message || 'Failed to load changes'); setChanges([]); }
  }, [project, stagingOrgId]);

  useEffect(() => { load(); }, [load]);

  const deploy = async () => {
    const items = (changes || []).filter(c => sel[c.src_id]).map(c => ({ t: c.tbl, id: c.src_id }));
    if (!items.length) { setMsg('Select at least one change to deploy.'); return; }
    setBusy(true); setMsg('Deploying…');
    try {
      const r: any = await api.post('/api/v1/environments/promote-selective', { project, staging_org_id: stagingOrgId, items });
      const applied = (r?.data ?? r)?.result?.applied ?? items.length;
      setMsg(`Deployed ✓ — ${applied} change(s) promoted to production.`);
      await load();
    } catch (e: any) { setMsg(`Deploy failed: ${e?.message || 'error'}`); }
    finally { setBusy(false); }
  };

  const groups = (changes || []).reduce<Record<string, Change[]>>((acc, c) => { (acc[c.tbl] ||= []).push(c); return acc; }, {});
  const selCount = (changes || []).filter(c => sel[c.src_id]).length;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Deploy {name || 'staging'} → Production</div>
          <div style={{ fontSize: 12, color: 'var(--textTert)', marginTop: 4 }}>Tick the changes to promote. Only config is moved — never leads/deals/contacts.</div>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {changes === null ? (
            <div style={{ color: 'var(--textTert)', fontSize: 13, padding: 20, textAlign: 'center' }}>Loading changes…</div>
          ) : changes.length === 0 ? (
            <div style={{ color: 'var(--textTert)', fontSize: 13, padding: 20, textAlign: 'center' }}>No differences — staging matches production.</div>
          ) : Object.entries(groups).map(([tbl, items]) => (
            <div key={tbl} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--textSec)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>{TBL_LABELS[tbl] || tbl}</div>
              {items.map(c => (
                <label key={c.src_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!sel[c.src_id]} onChange={e => setSel(s => ({ ...s, [c.src_id]: e.target.checked }))} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{c.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, color: c.status === 'new' ? '#00D97E' : '#F5A623', background: c.status === 'new' ? 'rgba(0,217,126,0.12)' : 'rgba(245,166,35,0.12)' }}>{c.status}</span>
                </label>
              ))}
            </div>
          ))}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, fontSize: 12, color: msg.startsWith('Deploy failed') ? '#E01E2C' : 'var(--textTert)' }}>{msg || `${selCount} selected`}</div>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Close</button>
          <button onClick={deploy} disabled={busy || !selCount} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: '#B45309', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', opacity: (busy || !selCount) ? 0.6 : 1 }}>
            {busy ? 'Deploying…' : `Deploy ${selCount} to Production`}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmSettings } from '../../../../lib/crmApi';
import api from '../../../../lib/api';
import { rolesApi, type OrgRole } from '../../../../lib/rolesApi';
import type { BusinessType } from '../../../../types/crm';

const SECTIONS = [
  { href: '/dashboard/crm/settings/users', title: 'Team Members', desc: 'Create CRM users scoped to the active client. Synced with global Settings → Users.', icon: '👥' },
  { href: '/dashboard/crm/settings/locations', title: 'States, Cities & Blocks', desc: 'Master list of states, cities, districts + the per-district block catalogue that powers the lead form picker.', icon: '🌍' },
  { href: '/dashboard/crm/settings/pipelines', title: 'Pipelines', desc: 'Configure deal pipelines.', icon: '🔀' },
  { href: '/dashboard/crm/settings/stages', title: 'Stages', desc: 'Manage stages within pipelines.', icon: '📊' },
  { href: '/dashboard/crm/settings/sources', title: 'Lead Sources', desc: 'Where your leads come from.', icon: '🎯' },
  { href: '/dashboard/crm/settings/activity-types', title: 'Activity Types', desc: 'Configure the call/meeting/email/task types reps can log.', icon: '📞' },
  { href: '/dashboard/crm/settings/activity-subjects', title: 'Activity Subjects', desc: 'Curate the subject dropdown reps pick from on activity compose. Meeting first by position.', icon: '📝' },
  { href: '/dashboard/crm/settings/integrations', title: 'Integrations', desc: 'Connect web forms, Facebook, Google Ads, Zoho. Cross-channel dedup baked in.', icon: '🔌' },
  { href: '/dashboard/crm/settings/automations', title: 'Automations', desc: 'Trigger-based workflows: assign, notify, create tasks on lead/deal events.', icon: '⚡' },
  { href: '/dashboard/crm/settings/assignment-rules', title: 'Assignment Rules', desc: 'Auto-assign new leads.', icon: '🎲' },
  { href: '/dashboard/crm/settings/territories', title: 'Territories', desc: 'Sales territory hierarchy.', icon: '🗺️' },
  { href: '/dashboard/crm/settings/targets', title: 'Targets', desc: 'Set daily lead targets per field executive — or the same for everyone.', icon: '🥅' },
  { href: '/dashboard/crm/settings/scoring', title: 'Scoring Model', desc: 'Tune the AI lead scoring weights.', icon: '⭐' },
  { href: '/dashboard/crm/settings/custom-fields', title: 'Custom Fields', desc: 'Add fields per entity + override built-in field labels and required flags.', icon: '🧩' },
];

const BUSINESS_OPTIONS: Array<{ value: BusinessType; label: string; desc: string }> = [
  { value: 'b2b', label: 'B2B', desc: 'Selling to companies. Forms emphasise company, title, industry, revenue.' },
  { value: 'b2c', label: 'B2C', desc: 'Selling to consumers. Forms emphasise demographics, address, channel preference, loyalty.' },
  { value: 'both', label: 'Mixed', desc: 'Show both. Each lead/contact can be tagged B2B or B2C individually.' },
];

// Two-state theme — 'system' was removed because OS auto-switching was
// the root cause of "random theme flips" reported by admins. The DOM
// attribute + native color-scheme are kept in lockstep so scrollbars
// and form controls match the page.
type ThemeChoice = 'dark' | 'light';

function applyTheme(t: ThemeChoice) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
  document.documentElement.style.colorScheme = t;
}

export default function SettingsIndex() {
  // `null` until the first fetch resolves so the active-card highlight
  // doesn't flicker from a default ('both') to the saved value ('b2c').
  // Once loaded the value is sticky — the saveType handler reads the
  // backend response and uses it as the authoritative state.
  const [businessType, setBusinessType] = useState<BusinessType | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  // Theme is mirrored from the org-level Settings page (same localStorage key
  // + same data-theme attribute) so CRM-only clients (e.g. Tata Tiscon) who
  // can't reach /dashboard/settings still get a way to switch themes.
  // Default is 'system' so the dashboard follows the OS for first-time users.
  // Default 'dark' so the theme doesn't follow OS-level auto-switching
  // (admins reported the "system" setting flipping the dashboard with
  // every macOS Auto / Windows Night Light transition). Once they pick a
  // mode the choice persists across refreshes via the boot script in
  // app/layout.tsx — no OS listener needed any more.
  const [theme, setTheme] = useState<ThemeChoice>('dark');
  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem('kinematic-theme')) as ThemeChoice | null;
    const next: ThemeChoice = saved === 'light' ? 'light' : 'dark';
    setTheme(next);
    applyTheme(next);
  }, []);
  const toggleTheme = (t: ThemeChoice) => {
    setTheme(t);
    applyTheme(t);
    if (typeof window !== 'undefined') localStorage.setItem('kinematic-theme', t);
    // Mirror to a 1-year cookie so server-rendered <html data-theme>
    // matches on hard refresh — kills the FOUC where the page started
    // dark and then "randomly" switched to light a beat later.
    try {
      document.cookie = `kinematic-theme=${t}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    } catch { /* ignore */ }
  };
  const [defaultRoleId, setDefaultRoleId] = useState<string>('');
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [savingRole, setSavingRole] = useState(false);
  // The Hierarchy card is gated by a client-level feature flag — fetch
  // it once and only render the card when the active client has opted
  // in (Tata Tiscon won't, so they never see it).
  const [hierarchyEnabled, setHierarchyEnabled] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<any>('/api/v1/crm/hierarchy/enabled');
        setHierarchyEnabled((r?.data?.enabled ?? r?.enabled) === true);
      } catch { /* probe failure → leave hidden */ }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.allSettled([crmSettings.get(), rolesApi.list()]);
        if (s.status === 'fulfilled') {
          if (s.value.data?.business_type) setBusinessType(s.value.data.business_type);
          const cfg = (s.value.data?.config as Record<string, unknown>) || {};
          setConfig(cfg);
          if (typeof cfg.default_role_id === 'string') setDefaultRoleId(cfg.default_role_id);
        }
        if (r.status === 'fulfilled') setRoles(((r.value as any) ?? []) as OrgRole[]);
      } catch { /* defaults are fine */ }
      finally { setLoaded(true); }
    })();
  }, []);

  // Persist the picked default role into crm_settings.config (per-client when
  // a client picker is active) so role hierarchy can render a ★ badge and
  // future user-creation flows can pre-fill the role.
  const saveDefaultRole = async (roleId: string) => {
    setSavingRole(true);
    setDefaultRoleId(roleId);
    try {
      const nextConfig = { ...config, default_role_id: roleId || null };
      await crmSettings.update({ config: nextConfig });
      setConfig(nextConfig);
      toast.success(roleId ? 'Default role updated' : 'Default role cleared');
    } catch (e: any) {
      toast.error(e.message || 'Update failed');
    } finally { setSavingRole(false); }
  };

  const saveType = async (next: BusinessType) => {
    setSaving(true);
    const previous = businessType;
    setBusinessType(next); // optimistic
    try {
      // Read the returned row and use its business_type as the authoritative
      // value — sticky across refreshes regardless of any unrelated field
      // the backend may normalise.
      const r = await crmSettings.update({ business_type: next });
      const saved = (r?.data?.business_type as BusinessType | undefined) ?? next;
      setBusinessType(saved);
      toast.success(`Business type set to ${saved.toUpperCase()}`);
    } catch (e: any) {
      setBusinessType(previous ?? null); // rollback on error so the UI matches reality
      toast.error(e.message || 'Update failed');
    }
    finally { setSaving(false); }
  };

  const seed = async () => {
    try { await crmSettings.seedDefaults(); toast.success('Defaults seeded'); }
    catch (e: any) { toast.error(e.message || 'Seeding failed'); }
  };

  const themeBtn = (value: ThemeChoice, label: string, icon: string) => (
    <button onClick={() => toggleTheme(value)} style={{ padding: '8px 16px', borderRadius: 8, background: theme === value ? 'var(--s4)' : 'transparent', border: 'none', color: theme === value ? 'var(--text)' : 'var(--text-dim)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span>{icon}</span> {label}
    </button>
  );

  return (
    <div>
      {/* Theme — same toggle as the org Settings page, surfaced here so
          CRM-only clients (Tata Tiscon etc.) without the `settings` module
          can still switch themes. Uses the same localStorage key + DOM
          attribute, so changing it in either place is global. */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Appearance</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Choose Light, Dark, or follow the operating system.</div>
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {themeBtn('light',  'Light',  '☀️')}
          {themeBtn('dark',   'Dark',   '🌙')}
          {/* System mode removed — followed OS-level light/dark auto-switching
              which admins called "random theme changes". Stick to an explicit
              dark/light choice that survives every refresh. */}
        </div>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Business Type</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>
          Tells the CRM whether you sell to companies (B2B), consumers (B2C), or both. Affects which fields are shown by default on lead and contact forms.
        </p>
        {!loaded ? (
          <div style={{ height: 84, display: 'flex', alignItems: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Loading current selection…</div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {BUSINESS_OPTIONS.map((o) => {
            const active = businessType === o.value;
            return (
              <button
                key={o.value}
                type="button"
                disabled={!loaded || saving}
                onClick={() => saveType(o.value)}
                style={{
                  textAlign: 'left', padding: 14, borderRadius: 10, cursor: 'pointer',
                  background: active ? 'var(--primary)' : 'var(--s3)',
                  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text)',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{o.label}</div>
                <div style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.85)' : 'var(--text-dim)', lineHeight: 1.4 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>
        )}
      </div>

      {/* Weight-based pricing — moved to per-product. Deals reference a
          product's `price` and `weight_kg` (configured under Products) to
          auto-compute amount from a volume entered in kilograms. There's
          no longer a single org-wide rate. */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Weight-based Pricing</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 8px', maxWidth: 600 }}>
          Pricing is configured <strong style={{ color: 'var(--text)' }}>per product</strong> — each product carries its own price and weight per unit. On a deal, pick the product and enter the volume in kilograms; amount auto-calculates.
        </p>
        <Link href="/dashboard/crm/products" style={{ display: 'inline-block', background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Manage Products →</Link>
      </div>

      {/* Default Role Hierarchy — what role new users get unless overridden.
          Saved into crm_settings.config.default_role_id, scoped per client by
          the existing X-Client-Id auto-attach. The Role Hierarchy page reads
          this and shows a ★ Default badge on the selected role. */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Default Role Hierarchy</div>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0, maxWidth: 560 }}>
              The org-role new users (or invitees) are placed under unless an explicit role is chosen.
              When a client is active in the global picker this saves per client; otherwise it&rsquo;s the org-level default visible to admins.
            </p>
          </div>
          <Link href="/dashboard/settings/roles" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 12, textDecoration: 'none' }}>Manage hierarchy →</Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <select
            value={defaultRoleId}
            disabled={!loaded || savingRole}
            onChange={(e) => saveDefaultRole(e.target.value)}
            style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 240 }}
          >
            <option value="">— No default —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          {savingRole && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Saving…</span>}
          {!savingRole && defaultRoleId && (
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>★ marked as default in Role Hierarchy</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={seed} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Seed Default Pipeline + Stages + Sources</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textDecoration: 'none', display: 'flex', gap: 12 }}>
            <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>{s.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.desc}</div>
            </div>
          </Link>
        ))}
        {hierarchyEnabled && (
          <Link
            href="/dashboard/crm/settings/hierarchy"
            style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textDecoration: 'none', display: 'flex', gap: 12 }}
          >
            <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }} aria-hidden>🏢</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Org Hierarchy</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                Define management levels and assign users + supervisors. Replaces role-based scoping for opted-in clients.
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

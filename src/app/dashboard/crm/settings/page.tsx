'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Blocks, Boxes, ChevronRight, Database, GitBranch, Layers, ListChecks, MapPinned, Moon, Network, Phone, Plug, Shuffle,
  Sparkles, Sun, Target, Users, Workflow, Zap,
} from 'lucide-react';
import { crmSettings } from '../../../../lib/crmApi';
import api from '../../../../lib/api';
import NewBadge from '../../../../components/shared/NewBadge';
import { rolesApi, type OrgRole } from '../../../../lib/rolesApi';
import type { BusinessType } from '../../../../types/crm';
import { useAuth } from '../../../../hooks/useAuth';
import { isTataTiscanActive } from '../../../../lib/clientFeatures';
import { Button, Card, Eyebrow, Field, PageHeader, Segmented, Select, T, useIsCompact } from '../../../../components/ui';
import { usePageTitle } from '../../../../lib/pageTitle';

const ICON_PROPS = { size: 18, strokeWidth: 1.6 } as const;

const SECTIONS = [
  { href: '/dashboard/crm/settings/users', title: 'Team Members', desc: 'Create CRM users scoped to the active client. Synced with global Settings → Users.', icon: <Users {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/locations', title: 'States, Cities & Blocks', desc: 'Master list of states, cities, districts + the per-district block catalogue that powers the lead form picker.', icon: <MapPinned {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/pipelines', title: 'Pipelines', desc: 'Configure deal pipelines.', icon: <GitBranch {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/stages', title: 'Stages', desc: 'Manage stages within pipelines.', icon: <Layers {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/sources', title: 'Lead Sources', desc: 'Where your leads come from.', icon: <Target {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/activity-types', title: 'Activity Types', desc: 'Configure the call/meeting/email/task types reps can log.', icon: <Phone {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/activity-subjects', title: 'Activity Subjects', desc: 'Curate the subject dropdown reps pick from on activity compose. Meeting first by position.', icon: <ListChecks {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/integrations', title: 'Integrations', desc: 'Connect web forms, Facebook, Google Ads, Zoho. Cross-channel dedup baked in.', icon: <Plug {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/automations', title: 'Automations', desc: 'Rules (instant when→then) and Sequences (timed multi-step drips) in one place, fired on lead/deal events.', icon: <Zap {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/assignment-rules', title: 'Assignment Rules', desc: 'Auto-assign new leads.', icon: <Shuffle {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/territories', title: 'Territories', desc: 'Sales territory hierarchy.', icon: <Network {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/targets', title: 'Targets', desc: 'Set daily lead targets per field executive — or the same for everyone.', icon: <Target {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/scoring', title: 'Scoring Model', desc: 'Tune the AI lead scoring weights.', icon: <Sparkles {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/custom-fields', title: 'Custom Fields', desc: 'Add fields per entity + override built-in field labels and required flags.', icon: <Blocks {...ICON_PROPS} /> },
  { href: '/dashboard/crm/settings/custom-objects', title: 'Custom Objects', desc: 'Define your own record types (Property, Vehicle, Policy…) with their own fields, beyond leads/contacts/deals/accounts.', icon: <Boxes {...ICON_PROPS} /> },
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
  usePageTitle('Settings');
  const narrow = useIsCompact(900);
  // Weight/tonnage is a steel-dealer (Tata / BMW) concept only — the
  // Weight-based Pricing card is hidden for Kinematic and every other tenant.
  const { user } = useAuth();
  const steel = isTataTiscanActive(user as any);
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

  const cardTitle: React.CSSProperties = { fontFamily: T.heading, fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', color: T.text };
  const cardHint: React.CSSProperties = { fontSize: 13, color: T.dim, marginTop: 2, lineHeight: 1.5 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Settings"
        description="Workspace-wide CRM configuration. Changes here apply to every user on this client."
        compact={narrow}
        actions={<Button onClick={seed} icon={<Database size={16} strokeWidth={1.6} />} title="Seed the default pipeline, stages and lead sources">Seed defaults</Button>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 12, alignItems: 'stretch' }}>
        {/* Theme — same toggle as the org Settings page, surfaced here so
            CRM-only clients (Tata Tiscon etc.) without the `settings` module
            can still switch themes. Uses the same localStorage key + DOM
            attribute, so changing it in either place is global. */}
        <Card padding={20} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={cardTitle}>Appearance</div>
            <div style={cardHint}>Choose Light or Dark. The choice sticks across refreshes.</div>
          </div>
          <Segmented
            value={theme}
            onChange={toggleTheme}
            options={[
              { value: 'light', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sun size={14} strokeWidth={1.8} /> Light</span> },
              { value: 'dark', label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Moon size={14} strokeWidth={1.8} /> Dark</span> },
            ]}
          />
          {/* System mode removed — followed OS-level light/dark auto-switching
              which admins called "random theme changes". Stick to an explicit
              dark/light choice that survives every refresh. */}
        </Card>

        {/* Default Role Hierarchy — what role new users get unless overridden.
            Saved into crm_settings.config.default_role_id, scoped per client by
            the existing X-Client-Id auto-attach. The Role Hierarchy page reads
            this and shows a ★ Default badge on the selected role. */}
        <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={cardTitle}>Default role</div>
              <div style={cardHint}>
                The org-role new users (or invitees) are placed under unless an explicit role is chosen.
                Saves per client when one is active in the global picker; otherwise it&rsquo;s the org-level default.
              </div>
            </div>
            <Button size="sm" href="/dashboard/settings/roles" icon={<ChevronRight size={14} strokeWidth={1.8} />}>Manage hierarchy</Button>
          </div>
          <Field hint={savingRole ? 'Saving…' : (defaultRoleId ? 'Marked as default in Role Hierarchy.' : undefined)}>
            <Select
              value={defaultRoleId}
              disabled={!loaded || savingRole}
              onChange={(e) => saveDefaultRole(e.target.value)}
              style={{ maxWidth: 320 }}
            >
              <option value="">— No default —</option>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </Card>
      </div>

      <Card padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={cardTitle}>Business type</div>
          <div style={cardHint}>
            Tells the CRM whether you sell to companies (B2B), consumers (B2C), or both. Affects which fields are shown by default on lead and contact forms.
          </div>
        </div>
        {!loaded ? (
          <div style={{ height: 84, display: 'flex', alignItems: 'center', color: T.dim, fontSize: 13 }}>Loading current selection…</div>
        ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {BUSINESS_OPTIONS.map((o) => {
            const active = businessType === o.value;
            return (
              <button
                key={o.value}
                type="button"
                disabled={!loaded || saving}
                aria-pressed={active}
                onClick={() => saveType(o.value)}
                style={{
                  textAlign: 'left', padding: 14, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit',
                  background: active ? T.redWash : 'var(--s3)',
                  border: `1px solid ${active ? T.red : T.border}`,
                  color: T.text, transition: 'background .12s ease, border-color .12s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{o.label}</span>
                  <span aria-hidden style={{ width: 14, height: 14, borderRadius: 999, border: `1px solid ${active ? T.red : T.borderStrong}`, background: active ? T.red : 'transparent', boxShadow: active ? 'inset 0 0 0 3px var(--card)' : 'none', flexShrink: 0 }} />
                </div>
                <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.45 }}>{o.desc}</div>
              </button>
            );
          })}
        </div>
        )}
      </Card>

      {/* Weight-based pricing — per-product (price + weight_kg → amount from a
          volume in kg). Steel-dealer (Tata / BMW) only; hidden for Kinematic
          and every other tenant, which don't price by weight. */}
      {steel && (
        <Card padding={20} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={cardTitle}>Weight-based pricing</div>
            <div style={{ ...cardHint, maxWidth: 640 }}>
              Pricing is configured per product — each product carries its own price and weight per unit. On a deal, pick the product and enter the volume in kilograms; amount auto-calculates.
            </div>
          </div>
          <Button href="/dashboard/crm/products" icon={<ChevronRight size={16} strokeWidth={1.6} />}>Manage products</Button>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Eyebrow>Configuration</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {SECTIONS.map((s) => (
            <SettingCard key={s.href} href={s.href} title={s.title} desc={s.desc} icon={s.icon} />
          ))}
          {hierarchyEnabled && (
            <SettingCard
              href="/dashboard/crm/settings/hierarchy"
              title="Org Hierarchy"
              desc="Define management levels and assign users + supervisors. Replaces role-based scoping for opted-in clients."
              icon={<Workflow {...ICON_PROPS} />}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SettingCard({ href, title, desc, icon }: { href: string; title: string; desc: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="km-clickable"
      style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, textDecoration: 'none', display: 'flex', gap: 12, alignItems: 'flex-start', color: 'inherit' }}
    >
      <span aria-hidden style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--s3)', color: T.dim, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
          <NewBadge href={href} />
        </div>
        <div style={{ fontSize: 12.5, color: T.dim, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <ChevronRight size={16} strokeWidth={1.6} style={{ color: T.mute, flexShrink: 0, marginTop: 2 }} />
    </Link>
  );
}

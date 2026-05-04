'use client';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmSettings } from '../../../../lib/crmApi';

const SECTIONS = [
  { href: '/dashboard/crm/settings/pipelines', title: 'Pipelines', desc: 'Configure deal pipelines.' },
  { href: '/dashboard/crm/settings/stages', title: 'Stages', desc: 'Manage stages within pipelines.' },
  { href: '/dashboard/crm/settings/sources', title: 'Lead Sources', desc: 'Where your leads come from.' },
  { href: '/dashboard/crm/settings/assignment-rules', title: 'Assignment Rules', desc: 'Auto-assign new leads.' },
  { href: '/dashboard/crm/settings/territories', title: 'Territories', desc: 'Sales territory hierarchy.' },
  { href: '/dashboard/crm/settings/scoring', title: 'Scoring Model', desc: 'Tune the AI lead scoring weights.' },
  { href: '/dashboard/crm/settings/custom-fields', title: 'Custom Fields', desc: 'Add fields per entity.' },
  { href: '/dashboard/crm/settings/automations', title: 'Automations', desc: 'Triggers and actions.' },
  { href: '/dashboard/crm/settings/integrations', title: 'Integrations', desc: 'Email, calendar, webhooks.' },
];

export default function SettingsIndex() {
  const seed = async () => {
    try { await crmSettings.seedDefaults(); toast.success('Defaults seeded'); }
    catch (e: any) { toast.error(e.message || 'Seeding failed'); }
  };
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={seed} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Seed Default Pipeline + Stages + Sources</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

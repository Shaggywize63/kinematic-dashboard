'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { crmSettings } from '../../../../lib/crmApi';
import type { BusinessType } from '../../../../types/crm';

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

const BUSINESS_OPTIONS: Array<{ value: BusinessType; label: string; desc: string }> = [
  { value: 'b2b', label: 'B2B', desc: 'Selling to companies. Forms emphasise company, title, industry, revenue.' },
  { value: 'b2c', label: 'B2C', desc: 'Selling to consumers. Forms emphasise demographics, address, channel preference, loyalty.' },
  { value: 'both', label: 'Mixed', desc: 'Show both. Each lead/contact can be tagged B2B or B2C individually.' },
];

export default function SettingsIndex() {
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmSettings.get();
        if (r.data?.business_type) setBusinessType(r.data.business_type);
      } catch { /* defaults are fine */ }
      finally { setLoaded(true); }
    })();
  }, []);

  const saveType = async (next: BusinessType) => {
    setSaving(true);
    setBusinessType(next);
    try {
      await crmSettings.update({ business_type: next });
      toast.success(`Business type set to ${next.toUpperCase()}`);
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
    finally { setSaving(false); }
  };

  const seed = async () => {
    try { await crmSettings.seedDefaults(); toast.success('Defaults seeded'); }
    catch (e: any) { toast.error(e.message || 'Seeding failed'); }
  };

  return (
    <div>
      {/* Business type selector */}
      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>Business Type</div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' }}>
          Tells the CRM whether you sell to companies (B2B), consumers (B2C), or both. Affects which fields are shown by default on lead and contact forms.
        </p>
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
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 10,
                  cursor: 'pointer',
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
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={seed} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>Seed Default Pipeline + Stages + Sources</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, textDecoration: 'none' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

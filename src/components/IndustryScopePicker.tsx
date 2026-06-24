'use client';
import { useIndustryScope } from '../context/IndustryScopeContext';
import { INDUSTRY_OPTIONS } from '../lib/demo/industries';
import { getStoredUser } from '../lib/auth';
import { DEMO_USER_EMAIL } from '../lib/demoMocks';

/**
 * Demo-only industry vertical switcher, rendered in the global header next to
 * the client filter. Flipping it switches the whole demo (leads, pipelines,
 * custom fields, forms, field-force data) to the chosen vertical — see
 * IndustryScopeContext + matchDemoMock.
 *
 * It is shown ONLY for the demo account (demo@kinematic.com). For every other
 * login the data is real, so an industry fixture switch is meaningless and the
 * picker returns null. Switching reloads the page so cached responses and any
 * page not subscribed to the scope refetch against the new fixture set.
 */

const STYLE = {
  wrap: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    background: 'var(--s3)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '4px 4px 4px 10px', fontSize: 12,
    color: 'var(--text-dim)',
  } as React.CSSProperties,
  label: {
    fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 0.4,
    textTransform: 'uppercase' as const, fontSize: 10,
  } as React.CSSProperties,
  select: {
    background: 'transparent', border: 'none', color: 'var(--text)',
    padding: '4px 6px', fontSize: 13, fontWeight: 600, outline: 'none',
    cursor: 'pointer', minWidth: 120,
  } as React.CSSProperties,
};

export default function IndustryScopePicker() {
  const { selectedIndustry, setSelectedIndustry } = useIndustryScope();

  // Demo-only control.
  const email = (getStoredUser() as { email?: string } | null)?.email?.toLowerCase();
  if (email !== DEMO_USER_EMAIL) return null;

  const onChange = (value: string) => {
    setSelectedIndustry(value);
    // The demo is driven by client-side fixtures resolved at call time and by
    // server-side fixtures keyed on the X-Demo-Industry header. A full reload
    // is the simplest way to drop every cached response and re-render every
    // page (CRM + field-force) against the freshly selected vertical.
    if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <div style={STYLE.wrap} title="Switch the demo to an industry vertical">
      <span style={STYLE.label}>🏭 Industry</span>
      <select
        value={selectedIndustry}
        onChange={(e) => onChange(e.target.value)}
        style={STYLE.select}
      >
        {INDUSTRY_OPTIONS.map((o) => (
          <option key={o.value || 'generic'} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

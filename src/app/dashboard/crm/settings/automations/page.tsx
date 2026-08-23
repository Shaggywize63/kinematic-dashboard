'use client';
/**
 * Automations hub — one section for both automation engines.
 *
 * Phase A of merging the old "Automations" and "Cadences & Drips" pages: a
 * single entry point with two tabs.
 *   - Rules      → the visual When → Only-if → Then canvas (crm_automations):
 *                  instant, single-action reactions to an event.
 *   - Sequences  → the cadence/drip builder (crm_flows): ordered multi-step
 *                  follow-ups with waits/branches, parked until due.
 * Both engines already share one trigger dispatcher + the same action
 * executors on the backend, so this is purely a unified front door. (Phase B
 * will fold Wait/Branch nodes into the canvas so one builder authors both.)
 */
import { useEffect, useState } from 'react';
import AutomationCanvas from '../../../../../components/crm/automations/AutomationCanvas';
import CadencesManager from '../../../../../components/crm/CadencesManager';

type Tab = 'rules' | 'sequences';
const TABS: Array<{ id: Tab; icon: string; label: string; blurb: string }> = [
  { id: 'rules', icon: '⚡', label: 'Rules',
    blurb: 'Instant reactions — when an event happens, do one thing right away (assign an owner, notify, create a task).' },
  { id: 'sequences', icon: '🪜', label: 'Sequences',
    blurb: 'Timed multi-step drips — a follow-up cadence with waits between touches, fired on a lead/deal trigger.' },
];

export default function AutomationsPage() {
  const [tab, setTab] = useState<Tab>('rules');

  // Deep-link support: ?tab=rules|sequences. Read on mount and synced on
  // switch via history.replaceState — avoids useSearchParams (which would need
  // a Suspense boundary around this page).
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'sequences' || t === 'rules') setTab(t);
    } catch { /* ignore */ }
  }, []);
  const switchTab = (t: Tab) => {
    setTab(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.toString());
    } catch { /* ignore */ }
  };

  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Automations</h1>
        <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: '4px 0 0', maxWidth: 680 }}>
          One place to automate your CRM. <strong style={{ color: 'var(--text)' }}>Rules</strong> react instantly to an
          event; <strong style={{ color: 'var(--text)' }}>Sequences</strong> run a timed multi-step follow-up. Both fire
          on the same lead/deal triggers.
        </p>
      </div>

      {/* Tab switcher */}
      <div role="tablist" aria-label="Automation type"
        style={{ display: 'inline-flex', gap: 4, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, alignSelf: 'flex-start' }}>
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              onClick={() => switchTab(t.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 9,
                border: 'none', cursor: on ? 'default' : 'pointer', fontSize: 13.5, fontWeight: 700,
                background: on ? 'var(--primary)' : 'transparent',
                color: on ? '#fff' : 'var(--text-dim)',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              <span style={{ fontSize: 15 }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: -6 }}>{active.blurb}</div>

      {/* Active tab body */}
      <div>{tab === 'rules' ? <AutomationCanvas /> : <CadencesManager />}</div>
    </div>
  );
}

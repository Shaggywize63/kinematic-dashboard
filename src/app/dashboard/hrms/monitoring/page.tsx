'use client';
// Monitoring ledger: every kind of employee monitoring the company uses or is considering, what is collected and why,
// who can see it and for how long. Built so the company can show employees exactly what is collected.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { Badge, Card, HrmsPage, Loading, Stat, StatGrid, TabBar, T, useIsCompact, useTabParam } from '../../../../components/hrms/ui';
import { consentCoverage, monitoringCounts, retentionFlags } from '../../../../lib/hrms/control/monitoring';
import { controlStore } from '../../../../lib/hrms/control/store';
import type { ControlState } from '../../../../lib/hrms/control/types';
import MonLedger from '../../../../components/hrms/control/MonLedger';
import { ConsentTab, LogTab, NoticeTab, RetentionTab } from '../../../../components/hrms/control/MonTabs';
import { Conf, Muted, Row } from '../../../../components/hrms/control/parts';

const TABS = ['ledger', 'notice', 'consent', 'retention', 'log'] as const;

export default function MonitoringPage() {
  const db = useHrmsDb();
  const state = controlStore.use();
  if (!db || !state) return <Loading />;
  return <Body db={db} state={state} />;
}

const PRINCIPLES = [
  { t: 'Collect the least that does the job', d: 'If a smaller measure answers the question, use that one.' },
  { t: 'Tell people', d: 'Everything on this ledger goes into a notice employees can read.' },
  { t: 'Keep it for a short time', d: 'Each practice has a retention period, and a check for anything longer than the window.' },
  { t: 'Never use it to rank people', d: 'Monitoring data is evidence for a question, not a score. No page here ranks or rates a person.' },
];

function Body({ db, state }: { db: HrmsDb; state: ControlState }) {
  const narrow = useIsCompact(900);
  const [tab, setTab] = useTabParam(TABS, 'ledger');
  const rows = state.monitoring.rows;
  const counts = useMemo(() => monitoringCounts(rows), [rows]);
  const flags = useMemo(() => retentionFlags(db, rows).length, [db, rows]);
  const missing = useMemo(() => rows.filter((r) => r.status !== 'blocked').reduce((n, r) => n + consentCoverage(db, r).missing.length, 0), [db, rows]);

  return (
    <HrmsPage
      eyebrow="HRMS · Control"
      title="Monitoring ledger"
      description="A register of every kind of employee monitoring the company uses or is considering, so it can show people exactly what is collected and why."
      actions={<Row gap={8}><Conf level="indicative" /><Badge tone="warn">Advisor to confirm legal bases</Badge></Row>}
    >
      <StatGrid min={150}>
        <div data-testid="count-on"><Stat label="On" value={counts.on} tone="ok" hint="Collecting now" /></div>
        <div data-testid="count-off"><Stat label="Off" value={counts.off} hint="Not in use" /></div>
        <div data-testid="count-blocked"><Stat label="Blocked" value={counts.blocked} tone={counts.blocked ? 'red' : undefined} hint="Not offered" /></div>
        <div data-testid="count-considering"><Stat label="Considering" value={counts.considering} tone={counts.considering ? 'warn' : undefined} hint="Not yet decided" /></div>
      </StatGrid>

      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.heading }} data-testid="principles">Four principles</div>
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(4, 1fr)', gap: 12 }}>
          {PRINCIPLES.map((p, i) => (
            <div key={p.t} style={{ background: T.raised, borderRadius: T.radius.md, padding: '10px 12px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{i + 1}. {p.t}</div>
              <div style={{ fontSize: 13, color: T.dim, marginTop: 3, lineHeight: 1.5 }}>{p.d}</div>
            </div>
          ))}
        </div>
        <Muted style={{ marginTop: 10 }}>The legal basis on each row is a sample statement tagged for review. Retention windows and consent counts are tools for the conversation with your advisor, not legal conclusions.</Muted>
      </Card>

      <TabBar value={tab} onChange={setTab} tabs={[
        { key: 'ledger', label: 'Ledger', count: rows.length },
        { key: 'notice', label: 'What an employee sees' },
        { key: 'consent', label: 'Consent coverage', count: missing },
        { key: 'retention', label: 'Retention check', count: flags },
        { key: 'log', label: 'Change log', count: state.monitoring.log.length },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'ledger' && <MonLedger db={db} rows={rows} />}
        {tab === 'notice' && <NoticeTab rows={rows} />}
        {tab === 'consent' && <ConsentTab db={db} state={state} />}
        {tab === 'retention' && <RetentionTab db={db} rows={rows} />}
        {tab === 'log' && <LogTab log={state.monitoring.log} />}
      </div>
    </HrmsPage>
  );
}

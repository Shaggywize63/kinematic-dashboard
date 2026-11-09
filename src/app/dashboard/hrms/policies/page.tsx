'use client';
// Policies & POSH: the policy library with versions and publishing, acknowledgement tracking, a version diff, and POSH.

import { useEffect, useMemo, useState } from 'react';
import { HrmsPage, Loading, Stat, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { policyStore } from '../../../../lib/hrms/assist/store';
import { ackRows, ackSummary, icChecks, poshCounts } from '../../../../lib/hrms/assist/policies';
import { Tiles, useQueryParam } from '../../../../components/hrms/assist/shared';
import PolicyLibrary from '../../../../components/hrms/assist/PolicyLibrary';
import AckTab from '../../../../components/hrms/assist/AckTab';
import DiffTab from '../../../../components/hrms/assist/DiffView';
import PoshTab from '../../../../components/hrms/assist/PoshTab';

const TABS = ['library', 'acknowledgements', 'diff', 'posh'] as const;
type Tab = (typeof TABS)[number];

export default function PoliciesPage() {
  const db = useHrmsDb();
  const state = policyStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'library');
  const [selected, setSelected] = useState('pol_leave');
  const [compare, setCompare] = useState<{ policyId: string; from: string; to: string; n: number } | null>(null);
  const wanted = useQueryParam('policy');
  useEffect(() => { if (wanted && state?.policies.some((p) => p.id === wanted)) setSelected(wanted); }, [wanted, state]);

  const stats = useMemo(() => {
    if (!db || !state) return null;
    let pending = 0; let acked = 0; let needed = 0;
    for (const p of state.policies) {
      const s = ackSummary(ackRows(db, p, state.acks, state.reminders, PREVIEW_TODAY));
      if (s.rate == null) continue;
      pending += s.pending; acked += s.acknowledged; needed += s.pending + s.acknowledged;
    }
    const checks = icChecks(db, state.posh.committee, PREVIEW_TODAY);
    return { pending, rate: needed ? (acked / needed) * 100 : 0, icOk: checks.every((c) => c.ok), openCases: poshCounts(state.posh.cases).byStatus.filter((s) => s.key !== 'closed').reduce((n, s) => n + s.count, 0) };
  }, [db, state]);

  if (!db || !state || !stats) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Policies"
      title="Policies & POSH"
      description="Keep policies in one place, publish new versions, see who has acknowledged them, and keep the POSH committee and register in order."
    >
      <Tiles min={160}>
        <Stat label="Policies" value={<span data-testid="stat-policies">{state.policies.length}</span>} hint="Each with a version history" />
        <Stat label="Acknowledgements pending" value={<span data-testid="stat-pending">{stats.pending}</span>} tone={stats.pending ? 'warn' : 'ok'} hint="Across all policies that need one" />
        <Stat label="Acknowledged overall" value={`${Math.round(stats.rate)}%`} tone={stats.rate >= 90 ? 'ok' : stats.rate >= 60 ? 'warn' : 'red'} hint="Current versions only" />
        <Stat label="POSH committee" value={stats.icOk ? 'In order' : 'Needs a look'} tone={stats.icOk ? 'ok' : 'warn'} hint={`${stats.openCases} open case${stats.openCases === 1 ? '' : 's'} in the register`} />
      </Tiles>
      <TabBar<Tab>
        value={tab} onChange={setTab}
        tabs={[{ key: 'library', label: 'Library', count: state.policies.length }, { key: 'acknowledgements', label: 'Acknowledgements', count: stats.pending }, { key: 'diff', label: 'Compare versions' }, { key: 'posh', label: 'POSH' }]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'library' && (
          <PolicyLibrary db={db} state={state} selectedId={selected} onSelect={setSelected}
            onCompare={(policyId, from, to) => { setCompare({ policyId, from, to, n: (compare?.n ?? 0) + 1 }); setTab('diff'); }}
            onGoAck={(id) => { setSelected(id); setTab('acknowledgements'); }} />
        )}
        {tab === 'acknowledgements' && <AckTab db={db} state={state} policyId={selected} onPolicy={setSelected} />}
        {tab === 'diff' && <DiffTab key={compare?.n ?? 0} policies={state.policies} initial={compare ?? undefined} />}
        {tab === 'posh' && <PoshTab db={db} state={state} />}
      </div>
    </HrmsPage>
  );
}

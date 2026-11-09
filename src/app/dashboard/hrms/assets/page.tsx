'use client';
// Assets: what the company has issued to people, who holds it, and what must come back when someone leaves.
// Preview on sample data kept in this browser. Recovery figures are advisory and are never posted to payroll.

import { useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { inr } from '../../../../lib/hrms/format';
import { Badge, HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { agedAssets, bookValue, warrantyExpiring } from '../../../../lib/hrms/rewards/engines';
import { rewardsStore } from '../../../../lib/hrms/rewards/store';
import { ActivityLog } from '../../../../components/hrms/rewards/common';
import InventoryTab from '../../../../components/hrms/rewards/assets/InventoryTab';
import PeopleTab from '../../../../components/hrms/rewards/assets/PeopleTab';
import ExitsTab, { exitPeople } from '../../../../components/hrms/rewards/assets/ExitsTab';
import InsightsTab from '../../../../components/hrms/rewards/assets/InsightsTab';

const TABS = ['inventory', 'people', 'exits', 'insights'] as const;
type Tab = (typeof TABS)[number];

export default function AssetsPage() {
  const db = useHrmsDb();
  const st = rewardsStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'inventory');
  const figures = useMemo(() => {
    if (!st) return null;
    const live = st.assets.items.filter((a) => a.status !== 'retired' && a.status !== 'lost');
    return {
      total: live.length,
      issued: live.filter((a) => a.status === 'issued').length,
      stock: live.filter((a) => a.status === 'in_stock').length,
      repair: live.filter((a) => a.status === 'in_repair').length,
      warranty: warrantyExpiring(st.assets.items, PREVIEW_TODAY, 60).length,
      aged: agedAssets(st.assets.items, PREVIEW_TODAY, 4).length,
      book: live.reduce((s, a) => s + bookValue(a, PREVIEW_TODAY), 0),
    };
  }, [st]);
  const leavers = useMemo(() => (db && st ? exitPeople(db, st).filter((p) => p.outstanding.length).length : 0), [db, st]);
  if (!db || !st || !figures) return <Loading />;

  return (
    <HrmsPage
      eyebrow="HRMS · Rewards"
      title="Assets"
      description="Laptops, phones, SIM cards, vehicles, ID cards, uniforms and tools: who has what, and what must come back. Sample data, kept in this browser."
      actions={<Badge tone="warn">Preview</Badge>}
    >
      <div data-testid="assets-stats">
        <StatGrid min={165}>
          <Stat label="Usable assets" value={figures.total} hint={`${figures.repair} in repair`} />
          <Stat label="Issued" value={figures.issued} tone="ok" />
          <Stat label="In stock" value={figures.stock} tone="info" />
          <Stat label="Warranty ends in 60 days" value={figures.warranty} tone={figures.warranty ? 'warn' : undefined} />
          <Stat label="Older than 4 years" value={figures.aged} tone={figures.aged ? 'warn' : undefined} />
          <Stat label="Book value today" value={inr(figures.book)} hint="Straight line, stated life" />
        </StatGrid>
      </div>
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'inventory', label: 'Inventory', count: st.assets.items.length },
        { key: 'people', label: 'People' },
        { key: 'exits', label: 'Leavers', count: leavers },
        { key: 'insights', label: 'Insights' },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'inventory' && <InventoryTab db={db} st={st} />}
        {tab === 'people' && <PeopleTab db={db} st={st} />}
        {tab === 'exits' && <ExitsTab db={db} st={st} />}
        {tab === 'insights' && <InsightsTab db={db} st={st} />}
      </div>
      <ActivityLog log={st.log} area="assets" />
    </HrmsPage>
  );
}

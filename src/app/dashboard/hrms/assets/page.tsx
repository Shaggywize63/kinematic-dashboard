'use client';
// Assets: what the company has issued to people, who holds it, and what must come back when someone leaves.
// Sample mode runs on data kept in this browser. In live mode (phase 6) the register is read from, and saved to, the server
// (GET /assets/bootstrap + the command endpoints); benefits and compensation stay local. The page degrades on its own when
// the assets tables are not set up yet (503), while those two local Rewards pages keep working.

import { useEffect, useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { inr } from '../../../../lib/hrms/format';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { agedAssets, bookValue, warrantyExpiring } from '../../../../lib/hrms/rewards/engines';
import { rewardsStore } from '../../../../lib/hrms/rewards/store';
import { ensureAssetsLoaded, reloadAssets, useLiveAssetsStatus } from '../../../../lib/hrms/rewards/live/assetsSource';
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
  const core = useLiveStatus();
  const assets = useLiveAssetsStatus();
  const live = assets.source === 'live';
  const [tab, setTab] = useTabParam<Tab>(TABS, 'inventory');

  // Load the register when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureAssetsLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  const figures = useMemo(() => {
    if (!st) return null;
    const liveItems = st.assets.items.filter((a) => a.status !== 'retired' && a.status !== 'lost');
    return {
      total: liveItems.length,
      issued: liveItems.filter((a) => a.status === 'issued').length,
      stock: liveItems.filter((a) => a.status === 'in_stock').length,
      repair: liveItems.filter((a) => a.status === 'in_repair').length,
      warranty: warrantyExpiring(st.assets.items, PREVIEW_TODAY, 60).length,
      aged: agedAssets(st.assets.items, PREVIEW_TODAY, 4).length,
      book: liveItems.reduce((s, a) => s + bookValue(a, PREVIEW_TODAY), 0),
    };
  }, [st]);
  const leavers = useMemo(() => (db && st ? exitPeople(db, st).filter((p) => p.outstanding.length).length : 0), [db, st]);
  if (!db || !st || !figures) return <Loading />;

  const description = live
    ? 'Laptops, phones, SIM cards, vehicles, ID cards, uniforms and tools: who has what, and what must come back. Saved on the server.'
    : 'Laptops, phones, SIM cards, vehicles, ID cards, uniforms and tools: who has what, and what must come back. Sample data, kept in this browser.';

  const loading = live && (assets.phase === 'idle' || assets.phase === 'loading');
  const notReady = live && assets.phase === 'not_ready';
  const errored = live && assets.phase === 'error';
  const ready = !live || assets.phase === 'ok';

  return (
    <HrmsPage
      eyebrow="HRMS · Rewards"
      title="Assets"
      description={description}
      actions={<Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>}
    >
      {loading && <div data-testid="assets-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="assets-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold the live asset register have not been created on the server, so there is nothing to load or save yet. Benefits, compensation and the sample data still work."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadAssets()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="assets-error">
          <Card>
            <EmptyState title="Could not load the asset register"
              description={<span data-testid="assets-error-message">{assets.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadAssets()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {ready && (
        <>
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
          {/* The activity log is the local store's. In live mode asset changes are on the server (and in each asset's history),
              so it is shown only in sample mode, where it records what was changed in this browser. */}
          {!live && <ActivityLog log={st.log} area="assets" />}
        </>
      )}
    </HrmsPage>
  );
}

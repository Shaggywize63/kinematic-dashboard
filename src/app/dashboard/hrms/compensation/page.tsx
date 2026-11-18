'use client';
// Compensation: pay bands and compa-ratio, the annual merit cycle, and pay transparency. Sample mode runs on data kept in this
// browser. In live mode (phase 8) the pay bands, the performance bands and replies, and the merit cycle are read from, and
// saved to, the server (GET /compensation/bootstrap + the band / perf / cycle endpoints). Every market figure is a sample.
// Nothing here corrects anyone's pay on its own. The page degrades on its own when the compensation tables are not set up yet (503).

import { useEffect, useMemo, useState } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { addStandardBands, rewardsStore } from '../../../../lib/hrms/rewards/store';
import { ensureCompensationLoaded, reloadCompensation, useLiveCompensationStatus } from '../../../../lib/hrms/rewards/live/compensationSource';
import { bandPeople } from '../../../../lib/hrms/rewards/engines';
import { report } from '../../../../components/hrms/rewards/common';
import BandsTab from '../../../../components/hrms/rewards/compensation/BandsTab';
import MeritTab from '../../../../components/hrms/rewards/compensation/MeritTab';
import TransparencyTab from '../../../../components/hrms/rewards/compensation/TransparencyTab';

const TABS = ['bands', 'merit', 'transparency'] as const;
type Tab = (typeof TABS)[number];

export default function CompensationPage() {
  const db = useHrmsDb();
  const st = rewardsStore.use();
  const core = useLiveStatus();
  const comp = useLiveCompensationStatus();
  const live = comp.source === 'live';
  const [tab, setTab] = useTabParam<Tab>(TABS, 'bands');
  const [busy, setBusy] = useState(false);

  // Load the compensation data when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureCompensationLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  const count = useMemo(() => (db && st ? bandPeople(db, st.comp.bands).length : 0), [db, st]);
  if (!db || !st) return <Loading />;
  const issued = Object.keys(st.comp.cycle.applied).length;

  const description = live
    ? 'Pay bands, compa-ratio, the annual merit cycle and what employees can see about pay. Saved on the server. Market figures are samples.'
    : 'Pay bands, compa-ratio, the annual merit cycle and what employees can see about pay. Sample data, kept in this browser. Market figures are samples.';

  const loading = live && (comp.phase === 'idle' || comp.phase === 'loading');
  const notReady = live && comp.phase === 'not_ready';
  const errored = live && comp.phase === 'error';
  const ready = !live || comp.phase === 'ok';
  const empty = ready && st.comp.bands.length === 0;

  async function addStandard() {
    if (busy) return;
    setBusy(true);
    const r = await addStandardBands();
    setBusy(false);
    report(r, 'The standard pay bands were added on the server.');
  }

  return (
    <HrmsPage
      eyebrow="HRMS · Rewards"
      title="Compensation"
      description={description}
      actions={<Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>}
    >
      {loading && <div data-testid="compensation-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="compensation-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold the live pay bands and merit cycle have not been created on the server, so there is nothing to load or save yet. The sample data still works."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadCompensation()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="compensation-error">
          <Card>
            <EmptyState title="Could not load the compensation data"
              description={<span data-testid="compensation-error-message">{comp.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadCompensation()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {empty && (
        <div data-testid="compensation-empty">
          <Card>
            <EmptyState title="No pay bands yet"
              description="Pay bands are saved on the server, one per grade. Start with the standard set (grades W1, E1, E2, E3, M1 and M3, with sample ranges and sample market figures), then edit each band to your own ranges. People show up under a band when their designation carries the same grade."
              action={<Button variant="primary" data-testid="add-standard-pay-bands" disabled={busy} style={{ minHeight: 40 }} onClick={addStandard}>{busy ? 'Adding…' : 'Add the standard pay bands'}</Button>} />
          </Card>
        </div>
      )}

      {ready && !empty && (
        <>
          <TabBar<Tab> value={tab} onChange={setTab} tabs={[
            { key: 'bands', label: 'Pay bands', count },
            { key: 'merit', label: 'Merit cycle', count: issued || undefined },
            { key: 'transparency', label: 'Pay transparency' },
          ]} />
          <div role="tabpanel" aria-label={tab} data-testid="compensation-ready">
            {tab === 'bands' && <BandsTab db={db} st={st} />}
            {tab === 'merit' && <MeritTab db={db} st={st} />}
            {tab === 'transparency' && <TransparencyTab db={db} st={st} />}
          </div>
        </>
      )}
    </HrmsPage>
  );
}

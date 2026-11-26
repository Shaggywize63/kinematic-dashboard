'use client';
// Engagement: team-level pulse surveys, trends, recognition and exit interviews. Never individual scoring.
// Results need at least 5 responses; comments carry no identifying detail.
// Sample mode runs on data kept in this browser. In live mode (phase 11) the pulses, anonymous responses, recognition and
// exit interviews are read from, and saved to, the server (GET /engagement/bootstrap + the pulse / kudos / exit endpoints);
// responses stay anonymous there too. The page degrades on its own when the engagement tables are not set up yet (503).

import { useEffect, useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { ensureEngagementLoaded, reloadEngagement, useLiveEngagementStatus } from '../../../../lib/hrms/people/live/engagementSource';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { VizStyle } from '../../../../components/hrms/people/shared';
import { buildEngagementView } from '../../../../components/hrms/people/engagement/view';
import Principles from '../../../../components/hrms/people/engagement/Principles';
import PulseTab from '../../../../components/hrms/people/engagement/PulseTab';
import TrendsTab from '../../../../components/hrms/people/engagement/TrendsTab';
import RecognitionTab from '../../../../components/hrms/people/engagement/RecognitionTab';
import ExitTab from '../../../../components/hrms/people/engagement/ExitTab';

const TABS = ['pulse', 'trends', 'recognition', 'exit'] as const;

export default function EngagementPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const core = useLiveStatus();
  const eStatus = useLiveEngagementStatus();
  const live = eStatus.source === 'live';
  const [tab, setTab] = useTabParam(TABS, 'pulse');
  const st = state?.engagement;
  const ready = !live || eStatus.phase === 'ok';
  const ev = useMemo(() => (db && st && ready ? buildEngagementView(db, st) : null), [db, st, ready]);

  // Load the engagement data when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureEngagementLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  if (!db || !st) return <Loading />;
  const loading = live && (eStatus.phase === 'idle' || eStatus.phase === 'loading');
  const notReady = live && eStatus.phase === 'not_ready';
  const errored = live && eStatus.phase === 'error';

  const description = live
    ? 'How teams are doing, and thanks given in public. Team level only, never a score for a person. Saved on the server.'
    : 'How teams are doing, and thanks given in public. Team level only, never a score for a person. Sample data, kept in this browser.';

  return (
    <HrmsPage
      eyebrow="HRMS · Workplace"
      title="Engagement"
      description={description}
      actions={<Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>}
    >
      <VizStyle />
      <Principles />

      {loading && <div data-testid="engagement-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="engagement-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold live engagement have not been created on the server, so there is nothing to load or save yet. The sample data still works."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadEngagement()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="engagement-error">
          <Card>
            <EmptyState title="Could not load engagement"
              description={<span data-testid="engagement-error-message">{eStatus.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadEngagement()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {ready && ev && (
        <>
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'pulse', label: 'Pulse surveys', count: st.surveys.length },
              { key: 'trends', label: 'Trends' },
              { key: 'recognition', label: 'Recognition', count: st.kudos.length },
              { key: 'exit', label: 'Exit interviews', count: st.exitInterviews.length },
            ]}
          />
          <div role="tabpanel" aria-label={tab} className="px-viz" data-testid="engagement-ready">
            {tab === 'pulse' && <PulseTab st={st} ev={ev} />}
            {tab === 'trends' && <TrendsTab st={st} ev={ev} />}
            {tab === 'recognition' && <RecognitionTab db={db} st={st} ev={ev} />}
            {tab === 'exit' && <ExitTab db={db} st={st} ev={ev} />}
          </div>
        </>
      )}
    </HrmsPage>
  );
}

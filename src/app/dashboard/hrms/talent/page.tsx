'use client';
// Talent and succession: a skills matrix with gaps against the role, critical roles with a named bench, and a 9-box
// that is a conversation tool. No sentiment scoring, no predictions about any person.
// Sample mode runs on data kept in this browser. In live mode (phase 12) the skills, requirements, ratings, critical roles
// with their bench and the 9-box placements are read from, and saved to, the server (GET /talent/bootstrap + the rating /
// successor / placement endpoints; the server seeds a populated demo on first load). The page degrades on its own when the
// talent tables are not set up yet (503).

import { useEffect, useMemo } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { setSource, useLiveStatus } from '../../../../lib/hrms/live/store';
import { peopleStore } from '../../../../lib/hrms/people/store';
import { ensureTalentLoaded, reloadTalent, useLiveTalentStatus } from '../../../../lib/hrms/people/live/talentSource';
import { Badge, Button, Card, EmptyState, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { buildTalentView } from '../../../../components/hrms/people/talent/view';
import SkillsTab from '../../../../components/hrms/people/talent/SkillsTab';
import SuccessionTab from '../../../../components/hrms/people/talent/SuccessionTab';
import NineBoxTab from '../../../../components/hrms/people/talent/NineBoxTab';

const TABS = ['skills', 'succession', 'ninebox'] as const;

export default function TalentPage() {
  const db = useHrmsDb();
  const state = peopleStore.use();
  const core = useLiveStatus();
  const tStatus = useLiveTalentStatus();
  const live = tStatus.source === 'live';
  const [tab, setTab] = useTabParam(TABS, 'skills');
  const tv = useMemo(() => (db ? buildTalentView(db) : null), [db]);
  const st = state?.talent;
  const ready = !live || tStatus.phase === 'ok';

  // Load the talent data when live and the core data is ready; the module also reloads it on a refresh.
  useEffect(() => { ensureTalentLoaded(); }, [core.source, core.phase, core.inputsVersion]);

  if (!db || !state || !tv || !st) return <Loading />;
  const loading = live && (tStatus.phase === 'idle' || tStatus.phase === 'loading');
  const notReady = live && tStatus.phase === 'not_ready';
  const errored = live && tStatus.phase === 'error';

  const description = live
    ? 'Who has which skills, who could step into critical roles, and a 9-box for talent conversations. Saved on the server.'
    : 'Who has which skills, who could step into critical roles, and a 9-box for talent conversations. Sample data, kept in this browser.';

  return (
    <HrmsPage
      eyebrow="HRMS · Talent"
      title="Talent & succession"
      description={description}
      actions={<Badge tone={live ? 'info' : 'warn'}>{live ? 'Live' : 'Preview'}</Badge>}
    >
      {loading && <div data-testid="talent-loading"><Loading /></div>}

      {notReady && (
        <div data-testid="talent-not-ready">
          <Card>
            <EmptyState title="HRMS storage is not set up yet on the server"
              description="The tables that hold live talent have not been created on the server, so there is nothing to load or save yet. The sample data still works."
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadTalent()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {errored && (
        <div data-testid="talent-error">
          <Card>
            <EmptyState title="Could not load talent"
              description={<span data-testid="talent-error-message">{tStatus.message || 'Could not reach the server.'} Nothing was changed. Try again, or use the sample data meanwhile.</span>}
              action={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button variant="primary" onClick={() => reloadTalent()} style={{ minHeight: 40 }}>Try again</Button>
                <Button onClick={() => setSource('sample')} style={{ minHeight: 40 }}>Use sample data</Button>
              </div>} />
          </Card>
        </div>
      )}

      {ready && (
        <>
          <TabBar
            value={tab}
            onChange={setTab}
            tabs={[
              { key: 'skills', label: 'Skills matrix', count: st.skills.length },
              { key: 'succession', label: 'Succession', count: st.roles.length },
              { key: 'ninebox', label: '9-box' },
            ]}
          />
          <div role="tabpanel" aria-label={tab} data-testid="talent-ready">
            {tab === 'skills' && <SkillsTab db={db} st={st} tv={tv} />}
            {tab === 'succession' && <SuccessionTab st={st} tv={tv} />}
            {tab === 'ninebox' && <NineBoxTab db={db} st={st} tv={tv} />}
          </div>
        </>
      )}
    </HrmsPage>
  );
}

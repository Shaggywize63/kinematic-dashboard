'use client';
// What-if simulator: test a change to pay, hiring, salary structure or a statutory ceiling on a copy of the sample data before changing anything.

import { useMemo, useState } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { Badge, HrmsPage, Loading, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { defaultInput, runScenario, validateInput } from '../../../../lib/hrms/control/simulate';
import { controlStore, deleteScenario, renameScenario, saveScenario } from '../../../../lib/hrms/control/store';
import type { SavedScenario, ScenarioInput } from '../../../../lib/hrms/control/types';
import SimForm from '../../../../components/hrms/control/SimForm';
import SimResultView from '../../../../components/hrms/control/SimResult';
import SimSaved from '../../../../components/hrms/control/SimSaved';
import SimCompare from '../../../../components/hrms/control/SimCompare';
import { Stack } from '../../../../components/hrms/control/parts';

const TABS = ['run', 'saved', 'compare'] as const;

export default function SimulatorPage() {
  const db = useHrmsDb();
  const state = controlStore.use();
  if (!db || !state) return <Loading />;
  return <Body db={db} scenarios={state.scenarios} />;
}

function Body({ db, scenarios }: { db: HrmsDb; scenarios: SavedScenario[] }) {
  const [tab, setTab] = useTabParam(TABS, 'run');
  const [draft, setDraft] = useState<ScenarioInput>(() => defaultInput(db, 'increment'));
  const [committed, setCommitted] = useState<ScenarioInput>(draft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const result = useMemo(() => runScenario(db, committed), [db, committed]);

  function run() {
    const e = validateInput(db, draft);
    setErrors(e);
    if (Object.keys(e).length === 0) setCommitted(draft);
  }
  function open(s: SavedScenario) {
    setDraft(s.input); setCommitted(s.input); setErrors({}); setTab('run');
  }

  return (
    <HrmsPage
      eyebrow="HRMS · Control"
      title="What-if simulator"
      description="See what a change would do to cost and compliance before you make it. It works on a copy of the sample data and never touches real payroll."
      actions={<Badge tone="warn">Planning only, not for filing</Badge>}
    >
      <TabBar value={tab} onChange={setTab} tabs={[{ key: 'run', label: 'Run a scenario' }, { key: 'saved', label: 'Saved scenarios', count: scenarios.length }, { key: 'compare', label: 'Compare' }]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'run' && (
          <Stack>
            <SimForm db={db} value={draft} onChange={setDraft} errors={errors} onRun={run} stale={JSON.stringify(draft) !== JSON.stringify(committed)} />
            <SimResultView key={result.title} db={db} result={result} onSave={(name) => saveScenario(name, committed)} />
          </Stack>
        )}
        {tab === 'saved' && <SimSaved db={db} scenarios={scenarios} onOpen={open} onRename={renameScenario} onDelete={deleteScenario} />}
        {tab === 'compare' && <SimCompare db={db} scenarios={scenarios} />}
      </div>
    </HrmsPage>
  );
}

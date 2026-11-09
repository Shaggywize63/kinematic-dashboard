'use client';
// Visit attendance: proof-of-work attendance for people who work outside an office. A missed punch should not cost a
// day when the person's own visits prove they worked. Preview on sample data; every decision is a person's.

import { useMemo, useState } from 'react';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { fieldStore } from '../../../../lib/hrms/field/store';
import { getFieldEvidence } from '../../../../lib/hrms/field/evidence';
import { regularisationCandidates } from '../../../../lib/hrms/field/engines';
import { partition } from '../../../../lib/hrms/fieldproof/logic';
import { HrmsPage, Loading, Note, TabBar, useTabParam } from '../../../../components/hrms/ui';
import ReviewTab from '../../../../components/hrms/fieldproof/ReviewTab';
import CalendarTab from '../../../../components/hrms/fieldproof/CalendarTab';
import DecidesTab from '../../../../components/hrms/fieldproof/DecidesTab';
import DayDetail from '../../../../components/hrms/fieldproof/DayDetail';

const TABS = ['review', 'calendar', 'rules'] as const;
type Tab = (typeof TABS)[number];

export default function FieldAttendancePage() {
  const db = useHrmsDb();
  const state = fieldStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'review');
  const [open, setOpen] = useState<{ employeeId: string; date: string } | null>(null);
  const ev = useMemo(() => (db ? getFieldEvidence() : null), [db]);
  const candidates = useMemo(() => (ev ? regularisationCandidates(ev) : []), [ev]);
  if (!db || !state || !ev) return <Loading />;

  const waiting = partition(candidates, state.regularisations).pending.length;
  const person = open ? db.employees.find((e) => e.id === open.employeeId) : undefined;

  return (
    <HrmsPage
      eyebrow="HRMS · Field force"
      title="Visit attendance"
      description="When a field person misses a punch, their own visits can show they worked. Look at the evidence, then decide."
    >
      <div data-testid="field-principle">
        <Note tone="ok">
          <b>A missed punch is never a reason to cut pay by itself.</b> Days that need judgement go to a manager, not to a rule. The person can see the same evidence you see here.
        </Note>
      </div>
      <TabBar<Tab>
        value={tab} onChange={setTab}
        tabs={[{ key: 'review', label: 'To review', count: waiting }, { key: 'calendar', label: 'Team calendar' }, { key: 'rules', label: 'How it decides' }]}
      />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'review' && <ReviewTab db={db} ev={ev} state={state} candidates={candidates} onOpen={(employeeId, date) => setOpen({ employeeId, date })} />}
        {tab === 'calendar' && <CalendarTab db={db} ev={ev} state={state} onOpen={(employeeId, date) => setOpen({ employeeId, date })} />}
        {tab === 'rules' && <DecidesTab db={db} ev={ev} />}
      </div>
      {open && person && <DayDetail ev={ev} person={person} date={open.date} regs={state.regularisations} onClose={() => setOpen(null)} />}
    </HrmsPage>
  );
}

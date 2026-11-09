'use client';
// Recruitment: pipeline board, openings with an approval step, candidates, and insights.
// Openings are held to the headcount the Workforce planning page approves. Tab is kept in ?tab=.

import { useState } from 'react';
import { HrmsPage, Loading, Stat, StatGrid, TabBar, useTabParam } from '../../../../components/hrms/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { hiringStore } from '../../../../lib/hrms/hiring/store';
import { isLive, seatsLeft } from '../../../../lib/hrms/hiring/engines';
import { VizStyle } from '../../../../components/hrms/hiring/charts';
import { Principle } from '../../../../components/hrms/hiring/shared';
import PipelineTab from '../../../../components/hrms/hiring/PipelineTab';
import OpeningsTab from '../../../../components/hrms/hiring/OpeningsTab';
import CandidatesTab from '../../../../components/hrms/hiring/CandidatesTab';
import InsightsTab from '../../../../components/hrms/hiring/InsightsTab';
import CandidateModal from '../../../../components/hrms/hiring/CandidateModal';

const TABS = ['pipeline', 'openings', 'candidates', 'insights'] as const;
type Tab = (typeof TABS)[number];

export default function RecruitmentPage() {
  const db = useHrmsDb();
  const st = hiringStore.use();
  const [tab, setTab] = useTabParam<Tab>(TABS, 'pipeline');
  const [pipelineOpening, setPipelineOpening] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  if (!db || !st) return <Loading />;

  const live = st.openings.filter(isLive);
  const active = st.candidates.filter((c) => c.stage !== 'rejected' && c.stage !== 'hired');
  const offersOut = st.candidates.filter((c) => c.offer?.status === 'extended').length;
  const pending = st.openings.filter((o) => o.status === 'pending_approval').length;
  const defaultOpening = st.openings.find((o) => o.status === 'open' && st.candidates.some((c) => c.openingId === o.id))?.id ?? st.openings[0]?.id ?? '';
  const selected = pipelineOpening && st.openings.some((o) => o.id === pipelineOpening) ? pipelineOpening : defaultOpening;

  return (
    <HrmsPage title="Recruitment" description="Openings, candidates and offers, from requisition to a new employee in Lifecycle.">
      <VizStyle />
      <Principle title="Fair hiring." testId="fairness-note">
        Scorecards rate competencies for the role, round by round. This page has no candidate photos and no age or gender columns, and rejections need a reason code about the role or the process.
        Nothing here ranks people or decides for you: a person reads the scorecards and decides.
      </Principle>
      <StatGrid>
        <Stat label="Open seats" value={live.reduce((s, o) => s + seatsLeft(o), 0)} hint={`On ${live.length} live openings`} />
        <Stat label="Candidates in process" value={active.length} hint="Applied, screen, interview or offer" />
        <Stat label="Offers out" value={offersOut} hint="Waiting for an answer" tone={offersOut ? 'warn' : undefined} />
        <Stat label="Waiting for approval" value={pending} hint="Openings sent to HR" tone={pending ? 'warn' : undefined} />
      </StatGrid>
      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { key: 'pipeline', label: 'Pipeline' }, { key: 'openings', label: 'Openings', count: st.openings.length },
        { key: 'candidates', label: 'Candidates', count: st.candidates.length }, { key: 'insights', label: 'Insights' },
      ]} />
      <div role="tabpanel" aria-label={tab}>
        {tab === 'pipeline' && <PipelineTab db={db} st={st} openingId={selected} setOpeningId={setPipelineOpening} onOpen={setCandidateId} />}
        {tab === 'openings' && <OpeningsTab db={db} st={st} openId={openingId} setOpenId={setOpeningId} />}
        {tab === 'candidates' && <CandidatesTab db={db} st={st} onOpen={setCandidateId} />}
        {tab === 'insights' && <InsightsTab st={st} />}
      </div>
      {candidateId && <CandidateModal db={db} st={st} id={candidateId} onClose={() => setCandidateId(null)} />}
    </HrmsPage>
  );
}

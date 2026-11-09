'use client';
// All candidates in one table. The columns are work facts only: there is no photo, age or gender column, on purpose.

import { useState } from 'react';
import { Badge, DataTable, SearchBox, T, Toolbar, type Col } from '../ui';
import { Select } from '../../ui';
import { fmtDate, inrShort } from '../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../lib/hrms/seed';
import type { HrmsDb } from '../../../lib/hrms/types';
import { SOURCES, SOURCE_LABEL, STAGES, STAGE_LABEL, rejectLabel, type Candidate, type HiringState, type Source, type Stage } from '../../../lib/hrms/hiring/types';
import { candidateAverage, daysInStage } from '../../../lib/hrms/hiring/engines';
import { subtle } from './shared';

export default function CandidatesTab({ db, st, onOpen }: { db: HrmsDb; st: HiringState; onOpen: (id: string) => void }) {
  void db;
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<'all' | Stage>('all');
  const [source, setSource] = useState<'all' | Source>('all');
  const [opening, setOpening] = useState('all');
  const titleOf = (id: string) => st.openings.find((o) => o.id === id)?.title ?? '—';
  const rows = st.candidates.filter((c) =>
    (stage === 'all' || c.stage === stage) && (source === 'all' || c.source === source) && (opening === 'all' || c.openingId === opening)
    && (!q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase())));

  const cols: Col<Candidate>[] = [
    { key: 'name', label: 'Candidate', sortValue: (c) => c.name, render: (c) => <span style={{ fontWeight: 600 }}>{c.name}</span> },
    { key: 'opening', label: 'Opening', sortValue: (c) => titleOf(c.openingId), render: (c) => titleOf(c.openingId) },
    { key: 'stage', label: 'Stage', nowrap: true, sortValue: (c) => STAGES.indexOf(c.stage), render: (c) => (
      <div><Badge tone={c.stage === 'hired' ? 'ok' : c.stage === 'rejected' ? 'red' : c.stage === 'offer' ? 'warn' : 'info'} dot>{STAGE_LABEL[c.stage]}</Badge>
        {c.stage === 'rejected' && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 2 }}>{rejectLabel(c.rejectReason)}</div>}</div>
    ) },
    { key: 'source', label: 'Source', nowrap: true, sortValue: (c) => c.source, render: (c) => SOURCE_LABEL[c.source] },
    { key: 'exp', label: 'Experience', align: 'right', nowrap: true, sortValue: (c) => c.experienceYears, render: (c) => `${c.experienceYears} yrs` },
    { key: 'ctc', label: 'Expected CTC', align: 'right', nowrap: true, sortValue: (c) => c.expectedCtc, render: (c) => inrShort(c.expectedCtc) },
    { key: 'notice', label: 'Notice', align: 'right', nowrap: true, sortValue: (c) => c.noticeDays, render: (c) => `${c.noticeDays} days` },
    { key: 'score', label: 'Scorecard average', align: 'right', nowrap: true, sortValue: (c) => candidateAverage(c).average ?? 0, render: (c) => { const a = candidateAverage(c); return a.average == null ? <span style={{ color: T.mute }}>None</span> : `${a.average.toFixed(1)} (${a.rounds})`; } },
    { key: 'applied', label: 'Applied', nowrap: true, sortValue: (c) => c.appliedOn, render: (c) => <span title={`${daysInStage(c, PREVIEW_TODAY)} days at the current stage`}>{fmtDate(c.appliedOn)}</span> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Toolbar>
        <SearchBox value={q} onChange={setQ} placeholder="Search candidates" width={240} />
        <div style={{ width: 170 }}><Select aria-label="Stage" value={stage} onChange={(e) => setStage(e.target.value as 'all' | Stage)}><option value="all">All stages</option>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</Select></div>
        <div style={{ width: 170 }}><Select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as 'all' | Source)}><option value="all">All sources</option>{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</Select></div>
        <div style={{ width: 220 }}><Select aria-label="Opening" value={opening} onChange={(e) => setOpening(e.target.value)}><option value="all">All openings</option>{st.openings.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}</Select></div>
      </Toolbar>
      <DataTable columns={cols} rows={rows} onRowClick={(c) => onOpen(c.id)} minWidth={900} empty="No candidates match these filters." />
      <div style={subtle}>{rows.length} of {st.candidates.length} candidates. There is no photo, age or gender column here by design: the list should help you compare work history and competencies, not people&apos;s looks or background. Records of people who are not hired are deleted after one year, as set on the Privacy page.</div>
    </div>
  );
}

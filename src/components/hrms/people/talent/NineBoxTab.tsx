'use client';
// 9-box: performance by potential for a chosen group. A conversation tool, not a score, and it does not drive pay.
// The summary shows counts only. Names appear only in the talent review (HR) view, and opening that view is logged.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Note, Stat, StatGrid, T, Toolbar } from '../../ui';
import { Field, Segmented, Select, Textarea } from '../../../ui';
import { fmtDate } from '../../../../lib/hrms/format';
import { clearPlacement, logReviewOpened, placeEmployee } from '../../../../lib/hrms/people/talentActions';
import { BOX_NAME, MIN_GROUP, PERF_LABEL, POT_LABEL, boxKey, nineBoxReview, nineBoxSummary } from '../../../../lib/hrms/people/talentEngine';
import { TEAMS, teamMembers } from '../../../../lib/hrms/people/teams';
import type { NineLevel, TalentState } from '../../../../lib/hrms/people/types';
import type { Employee, HrmsDb } from '../../../../lib/hrms/types';
import { useIsCompact } from '../../ui';
import { ActivityList, FormModal, Muted, Stack } from '../shared';
import type { TalentView } from './view';

function PlaceDialog({ st, person, onClose }: { st: TalentState; person: Employee; onClose: () => void }) {
  const cur = st.placements[person.id];
  const [perf, setPerf] = useState<string>(String(cur?.performance ?? 2));
  const [pot, setPot] = useState<string>(String(cur?.potential ?? 2));
  const [why, setWhy] = useState(cur?.rationale ?? '');
  return (
    <FormModal title={`9-box placement: ${person.firstName} ${person.lastName}`} confirmLabel="Save placement" onClose={onClose}
      onConfirm={() => {
        const r = placeEmployee(person.id, Number(perf) as NineLevel, Number(pot) as NineLevel, why);
        if (!r.ok) return r.error;
        toast.success('Placement saved and logged.');
        return null;
      }}>
      <Stack gap={12}>
        {cur && <Muted>Last set by {cur.by} on {fmtDate(cur.on)}.</Muted>}
        <Field label="Performance in the current role" htmlFor="nb-perf">
          <Select id="nb-perf" value={perf} onChange={(e) => setPerf(e.target.value)}>
            {([1, 2, 3] as NineLevel[]).map((l) => <option key={l} value={l}>{l} · {PERF_LABEL[l]}</option>)}
          </Select>
        </Field>
        <Field label="Potential" htmlFor="nb-pot">
          <Select id="nb-pot" value={pot} onChange={(e) => setPot(e.target.value)}>
            {([1, 2, 3] as NineLevel[]).map((l) => <option key={l} value={l}>{l} · {POT_LABEL[l]}</option>)}
          </Select>
        </Field>
        <Field label="Rationale" htmlFor="nb-why" hint="What did you see? The reason matters more than the box.">
          <Textarea id="nb-why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} />
        </Field>
        {cur && <div><Button size="sm" variant="danger" onClick={() => { clearPlacement(person.id); toast.success('Placement removed.'); onClose(); }}>Remove this placement</Button></div>}
      </Stack>
    </FormModal>
  );
}

export default function NineBoxTab({ db, st, tv }: { db: HrmsDb; st: TalentState; tv: TalentView }) {
  const narrow = useIsCompact(700);
  const [groupId, setGroupId] = useState('all');
  const [mode, setMode] = useState<'summary' | 'review'>('summary');
  const [edit, setEdit] = useState<string | null>(null);

  const team = TEAMS.find((t) => t.id === groupId);
  const groupName = team?.name ?? 'Everyone';
  const group = useMemo(() => (team ? teamMembers(team, db.employees) : tv.people), [team, db.employees, tv.people]);
  const summary = useMemo(() => nineBoxSummary(group, st.placements), [group, st.placements]);
  const review = useMemo(() => (mode === 'review' ? nineBoxReview(group, st.placements) : null), [mode, group, st.placements]);
  const person = edit ? tv.emp.get(edit) : undefined;

  function setView(m: 'summary' | 'review') {
    setMode(m);
    if (m === 'review') logReviewOpened(groupName);
  }

  const rows: NineLevel[] = [3, 2, 1];
  const cols: NineLevel[] = [1, 2, 3];

  return (
    <Stack gap={14}>
      <Note>The 9-box is a conversation tool, not a score. It does <b>not</b> drive pay, and a placement is a manager's or HR's view at a point in time, with a reason. Box names are prompts for a talk, not labels for a person.</Note>
      <Toolbar>
        <Select aria-label="Group" value={groupId} onChange={(e) => { setGroupId(e.target.value); }} style={{ width: 230 }}>
          <option value="all">Everyone</option>
          {TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Segmented<'summary' | 'review'> value={mode} onChange={setView} options={[{ value: 'summary', label: 'Summary (counts)' }, { value: 'review', label: 'Talent review (HR only)' }]} />
        <Muted>Cycle: {st.cycle}</Muted>
      </Toolbar>

      <StatGrid min={150}>
        <Stat label="People in group" value={summary.groupSize} />
        <Stat label="Placed" value={summary.placed} tone="info" />
        <Stat label="Not placed yet" value={summary.groupSize - summary.placed} tone={summary.groupSize - summary.placed ? 'warn' : 'ok'} />
      </StatGrid>

      {mode === 'summary' && summary.smallGroup && (
        <Note tone="warn" >This group has fewer than {MIN_GROUP} people. Counts are shown for the group, and names never appear in a summary. Open the talent review to discuss individuals.</Note>
      )}
      {mode === 'review' && <Note tone="warn">Names are shown. Keep this view to the talent review. Opening it is recorded in the talent log.</Note>}

      <div data-testid="nine-box" data-mode={mode} style={{ display: 'grid', gridTemplateColumns: narrow ? '22px repeat(3, minmax(0, 1fr))' : '34px repeat(3, minmax(0, 1fr))', gap: 6 }}>
        {rows.map((pot) => (
          <div key={pot} style={{ display: 'contents' }}>
            <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', textAlign: 'center', fontSize: 11.5, color: T.mute, alignSelf: 'center' }}>{pot === 3 ? 'High potential' : pot === 2 ? 'Medium' : 'Limited'}</div>
            {cols.map((perf) => {
              const key = boxKey(perf, pot);
              const names = review?.cells[key] ?? [];
              const n = summary.counts[key] ?? 0;
              return (
                <div key={key} data-testid={`box-${key}`} style={{ minHeight: narrow ? 92 : 112, border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: narrow ? 6 : 10, background: pot === 3 && perf === 3 ? T.okWash : T.card, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: narrow ? 10.5 : 12, color: T.dim, fontWeight: 600, lineHeight: 1.25 }}>{BOX_NAME[key]}</span>
                    {mode === 'summary' && <span data-testid={`count-${key}`} style={{ fontFamily: T.heading, fontWeight: 700, fontSize: narrow ? 16 : 20, color: n ? T.text : T.mute }}>{n}</span>}
                  </div>
                  {mode === 'review' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {names.map((e) => (
                        <button key={e.id} type="button" onClick={() => setEdit(e.id)} title={st.placements[e.id]?.rationale}
                          style={{ textAlign: 'left', border: `1px solid ${T.border}`, background: T.raised, color: T.text, borderRadius: T.radius.sm, padding: narrow ? '3px 5px' : '4px 8px', fontSize: narrow ? 11.5 : 12.5, cursor: 'pointer', fontFamily: 'inherit', overflowWrap: 'anywhere' }}>
                          {e.firstName} {e.lastName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div />
        {cols.map((perf) => <div key={perf} style={{ textAlign: 'center', fontSize: narrow ? 10.5 : 11.5, color: T.mute }}>{perf === 1 ? 'Below expectations' : perf === 2 ? 'Meets expectations' : 'Exceeds expectations'}</div>)}
      </div>

      {mode === 'review' && review && review.unplaced.length > 0 && (
        <div data-testid="unplaced">
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>Not placed yet ({review.unplaced.length})</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {review.unplaced.map((e) => <Button key={e.id} size="sm" aria-label={`Place ${e.firstName} ${e.lastName}`} onClick={() => setEdit(e.id)}>{e.firstName} {e.lastName}</Button>)}
          </div>
        </div>
      )}
      {mode === 'review' && (
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: T.dim }}>Talent log (who looked, who changed what)</summary>
          <div style={{ marginTop: 8 }}><ActivityList entries={st.log.filter((l) => /9-box|Talent review/.test(l.action))} testId="talent-log" /></div>
        </details>
      )}
      {mode === 'summary' && <Muted>This view shows counts only. Names appear in the talent review, which is for HR and is logged when opened.</Muted>}
      {person && <PlaceDialog st={st} person={person} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

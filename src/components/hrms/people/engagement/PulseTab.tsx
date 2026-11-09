'use client';
// Pulse surveys: results per question per team (only for groups of at least 5), anonymous comments, a builder for a new
// pulse and a "take the survey" demo that adds an anonymous response. The rules are in engagementEngine.ts.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, Note, ProgressBar, T, Toolbar } from '../../ui';
import { Field, Input, Select, Textarea } from '../../../ui';
import { fmtDate } from '../../../../lib/hrms/format';
import { closeSurvey, sendPulse, submitResponse } from '../../../../lib/hrms/people/engagementActions';
import { COMPANY, MIN_RESPONSES, NOT_ENOUGH, engagementIndex, questionResult, responsesIn, type QuestionResult } from '../../../../lib/hrms/people/engagementEngine';
import { TEAMS } from '../../../../lib/hrms/people/teams';
import type { AnswerValue, EngagementState, QType, Survey } from '../../../../lib/hrms/people/types';
import { ActivityList, FormModal, Muted, ROW_TH, SimulationBadge, Stack } from '../shared';
import type { EngagementView } from './view';

const TYPE_LABEL: Record<QType, string> = { rating: 'Rating 1 to 5', yesno: 'Yes or no', text: 'Free text' };
const SCOPES = [{ id: COMPANY, name: 'Whole company' }, ...TEAMS.map((t) => ({ id: t.id, name: t.name }))];

// ───────────────────────────── builder ─────────────────────────────
function NewPulseModal({ last, onClose, onSent }: { last?: Survey; onClose: () => void; onSent: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [qs, setQs] = useState<{ text: string; type: QType }[]>(last ? last.questions.map((q) => ({ text: q.text, type: q.type })) : [{ text: '', type: 'rating' }]);
  const set = (i: number, patch: Partial<{ text: string; type: QType }>) => setQs((a) => a.map((q, k) => (k === i ? { ...q, ...patch } : q)));
  return (
    <FormModal title="New pulse" confirmLabel="Send pulse" width={640} onClose={onClose}
      onConfirm={() => {
        const r = sendPulse(title, qs);
        if (!r.ok) return r.errors.join(' ');
        toast.success('Pulse sent. Simulation: nothing was emailed.');
        onSent(r.survey.id);
        return null;
      }}>
      <Stack gap={12}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><SimulationBadge>Simulation</SimulationBadge><Muted>Sending opens the pulse here and logs it. No email or message goes out.</Muted></div>
        <Field label="Name" htmlFor="pulse-title"><Input id="pulse-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="December pulse" /></Field>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {qs.map((q, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr auto', gap: 8, alignItems: 'end' }}>
              <Field label={`Question ${i + 1} type`} htmlFor={`pq-type-${i}`}>
                <Select id={`pq-type-${i}`} value={q.type} onChange={(e) => set(i, { type: e.target.value as QType })}>
                  {(Object.keys(TYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </Select>
              </Field>
              <Field label={`Question ${i + 1} text`} htmlFor={`pq-text-${i}`}><Input id={`pq-text-${i}`} value={q.text} onChange={(e) => set(i, { text: e.target.value })} /></Field>
              <Button size="sm" variant="ghost" aria-label={`Remove question ${i + 1}`} disabled={qs.length <= 1} onClick={() => setQs((a) => a.filter((_, k) => k !== i))}>Remove</Button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button size="sm" disabled={qs.length >= 5} onClick={() => setQs((a) => [...a, { text: '', type: 'rating' }])}>Add question</Button>
          <Muted>{qs.length >= 5 ? 'A pulse has at most 5 questions.' : `${qs.length} of 5 questions. Types: rating 1 to 5, yes or no, free text.`}</Muted>
        </div>
      </Stack>
    </FormModal>
  );
}

// ───────────────────────────── take the survey (demo) ─────────────────────────────
function TakeSurveyModal({ open, startId, onClose }: { open: Survey[]; startId: string; onClose: () => void }) {
  const [surveyId, setSurveyId] = useState(startId);
  const [teamId, setTeamId] = useState(TEAMS[0]!.id);
  const [answers, setAnswers] = useState<Record<string, AnswerValue | undefined>>({});
  const s = open.find((x) => x.id === surveyId) ?? open[0]!;
  return (
    <FormModal title={`Take the survey: ${s.title}`} confirmLabel="Submit anonymously" width={620} onClose={onClose}
      onConfirm={() => {
        const r = submitResponse(s.id, teamId, answers);
        if (!r.ok) return r.error;
        toast.success('Response added. The results update once a team has 5 or more.');
        return null;
      }}>
      <Stack gap={14}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><SimulationBadge>Demo</SimulationBadge><Muted>In the live product each person answers once from their own phone, and nobody, HR included, can see who answered. Here you pick a team to add a response.</Muted></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Field label="Pulse" htmlFor="take-survey"><Select id="take-survey" value={s.id} onChange={(e) => { setSurveyId(e.target.value); setAnswers({}); }}>{open.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
          <Field label="Answer as someone in" htmlFor="take-team"><Select id="take-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>{TEAMS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        </div>
        {s.questions.map((q, i) => (
          <fieldset key={q.id} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, margin: 0, padding: '10px 14px' }}>
            <legend style={{ fontSize: 13.5, fontWeight: 600, color: T.text, padding: '0 6px' }}>{i + 1}. {q.text}</legend>
            {q.type === 'rating' && (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 14, color: T.text }}>
                    <input type="radio" name={`ans-${q.id}`} checked={answers[q.id] === n} onChange={() => setAnswers((a) => ({ ...a, [q.id]: n }))} aria-label={`${q.text} rating ${n}`} />{n}
                  </label>
                ))}
                <span style={{ fontSize: 12, color: T.mute }}>1 disagree, 5 agree</span>
              </div>
            )}
            {q.type === 'yesno' && (
              <div style={{ display: 'flex', gap: 14 }}>
                {([['Yes', true], ['No', false]] as const).map(([label, v]) => (
                  <label key={label} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 14, color: T.text }}>
                    <input type="radio" name={`ans-${q.id}`} checked={answers[q.id] === v} onChange={() => setAnswers((a) => ({ ...a, [q.id]: v }))} aria-label={`${q.text} ${label}`} />{label}
                  </label>
                ))}
              </div>
            )}
            {q.type === 'text' && (
              <div>
                <Textarea aria-label={q.text} rows={2} value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                <Muted>Do not include names. Names, phone numbers and places are removed before anyone reads a comment.</Muted>
              </div>
            )}
          </fieldset>
        ))}
      </Stack>
    </FormModal>
  );
}

// ───────────────────────────── results ─────────────────────────────
function Cell({ r }: { r: QuestionResult }) {
  if (!r.shown) return <span style={{ color: T.mute }} title={NOT_ENOUGH}>Not shown</span>;
  if (r.type === 'rating') return <div style={{ minWidth: 96 }}><b style={{ fontVariantNumeric: 'tabular-nums' }}>{r.avg!.toFixed(1)}</b> <span style={{ color: T.mute, fontSize: 12 }}>of 5</span><ProgressBar pct={((r.avg! - 1) / 4) * 100} tone="info" height={5} /></div>;
  if (r.type === 'yesno') return <div style={{ minWidth: 96 }}><b>{r.yesPct}%</b> <span style={{ color: T.mute, fontSize: 12 }}>yes</span><ProgressBar pct={r.yesPct!} tone="info" height={5} /></div>;
  return <span style={{ color: T.dim }}>{r.comments.length} {r.comments.length === 1 ? 'comment' : 'comments'}</span>;
}

export default function PulseTab({ st, ev }: { st: EngagementState; ev: EngagementView }) {
  const [surveyId, setSurveyId] = useState(ev.closed[0]?.id ?? ev.surveys[0]?.id ?? '');
  const [scope, setScope] = useState<string>(COMPANY);
  const [dlg, setDlg] = useState<null | 'new' | 'take'>(null);
  const survey = ev.surveys.find((s) => s.id === surveyId) ?? ev.surveys[0];
  const open = ev.surveys.filter((s) => s.status === 'open');

  if (!survey) return <Card><Muted>No pulses yet. Send the first one.</Muted></Card>;
  const all = responsesIn(st.responses, survey.id, COMPANY);
  const co = engagementIndex(survey, all);
  const teamRes = TEAMS.map((t) => ({ team: t, rs: responsesIn(st.responses, survey.id, t.id) }));
  const shownTeams = teamRes.filter((t) => t.rs.length >= MIN_RESPONSES).length;
  const scopeRes = responsesIn(st.responses, survey.id, scope);
  const commentQ = survey.questions.find((q) => q.type === 'text');
  const comments = commentQ ? questionResult(commentQ, scopeRes, ev.terms) : undefined;
  const scopeName = SCOPES.find((x) => x.id === scope)?.name ?? '';

  return (
    <Stack gap={16}>
      <Toolbar>
        <Select aria-label="Pulse" value={survey.id} onChange={(e) => setSurveyId(e.target.value)} style={{ width: 240 }}>
          {ev.surveys.map((s) => <option key={s.id} value={s.id}>{s.title}{s.status === 'open' ? ' (open)' : ''}</option>)}
        </Select>
        <Badge tone={survey.status === 'open' ? 'ok' : 'neutral'} dot>{survey.status === 'open' ? `Open until ${fmtDate(survey.closesOn)}` : `Closed ${fmtDate(survey.closesOn)}`}</Badge>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {survey.status === 'open' && <Button size="sm" onClick={() => { closeSurvey(survey.id); toast.success('Pulse closed.'); }}>Close this pulse</Button>}
          <Button size="sm" onClick={() => setDlg('take')} disabled={open.length === 0}>Take the survey (demo)</Button>
          <Button size="sm" variant="primary" onClick={() => setDlg('new')}>New pulse</Button>
        </div>
      </Toolbar>
      {open.length === 0 && <Muted>The demo needs an open pulse. Send a new pulse to try it.</Muted>}

      <div data-testid="team-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12 }}>
        {[{ id: COMPANY, name: 'Whole company', n: all.length, idx: co.index }, ...teamRes.map((t) => ({ id: t.team.id, name: t.team.name, n: t.rs.length, idx: engagementIndex(survey, t.rs).index }))].map((c) => (
          <Card key={c.id} padding={14}>
            <div data-testid={`team-card-${c.id}`}>
              <div style={{ fontSize: 12.5, color: T.dim, fontWeight: 600 }}>{c.name}</div>
              {c.idx != null ? (
                <div style={{ fontFamily: T.heading, fontSize: 26, fontWeight: 700, color: T.text, marginTop: 4 }}>{c.idx.toFixed(1)} <span style={{ fontSize: 13, color: T.mute, fontWeight: 500 }}>of 5</span></div>
              ) : (
                <div style={{ fontSize: 13.5, color: T.mute, marginTop: 8, minHeight: 36 }}>{NOT_ENOUGH}</div>
              )}
              <div style={{ fontSize: 12, color: T.mute, marginTop: 4 }}>{c.n} {c.n === 1 ? 'response' : 'responses'}{c.idx == null ? ` (${MIN_RESPONSES} needed)` : ''}</div>
            </div>
          </Card>
        ))}
      </div>
      <Muted>Engagement index: the average of the rating questions, 1 to 5. {shownTeams} of {TEAMS.length} teams have enough responses to be shown. Teams under {MIN_RESPONSES} responses are counted in the company total only.</Muted>

      <Card padding={0}>
        <div style={{ padding: '14px 16px 0' }}><CardTitle>Results by question and team</CardTitle></div>
        <div style={{ overflowX: 'auto' }}>
          <table data-testid="results-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '8px 16px', fontSize: 11.5, color: T.mute, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}` }}>Question</th>
                {SCOPES.map((sc) => {
                  const n = responsesIn(st.responses, survey.id, sc.id).length;
                  return (
                    <th key={sc.id} scope="col" style={{ ...ROW_TH, textAlign: 'left', padding: '8px 12px', fontSize: 12.5, fontWeight: 600, color: T.dim, borderBottom: `1px solid ${T.border}`, verticalAlign: 'bottom', width: 130 }}>
                      <div>{sc.name}</div>
                      <div style={{ fontWeight: 400, fontSize: 11.5, color: n >= MIN_RESPONSES ? T.mute : T.warn }}>{n >= MIN_RESPONSES ? `${n} responses` : NOT_ENOUGH}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {survey.questions.map((q) => (
                <tr key={q.id}>
                  <td style={{ padding: '10px 16px', fontSize: 13.5, color: T.text, borderTop: `1px solid ${T.border}`, maxWidth: 320 }}>{q.text} <span style={{ color: T.mute, fontSize: 11.5 }}>({TYPE_LABEL[q.type]})</span></td>
                  {SCOPES.map((sc) => (
                    <td key={sc.id} data-testid={`res-${q.id}-${sc.id}`} style={{ padding: '10px 12px', fontSize: 13.5, color: T.text, borderTop: `1px solid ${T.border}`, verticalAlign: 'top' }}>
                      <Cell r={questionResult(q, responsesIn(st.responses, survey.id, sc.id), ev.terms)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {commentQ && (
        <Card>
          <CardTitle right={
            <Select aria-label="Comments for" value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 200 }}>
              {SCOPES.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </Select>
          }>Comments, anonymous</CardTitle>
          {comments && comments.shown ? (
            comments.type === 'text' && comments.comments.length > 0 ? (
              <ul data-testid="comments" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {comments.comments.map((c, i) => <li key={i} style={{ padding: '8px 12px', background: T.raised, borderRadius: T.radius.md, fontSize: 13.5, color: T.text }}>{c}</li>)}
              </ul>
            ) : <Muted>No comments were written by {scopeName}.</Muted>
          ) : (
            <Note tone="warn"><span data-testid="comments-hidden">{NOT_ENOUGH}</span> for {scopeName} ({scopeRes.length} of {MIN_RESPONSES} needed).</Note>
          )}
          <Muted style={{ marginTop: 10 }}>Comments carry no team, time, role or place. Names, phone numbers, e-mail addresses and place names are removed, and the order is not the order people answered in.</Muted>
        </Card>
      )}

      <Card padding={16}>
        <CardTitle>Recent activity</CardTitle>
        <ActivityList entries={st.log.filter((l) => /Pulse/.test(l.action))} testId="pulse-log" limit={5} />
      </Card>
      {dlg === 'new' && <NewPulseModal last={ev.surveys[0]} onClose={() => setDlg(null)} onSent={(id) => setSurveyId(id)} />}
      {dlg === 'take' && open.length > 0 && <TakeSurveyModal open={open} startId={open.some((s) => s.id === survey.id) ? survey.id : open[0]!.id} onClose={() => setDlg(null)} />}
    </Stack>
  );
}

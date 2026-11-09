'use client';
// Exit interviews: a structured form for people leaving (from the exits list), themes across leavers once at least 5
// interviews are complete, and the individual answers, which are HR-only and opened one at a time (and logged).

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, CardTitle, EmployeeCell, Note, ProgressBar, T } from '../../ui';
import { Field, Textarea } from '../../../ui';
import { fmtDate } from '../../../../lib/hrms/format';
import { completeExitInterview, logExitRecordOpened } from '../../../../lib/hrms/people/engagementActions';
import { EXIT_REASONS, MIN_INTERVIEWS, exitThemes } from '../../../../lib/hrms/people/engagementEngine';
import type { EngagementState, ExitInterview, WouldReturn } from '../../../../lib/hrms/people/types';
import type { ExitCase, HrmsDb } from '../../../../lib/hrms/types';
import { FormModal, Muted, SimulationBadge, Stack } from '../shared';
import type { EngagementView } from './view';

const RETURN_LABEL: Record<WouldReturn, string> = { yes: 'Would consider returning', maybe: 'Maybe', no: 'Would not return' };

function InterviewForm({ db, ev, exit, onClose }: { db: HrmsDb; ev: EngagementView; exit: ExitCase; onClose: () => void }) {
  const emp = db.employees.find((e) => e.id === exit.employeeId)!;
  const [reasons, setReasons] = useState<string[]>([]);
  const [back, setBack] = useState<WouldReturn | ''>('');
  const [text, setText] = useState('');
  const toggle = (r: string) => setReasons((a) => (a.includes(r) ? a.filter((x) => x !== r) : [...a, r]));
  const label = `${db.designations.find((d) => d.id === emp.designationId)?.name ?? 'Employee'}, ${ev.dep(emp.departmentId)}`;
  return (
    <FormModal title={`Exit interview: ${emp.firstName} ${emp.lastName}`} confirmLabel="Save interview" width={600} onClose={onClose}
      onConfirm={() => {
        const r = completeExitInterview({ exitId: exit.id, employeeId: emp.id, label, reasons, wouldReturn: back, text });
        if (!r.ok) return r.error;
        toast.success('Interview saved to the HR record.');
        return null;
      }}>
      <Stack gap={14}>
        <Muted>Answers stay in the HR record. Only the reasons are counted in the themes, and only once {MIN_INTERVIEWS} interviews are complete.</Muted>
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, margin: 0, padding: '8px 12px' }}>
          <legend style={{ fontSize: 13, color: T.dim, padding: '0 6px' }}>Main reasons for leaving (pick up to 3)</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '4px 12px' }}>
            {EXIT_REASONS.map((r) => (
              <label key={r} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: T.text }}>
                <input type="checkbox" checked={reasons.includes(r)} disabled={!reasons.includes(r) && reasons.length >= 3} onChange={() => toggle(r)} />{r}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, margin: 0, padding: '8px 12px' }}>
          <legend style={{ fontSize: 13, color: T.dim, padding: '0 6px' }}>Would they consider coming back?</legend>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {(Object.keys(RETURN_LABEL) as WouldReturn[]).map((k) => (
              <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: T.text }}>
                <input type="radio" name="would-return" checked={back === k} onChange={() => setBack(k)} />{RETURN_LABEL[k]}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="In their own words" htmlFor="exit-text" hint="Optional. What worked, what did not, what would have changed the decision?"><Textarea id="exit-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} /></Field>
      </Stack>
    </FormModal>
  );
}

function RecordRow({ db, row, ev }: { db: HrmsDb; row: ExitInterview; ev: EngagementView }) {
  const [shown, setShown] = useState(false);
  const emp = row.employeeId ? db.employees.find((e) => e.id === row.employeeId) : undefined;
  return (
    <div data-testid={`record-${row.id}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 12 }}>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: T.text }}>{emp ? `${emp.firstName} ${emp.lastName}` : row.label}</div>
          <div style={{ fontSize: 12.5, color: T.mute }}>{emp ? row.label : 'Earlier leaver, name not kept'} · interviewed {fmtDate(row.completedOn)}</div>
        </div>
        <Button size="sm" aria-label={`${shown ? 'Hide' : 'Show'} answers for ${emp ? `${emp.firstName} ${emp.lastName}` : row.label}`} onClick={() => { if (!shown) logExitRecordOpened(row.employeeId); setShown((v) => !v); }}>{shown ? 'Hide answers' : 'Show answers (HR only)'}</Button>
      </div>
      {shown && (
        <div data-testid={`answers-${row.id}`} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5, color: T.text }}>
          <div><b>Reasons:</b> {row.reasons.join(', ')}</div>
          <div><b>Would return:</b> {RETURN_LABEL[row.wouldReturn]}</div>
          {row.text && <div style={{ padding: '8px 12px', background: T.raised, borderRadius: T.radius.md }}>{row.text}</div>}
          <Muted>Opening this record was written to the access log{emp ? ` for ${ev.name(emp.id)}` : ''}.</Muted>
        </div>
      )}
    </div>
  );
}

export default function ExitTab({ db, st, ev }: { db: HrmsDb; st: EngagementState; ev: EngagementView }) {
  const [form, setForm] = useState<string | null>(null);
  const done = new Set(st.exitInterviews.map((i) => i.exitId).filter(Boolean));
  const pending = db.exits.filter((x) => !done.has(x.id));
  const themes = exitThemes(st.exitInterviews);
  const exit = form ? db.exits.find((x) => x.id === form) : undefined;
  const needed = Math.max(0, MIN_INTERVIEWS - themes.completed);

  return (
    <Stack gap={16}>
      <Card>
        <CardTitle>Interviews to record</CardTitle>
        {pending.length === 0 ? <Muted>No leaver is waiting for an interview.</Muted> : (
          <div data-testid="pending-interviews" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((x) => {
              const e = db.employees.find((y) => y.id === x.employeeId);
              if (!e) return null;
              return (
                <div key={x.id} style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <EmployeeCell e={e} sub={`Last day ${fmtDate(x.lastWorkingDate)}`} />
                  <Button variant="primary" size="sm" aria-label={`Record exit interview for ${e.firstName} ${e.lastName}`} onClick={() => setForm(x.id)}>Record interview</Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="px-viz">
        <CardTitle right={<Badge tone={themes.shown ? 'ok' : 'warn'}>{themes.completed} of {MIN_INTERVIEWS} interviews complete</Badge>}>Themes across leavers</CardTitle>
        {!themes.shown ? (
          <div data-testid="themes-locked" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Note tone="warn">Themes are shown once at least {MIN_INTERVIEWS} interviews are complete. {needed} more {needed === 1 ? 'is' : 'are'} needed. Until then, each person's answers are visible only to HR in their exit record, below.</Note>
            <ProgressBar pct={(themes.completed / MIN_INTERVIEWS) * 100} tone="warn" />
          </div>
        ) : (
          <div data-testid="themes" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontFamily: T.heading, color: T.text }}>Reasons given, share of interviews</h3>
              <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {themes.reasons.map((r) => (
                  <div key={r.reason} role="listitem" data-testid={`theme-${r.reason}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.text, marginBottom: 3 }}><span>{r.reason}</span><span style={{ color: T.dim, fontVariantNumeric: 'tabular-nums' }}>{r.pct}% ({r.count} of {themes.completed})</span></div>
                    <div style={{ height: 8, background: T.raised, borderRadius: 4 }}><div style={{ width: `${r.pct}%`, height: '100%', background: 'var(--px-1)', borderRadius: 4 }} /></div>
                  </div>
                ))}
              </div>
              <Muted style={{ marginTop: 8 }}>A person can give up to three reasons, so shares add up to more than 100%.</Muted>
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: 14, fontFamily: T.heading, color: T.text }}>Would they consider returning?</h3>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {(Object.keys(RETURN_LABEL) as WouldReturn[]).map((k) => (
                  <div key={k} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '8px 14px', minWidth: 120 }}>
                    <div style={{ fontFamily: T.heading, fontSize: 22, fontWeight: 700, color: T.text }}>{themes.wouldReturn[k]}</div>
                    <div style={{ fontSize: 12.5, color: T.dim }}>{RETURN_LABEL[k]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardTitle right={<SimulationBadge>HR only</SimulationBadge>}>HR record: individual answers</CardTitle>
        <Muted style={{ marginBottom: 10 }}>Answers are hidden until opened. Opening one is written to the access log. Individual answers are never part of a summary or a theme.</Muted>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {st.exitInterviews.length === 0 && <Muted>No interviews recorded yet.</Muted>}
          {[...st.exitInterviews].sort((a, b) => b.completedOn.localeCompare(a.completedOn)).map((r) => <RecordRow key={r.id} db={db} row={r} ev={ev} />)}
        </div>
      </Card>
      {exit && <InterviewForm db={db} ev={ev} exit={exit} onClose={() => setForm(null)} />}
    </Stack>
  );
}

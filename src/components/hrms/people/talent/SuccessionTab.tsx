'use client';
// Succession: critical roles, the facts about timing, and the bench of named successors with readiness and development
// actions. Every change needs a reason and is logged. No scoring or prediction about any person.

import { useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, EmployeeCell, Note, Stat, StatGrid, T } from '../../ui';
import { Field, Select, Textarea } from '../../../ui';
import { fmtDate } from '../../../../lib/hrms/format';
import { PREVIEW_TODAY } from '../../../../lib/hrms/seed';
import { addSuccessor, removeSuccessor, setReadiness } from '../../../../lib/hrms/people/talentActions';
import { READINESS_LABEL, READINESS_ORDER, benchStrength, vacancyFacts } from '../../../../lib/hrms/people/talentEngine';
import type { CriticalRole, Readiness, TalentState } from '../../../../lib/hrms/people/types';
import { FormModal, Muted, Stack } from '../shared';
import type { TalentView } from './view';

const BENCH_TONE = { red: 'red', amber: 'warn', green: 'ok' } as const;

type Dialog =
  | { kind: 'add'; roleId: string }
  | { kind: 'readiness'; roleId: string; empId: string }
  | { kind: 'remove'; roleId: string; empId: string };

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Reason" htmlFor="succ-reason" hint="Why this change? It is kept in the role's history.">
      <Textarea id="succ-reason" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function AddDialog({ tv, role, onClose }: { tv: TalentView; role: CriticalRole; onClose: () => void }) {
  const options = tv.people.filter((e) => e.id !== role.incumbentId && !role.successors.some((s) => s.employeeId === e.id));
  const [empId, setEmpId] = useState('');
  const [readiness, setR] = useState<Readiness>('1-2y');
  const [actions, setActions] = useState('');
  const [reason, setReason] = useState('');
  return (
    <FormModal title={`Add a successor: ${role.title}`} confirmLabel="Add to bench" onClose={onClose}
      onConfirm={() => {
        if (!empId) return 'Pick a person.';
        const r = addSuccessor(role.id, empId, readiness, actions.split('\n'), reason);
        if (!r.ok) return r.error;
        toast.success(`${tv.name(empId)} added to the bench.`);
        return null;
      }}>
      <Stack gap={12}>
        <Field label="Person" htmlFor="succ-person">
          <Select id="succ-person" value={empId} onChange={(e) => setEmpId(e.target.value)}>
            <option value="">Choose a person</option>
            {options.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} · {tv.des(e.designationId)}</option>)}
          </Select>
        </Field>
        <Field label="Readiness" htmlFor="succ-ready">
          <Select id="succ-ready" value={readiness} onChange={(e) => setR(e.target.value as Readiness)}>
            {READINESS_ORDER.map((r) => <option key={r} value={r}>{READINESS_LABEL[r]}</option>)}
          </Select>
        </Field>
        <Field label="Development actions" htmlFor="succ-actions" hint="One per line. For example: cover the region for two weeks."><Textarea id="succ-actions" rows={3} value={actions} onChange={(e) => setActions(e.target.value)} /></Field>
        <ReasonField value={reason} onChange={setReason} />
      </Stack>
    </FormModal>
  );
}

function ReadinessDialog({ tv, role, empId, onClose }: { tv: TalentView; role: CriticalRole; empId: string; onClose: () => void }) {
  const cur = role.successors.find((s) => s.employeeId === empId)!;
  const [readiness, setR] = useState<Readiness>(cur.readiness);
  const [reason, setReason] = useState('');
  return (
    <FormModal title={`Change readiness: ${tv.name(empId)}`} confirmLabel="Save change" onClose={onClose}
      onConfirm={() => {
        const r = setReadiness(role.id, empId, readiness, reason);
        if (!r.ok) return r.error;
        toast.success('Readiness changed and logged.');
        return null;
      }}>
      <Stack gap={12}>
        <Field label="Readiness" htmlFor="succ-ready2">
          <Select id="succ-ready2" value={readiness} onChange={(e) => setR(e.target.value as Readiness)}>
            {READINESS_ORDER.map((r) => <option key={r} value={r}>{READINESS_LABEL[r]}</option>)}
          </Select>
        </Field>
        <ReasonField value={reason} onChange={setReason} />
      </Stack>
    </FormModal>
  );
}

function RemoveDialog({ tv, role, empId, onClose }: { tv: TalentView; role: CriticalRole; empId: string; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <FormModal title={`Remove from the bench: ${tv.name(empId)}`} confirmLabel="Remove" danger onClose={onClose}
      onConfirm={() => {
        const r = removeSuccessor(role.id, empId, reason);
        if (!r.ok) return r.error;
        toast.success('Removed from the bench and logged.');
        return null;
      }}>
      <Stack gap={12}>
        <Muted>This removes {tv.name(empId)} from the successors for {role.title}. It does not change anything about their job.</Muted>
        <ReasonField value={reason} onChange={setReason} />
      </Stack>
    </FormModal>
  );
}

export default function SuccessionTab({ st, tv }: { st: TalentState; tv: TalentView }) {
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const benches = st.roles.map((r) => ({ role: r, bench: benchStrength(r) }));
  const count = (s: 'red' | 'amber' | 'green') => benches.filter((b) => b.bench.status === s).length;
  const role = dlg ? st.roles.find((r) => r.id === dlg.roleId) : undefined;

  return (
    <Stack gap={16}>
      <StatGrid>
        <Stat label="No successor named" value={count('red')} tone={count('red') ? 'red' : 'ok'} hint="Critical roles with an empty bench" />
        <Stat label="Nobody ready now" value={count('amber')} tone={count('amber') ? 'warn' : 'ok'} hint="Successors named, none ready yet" />
        <Stat label="Someone ready now" value={count('green')} tone="ok" hint="At least one successor ready now" />
      </StatGrid>
      <Note>Risk of a vacancy is described with facts only: notice period, time in role, contract end and retirement age. There is no prediction about any person's intentions, and nothing here scores a person.</Note>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))', gap: 14 }}>
        {benches.map(({ role: r, bench }) => {
          const inc = tv.emp.get(r.incumbentId);
          const facts = vacancyFacts(r, inc, PREVIEW_TODAY);
          return (
            <Card key={r.id} padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div data-testid={`role-${r.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontFamily: T.heading, color: T.text }}>{r.title}</h3>
                    <div style={{ fontSize: 12.5, color: T.mute }}>{tv.dep(r.departmentId)} · {tv.loc(r.locationId)}</div>
                  </div>
                  <span data-testid={`bench-${r.id}`} data-status={bench.status}><Badge tone={BENCH_TONE[bench.status]} dot>{bench.label}</Badge></span>
                </div>
                <div style={{ fontSize: 13, color: T.dim }}>{r.why}</div>
                {inc && <div><div style={{ fontSize: 11.5, color: T.mute, marginBottom: 4 }}>Current holder</div><EmployeeCell e={inc} sub={`Since ${fmtDate(r.roleSince)}`} /></div>}
                <div>
                  <div style={{ fontSize: 11.5, color: T.mute, marginBottom: 4 }}>Facts about timing</div>
                  <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: T.text, lineHeight: 1.6 }}>{facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
                <div>
                  <div style={{ fontSize: 11.5, color: T.mute, marginBottom: 6 }}>Bench ({r.successors.length})</div>
                  {r.successors.length === 0 ? (
                    <div style={{ fontSize: 13, color: T.red }}>No one is named. Add at least one successor.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...r.successors].sort((a, b) => READINESS_ORDER.indexOf(a.readiness) - READINESS_ORDER.indexOf(b.readiness)).map((s) => {
                        const e = tv.emp.get(s.employeeId);
                        if (!e) return null;
                        return (
                          <div key={s.employeeId} data-testid={`successor-${r.id}-${s.employeeId}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <EmployeeCell e={e} sub={tv.des(e.designationId)} />
                              <Badge tone={s.readiness === 'now' ? 'ok' : s.readiness === '1-2y' ? 'info' : 'neutral'}>{READINESS_LABEL[s.readiness]}</Badge>
                            </div>
                            {s.actions.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 18, listStyle: 'disc', fontSize: 12.5, color: T.dim, lineHeight: 1.55 }}>{s.actions.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <Button size="sm" aria-label={`Change readiness of ${e.firstName} ${e.lastName} for ${r.title}`} onClick={() => setDlg({ kind: 'readiness', roleId: r.id, empId: s.employeeId })}>Change readiness</Button>
                              <Button size="sm" variant="ghost" aria-label={`Remove ${e.firstName} ${e.lastName} from the bench for ${r.title}`} onClick={() => setDlg({ kind: 'remove', roleId: r.id, empId: s.employeeId })}>Remove</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                {r.history.length > 0 && (
                  <details>
                    <summary style={{ cursor: 'pointer', fontSize: 12.5, color: T.dim }}>History ({r.history.length})</summary>
                    <ul data-testid={`history-${r.id}`} style={{ margin: '6px 0 0', paddingLeft: 18, listStyle: 'disc', fontSize: 12.5, color: T.dim, lineHeight: 1.6 }}>
                      {r.history.slice(0, 8).map((h) => (
                        <li key={h.id}>{fmtDate(h.on)}: {tv.name(h.employeeId)} {h.kind === 'added' ? `added (${READINESS_LABEL[h.to as Readiness]})` : h.kind === 'removed' ? 'removed' : `moved from ${READINESS_LABEL[h.from as Readiness]} to ${READINESS_LABEL[h.to as Readiness]}`}. Reason: {h.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <div><Button size="sm" variant="primary" aria-label={`Add a successor for ${r.title}`} onClick={() => setDlg({ kind: 'add', roleId: r.id })}>Add successor</Button></div>
            </Card>
          );
        })}
      </div>
      {dlg?.kind === 'add' && role && <AddDialog tv={tv} role={role} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'readiness' && role && <ReadinessDialog tv={tv} role={role} empId={dlg.empId} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'remove' && role && <RemoveDialog tv={tv} role={role} empId={dlg.empId} onClose={() => setDlg(null)} />}
    </Stack>
  );
}

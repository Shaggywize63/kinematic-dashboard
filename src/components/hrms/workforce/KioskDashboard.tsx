'use client';
// Site kiosk dashboard: today's roster against who has punched, late arrivals, exceptions to resolve, tablets, the punch
// feed, PINs and the punch rules. Everything is kept in the workforce store. Kiosk mode itself is KioskModal.

import { useEffect, useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, DataTable, EmployeeCell, HrmsPage, Loading, Modal, Note, Stat, StatGrid, T, useIsCompact, type Col } from '../ui';
import { Field, Input, Textarea } from '../../ui';
import { useHrmsDb } from '../../../lib/hrms/db';
import type { Employee, HrmsDb } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import {
  TODAY, addDevice, resolveException, saveKioskRules, setClock, setDeviceStatus, setPin, sweepMissingOuts, unlockPerson, workforceStore,
} from '../../../lib/hrms/workforce/store';
import {
  EXCEPTION_LABEL, FLAG_LABEL, buildBoard, deviceOnline, fmtHm, kioskPeople, lastDigits, lockRemaining, parseHm, toAbs, type BoardRow, type BoardStatus,
} from '../../../lib/hrms/workforce/kioskEngine';
import type { KioskData, KioskDevice, KioskException, KioskRules, Punch } from '../../../lib/hrms/workforce/types';
import { ActionsHeader, ErrorLine, Panel, SimBadge, muted, strong, twoCol } from './shared';
import KioskModal from './KioskModal';

const STATUS: Record<BoardStatus, { tone: 'ok' | 'warn' | 'red' | 'neutral' | 'info'; word: string }> = {
  in: { tone: 'ok', word: 'On site' }, done: { tone: 'neutral', word: 'Finished' }, expected: { tone: 'info', word: 'Due later' },
  late_not_in: { tone: 'warn', word: 'Late, not in' }, off: { tone: 'neutral', word: 'Weekly off' }, missing_out: { tone: 'red', word: 'Missing OUT' },
};

function ResolveModal({ ex, name, onClose }: { ex: KioskException; name: string; onClose: () => void }) {
  const id = useId();
  const [note, setNote] = useState('');
  const [out, setOut] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const r = resolveException(ex.id, note, ex.kind === 'missing_out' && out ? parseHm(out) : undefined);
    if (!r.ok) { setError(r.error); return; }
    toast.success('Exception resolved.');
    onClose();
  };
  return (
    <Modal title={`Resolve: ${EXCEPTION_LABEL[ex.kind]}`} width={520} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Resolve</Button></>}>
      <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>{ex.detail} Ask {name} first. The note stays on the record.</div>
      <Field label="What did you find?" htmlFor={`${id}-n`} error={error}>
        <Textarea id={`${id}-n`} value={note} invalid={!!error} placeholder="For example: forgot to punch out, left at 06:10, supervisor confirmed" onChange={(e) => { setNote(e.target.value); setError(null); }} />
      </Field>
      {ex.kind === 'missing_out' && (
        <Field label="Real OUT time (optional)" htmlFor={`${id}-o`} hint="Adds a correction punch marked as added by HR.">
          <Input id={`${id}-o`} type="time" value={out} onChange={(e) => setOut(e.target.value)} style={{ maxWidth: 160 }} />
        </Field>
      )}
    </Modal>
  );
}

function DeviceModal({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [where, setWhere] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => { const r = addDevice(name, where); if (!r.ok) { setError(r.error); return; } toast.success('Tablet added.'); onClose(); };
  return (
    <Modal title="Add a tablet" width={480} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Add tablet</Button></>}>
      <Field label="Name" htmlFor={`${id}-n`} error={error}><Input id={`${id}-n`} value={name} placeholder="Gate 2 tablet" invalid={!!error} onChange={(e) => { setName(e.target.value); setError(null); }} /></Field>
      <Field label="Where it is" htmlFor={`${id}-w`}><Input id={`${id}-w`} value={where} placeholder="Bhiwandi Warehouse, rear gate" onChange={(e) => setWhere(e.target.value)} /></Field>
      <div style={muted}>In a live system the tablet is paired with a one-time code. Here it is only added to the list.</div>
    </Modal>
  );
}

function PinModal({ e, onClose }: { e: Employee; onClose: () => void }) {
  const id = useId();
  const [pin, setPinText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = () => { const r = setPin(e.id, pin); if (!r.ok) { setError(r.error); return; } toast.success(`PIN set for ${fullName(e)}. Any lockout is cleared.`); onClose(); };
  return (
    <Modal title={`Set PIN: ${fullName(e)}`} width={420} onClose={onClose} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save PIN</Button></>}>
      <Field label="New 4-digit PIN" htmlFor={`${id}-p`} error={error} hint="Shown only while you type. Tell the person in private.">
        <Input id={`${id}-p`} type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={pin} invalid={!!error} onChange={(ev) => { setPinText(ev.target.value.replace(/\D/g, '')); setError(null); }} style={{ maxWidth: 160 }} />
      </Field>
    </Modal>
  );
}

function RulesCard({ rules }: { rules: KioskRules }) {
  const id = useId();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, String(v)])));
  const [error, setError] = useState<string | null>(null);
  const fields: { key: keyof KioskRules; label: string }[] = [
    { key: 'duplicateWindowMin', label: 'Ignore a second punch within (minutes)' },
    { key: 'maxPinTries', label: 'Wrong PINs before a lockout' },
    { key: 'lockoutMin', label: 'Lockout length (minutes)' },
    { key: 'earlyWindowMin', label: 'Punch IN this early is normal (minutes)' },
    { key: 'lateWindowMin', label: 'Punch OUT this late is normal (minutes)' },
  ];
  const changed = fields.some((f) => draft[f.key] !== String(rules[f.key]));
  return (
    <Panel title="Punch rules" testId="rules-card">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
        {fields.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`${id}-${f.key}`}>
            <Input id={`${id}-${f.key}`} type="number" inputMode="numeric" min={1} value={draft[f.key]} onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setError(null); }} />
          </Field>
        ))}
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        <Button disabled={!changed} onClick={() => { const r = saveKioskRules({ ...rules, ...Object.fromEntries(fields.map((f) => [f.key, Number(draft[f.key])])) } as KioskRules); if (!r.ok) setError(r.error); else toast.success('Punch rules saved.'); }}>Save rules</Button>
        <span style={muted}>A doubtful punch is recorded and flagged, never refused. Only a double tap is ignored.</span>
      </div>
    </Panel>
  );
}

export default function KioskDashboard() {
  const db = useHrmsDb();
  const wf = workforceStore.use();
  const narrow = useIsCompact(900);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [addingDevice, setAddingDevice] = useState(false);
  const [pinFor, setPinFor] = useState<string | null>(null);

  // Raise an exception for anyone whose OUT is overdue. Raised once each, so running this on every change is safe.
  useEffect(() => { if (db && wf) sweepMissingOuts(); }, [db, wf]);

  const board = useMemo(() => (db && wf ? buildBoard(db, wf.kiosk, TODAY, wf.kiosk.clockMin) : []), [db, wf]);
  if (!db || !wf) return <Loading />;
  const k: KioskData = wf.kiosk;
  const name = (id: string) => { const e = db.employees.find((x) => x.id === id); return e ? fullName(e) : id; };
  const deviceName = (id: string) => k.devices.find((d) => d.id === id)?.name ?? id;
  const nowAbs = toAbs(TODAY, k.clockMin);

  const openEx = k.exceptions.filter((x) => x.status === 'open');
  const doneEx = k.exceptions.filter((x) => x.status === 'resolved');
  const lateIns = k.punches.filter((p) => p.date === TODAY && p.direction === 'in' && p.flags.includes('late') && p.result !== 'ignored');
  const lateNotIn = board.filter((b) => b.status === 'late_not_in');
  const onSite = board.filter((b) => b.status === 'in').length;
  const expected = board.filter((b) => b.status !== 'off').length;
  const online = k.devices.filter((d) => deviceOnline(d, TODAY, k.clockMin)).length;
  const recent = [...k.punches].sort((a, b) => toAbs(b.date, b.minute) - toAbs(a.date, a.minute) || b.id.localeCompare(a.id)).slice(0, 12);
  const resolvingEx = k.exceptions.find((x) => x.id === resolving);
  const pinPerson = db.employees.find((e) => e.id === pinFor);

  const rosterCols: Col<BoardRow & { id: string }>[] = [
    { key: 'emp', label: 'Employee', render: (b) => <EmployeeCell e={b.employee} href={false} />, sortValue: (b) => fullName(b.employee) },
    { key: 'shift', label: 'Shift', render: (b) => (b.plan.off ? 'Weekly off' : b.plan.shift ? <span>{b.plan.shift.name} <span style={{ color: T.mute }}>{b.plan.shift.start} to {b.plan.shift.end}</span>{!b.plan.rostered && <div style={{ fontSize: 11.5, color: T.mute }}>Default shift, no roster row this week</div>}</span> : 'None'), nowrap: true },
    { key: 'status', label: 'Now', render: (b) => <Badge tone={STATUS[b.status].tone} dot>{STATUS[b.status].word}</Badge>, nowrap: true, sortValue: (b) => b.status },
    { key: 'detail', label: 'Detail', render: (b) => <span style={{ fontSize: 13 }}>{b.detail}</span> },
    { key: 'in', label: 'IN', render: (b) => (b.firstIn ? fmtHm(b.firstIn.minute) : '—'), nowrap: true },
    { key: 'out', label: 'OUT', render: (b) => (b.lastOut ? fmtHm(b.lastOut.minute) : '—'), nowrap: true },
  ];
  const deviceCols: Col<KioskDevice>[] = [
    { key: 'name', label: 'Tablet', render: (d) => <div><div style={strong}>{d.name}</div><div style={{ fontSize: 12, color: T.mute }}>{d.location}</div></div> },
    { key: 'status', label: 'Status', render: (d) => (d.status === 'disabled' ? <Badge tone="red" dot>Disabled</Badge> : deviceOnline(d, TODAY, k.clockMin) ? <Badge tone="ok" dot>Online</Badge> : <Badge tone="warn" dot>Offline</Badge>), nowrap: true },
    { key: 'seen', label: 'Last seen', render: (d) => `${d.lastSeenDate === TODAY ? 'Today' : fmtDate(d.lastSeenDate)}, ${fmtHm(d.lastSeenMin)}`, nowrap: true },
    { key: 'added', label: 'Added', render: (d) => fmtDate(d.addedOn), nowrap: true },
    { key: 'act', label: <ActionsHeader />, align: 'right', render: (d) => (
      d.status === 'active'
        ? <Button size="sm" aria-label={`Disable ${d.name}`} onClick={() => { setDeviceStatus(d.id, 'disabled'); toast.success(`${d.name} disabled.`); }}>Disable</Button>
        : <Button size="sm" aria-label={`Enable ${d.name}`} onClick={() => { setDeviceStatus(d.id, 'active'); toast.success(`${d.name} enabled.`); }}>Enable</Button>
    ) },
  ];
  const punchCols: Col<Punch>[] = [
    { key: 'when', label: 'When', render: (p) => `${p.date === TODAY ? 'Today' : fmtDate(p.date)} ${fmtHm(p.minute)}`, nowrap: true },
    { key: 'who', label: 'Employee', render: (p) => name(p.employeeId) },
    { key: 'dir', label: '', render: (p) => <Badge tone={p.direction === 'in' ? 'ok' : 'info'}>{p.direction === 'in' ? 'IN' : 'OUT'}</Badge> },
    { key: 'dev', label: 'Tablet', render: (p) => (p.source === 'correction' ? 'Added by HR' : deviceName(p.deviceId)), nowrap: true },
    { key: 'res', label: 'Result', render: (p) => <Badge tone={p.result === 'accepted' ? 'ok' : p.result === 'flagged' ? 'warn' : 'neutral'} dot>{p.result === 'accepted' ? 'Accepted' : p.result === 'flagged' ? 'Flagged' : 'Ignored'}</Badge>, nowrap: true },
    { key: 'flags', label: 'Notes', render: (p) => (p.flags.length ? p.flags.map((f) => FLAG_LABEL[f]).join(', ') : p.note ?? '—') },
  ];
  const people = kioskPeople(db);

  return (
    <HrmsPage
      eyebrow="HRMS · Site kiosk"
      title="Site kiosk"
      description="Attendance for sites where people do not carry smartphones: a shared tablet at the warehouse gate, with an employee number and a PIN."
      actions={<Button variant="primary" data-testid="open-kiosk" onClick={() => setOpen(true)}>Open kiosk mode</Button>}
    >
      <Note tone="warn">
        <b>Preview.</b> The tablet is a simulation on sample data. <b>Face match is simulated</b>: no photo is taken and no biometric data is captured or stored. The clock below is a preview clock, so you can try late and out-of-shift punches.
      </Note>

      <StatGrid>
        <Stat label="On site now" value={`${onSite} of ${expected}`} hint="Of the people due today" />
        <Stat label="Late today" value={lateIns.length + lateNotIn.length} tone={lateIns.length + lateNotIn.length ? 'warn' : 'ok'} hint={`${lateNotIn.length} not in yet`} />
        <Stat label="Missing OUT" value={openEx.filter((x) => x.kind === 'missing_out').length} tone={openEx.some((x) => x.kind === 'missing_out') ? 'red' : 'ok'} hint="Shift ended, no OUT" />
        <Stat label="Open exceptions" value={openEx.length} tone={openEx.length ? 'warn' : 'ok'} hint={`${doneEx.length} resolved`} />
        <Stat label="Tablets online" value={`${online} of ${k.devices.length}`} hint="Seen in the last 15 minutes" />
      </StatGrid>

      <Panel title="Today at Bhiwandi Warehouse" testId="roster" right={
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={muted} data-testid="site-time">{fmtDate(TODAY)}, {fmtHm(k.clockMin)} <SimBadge>Preview clock</SimBadge></span>
          <Button size="sm" aria-label="Move preview clock forward 15 minutes" onClick={() => setClock(k.clockMin + 15)}>+15 min</Button>
          <Button size="sm" aria-label="Move preview clock forward 1 hour" onClick={() => setClock(k.clockMin + 60)}>+1 hour</Button>
        </span>
      }>
        <DataTable columns={rosterCols} rows={board.map((b) => ({ ...b, id: b.employee.id }))} minWidth={780} empty="Nobody is rostered at this site." />
        <div style={{ ...muted, marginTop: 10 }}>The roster comes from Time and Leave. People without a roster row for the week use their default shift. A night shift belongs to the day it starts.</div>
      </Panel>

      <div style={twoCol(narrow, 420)}>
        <Panel title="Late arrivals today" testId="late">
          {lateIns.length + lateNotIn.length === 0 ? <div style={{ fontSize: 13.5, color: T.dim }}>Nobody is late.</div> : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lateIns.map((p) => {
                const b = board.find((x) => x.employee.id === p.employeeId);
                return <li key={p.id} style={{ fontSize: 13.5 }}><span style={strong}>{name(p.employeeId)}</span> punched IN at {fmtHm(p.minute)}{b?.lateBy ? `, ${b.lateBy} minutes after the shift start` : ''}.</li>;
              })}
              {lateNotIn.map((b) => <li key={b.employee.id} style={{ fontSize: 13.5 }}><span style={strong}>{fullName(b.employee)}</span> is {b.lateBy} minutes past the shift start and has not punched IN.</li>)}
            </ul>
          )}
          <div style={{ ...muted, marginTop: 10 }}>Late is counted after the shift grace period. This is information for the supervisor, not a penalty.</div>
        </Panel>

        <Panel title="Exceptions" testId="exceptions" right={<Badge tone={openEx.length ? 'warn' : 'ok'}>{openEx.length} open</Badge>}>
          {openEx.length === 0 ? <div style={{ fontSize: 13.5, color: T.dim }}>No open exceptions.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {openEx.map((x) => (
                <div key={x.id} data-testid={`exception-${x.id}`} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '10px 12px', background: x.kind === 'missing_out' ? T.redWash : T.warnWash }}>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                      <Badge tone={x.kind === 'missing_out' ? 'red' : 'warn'}>{EXCEPTION_LABEL[x.kind]}</Badge>
                      <div style={{ fontSize: 13.5, marginTop: 6, lineHeight: 1.5 }}>{x.detail}</div>
                    </div>
                    <Button size="sm" aria-label={`Resolve exception: ${x.detail}`} onClick={() => setResolving(x.id)}>Resolve</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {doneEx.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12.5, color: T.dim }}>{doneEx.length} resolved</summary>
              <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {doneEx.map((x) => (
                  <li key={x.id} data-testid={`resolved-${x.id}`} style={{ fontSize: 13, lineHeight: 1.5 }}>
                    <Badge tone="ok" dot>Resolved</Badge> {x.detail} <span style={{ color: T.dim }}>{x.resolution} ({x.resolvedBy}, {fmtDate(x.resolvedOn)})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div style={{ ...muted, marginTop: 10 }}>The person is asked before anything changes. Resolving needs a note, and nothing here affects pay by itself.</div>
        </Panel>
      </div>

      <Panel title="Tablets" testId="devices" right={<Button size="sm" onClick={() => setAddingDevice(true)}>Add tablet</Button>}>
        <DataTable columns={deviceCols} rows={k.devices} minWidth={640} empty="No tablets yet." />
      </Panel>

      <Panel title="Recent punches" testId="punch-feed" right={<span style={muted}>Latest 12</span>}>
        <DataTable columns={punchCols} rows={recent} minWidth={700} empty="No punches yet. Open kiosk mode to make one." />
      </Panel>

      <Panel title="People and PINs" testId="pins" right={<span style={muted}>HR sets a PIN. It is never shown here.</span>}>
        <DataTable
          columns={[
            { key: 'emp', label: 'Employee', render: (e: Employee) => <EmployeeCell e={e} href={false} /> },
            { key: 'num', label: 'Number', render: (e: Employee) => <span style={{ fontFamily: T.mono }}>{lastDigits(e)}</span>, nowrap: true },
            { key: 'pin', label: 'PIN', render: (e: Employee) => {
              const left = lockRemaining(k.locks[e.id], nowAbs);
              return left > 0 ? <Badge tone="red" dot>{`Locked, ${left} min left`}</Badge> : k.pins[e.id] ? <Badge tone="ok" dot>Set</Badge> : <Badge tone="warn" dot>Not set</Badge>;
            } },
            { key: 'tries', label: 'Wrong tries', render: (e: Employee) => k.locks[e.id]?.tries ?? 0, align: 'right' },
            { key: 'act', label: <ActionsHeader />, align: 'right', render: (e: Employee) => (
              <span style={{ display: 'inline-flex', gap: 6 }}>
                <Button size="sm" aria-label={`Set PIN for ${fullName(e)}`} onClick={() => setPinFor(e.id)}>Set PIN</Button>
                <Button size="sm" aria-label={`Unlock ${fullName(e)}`} disabled={lockRemaining(k.locks[e.id], nowAbs) === 0 && !(k.locks[e.id]?.tries)} onClick={() => { unlockPerson(e.id); toast.success(`${fullName(e)} unlocked.`); }}>Unlock</Button>
              </span>
            ) },
          ] as Col<Employee>[]}
          rows={people} minWidth={620} empty="Nobody is based at this site."
        />
      </Panel>

      <RulesCard key={JSON.stringify(k.rules)} rules={k.rules} />

      <Panel title="Privacy (DPDP)" testId="dpdp">
        <ul style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13.5, lineHeight: 1.7, color: T.text }}>
          <li>No biometrics are stored. The kiosk shows a photo placeholder and the face match step is simulated.</li>
          <li>The kiosk keeps the employee number, PIN checks and punch times only.</li>
          <li>Punch records and kiosk logs are kept for {k.rules.retentionDays} days on the tablet side, then deleted. Attendance totals stay in payroll records. <Badge tone="red">Sample, confirm</Badge></li>
          <li>People are told what the kiosk records before they use it. The notice wording is for your advisor to confirm.</li>
        </ul>
      </Panel>

      {open && <KioskModal db={db as HrmsDb} kiosk={k} onClose={() => setOpen(false)} />}
      {resolvingEx && <ResolveModal ex={resolvingEx} name={name(resolvingEx.employeeId)} onClose={() => setResolving(null)} />}
      {addingDevice && <DeviceModal onClose={() => setAddingDevice(false)} />}
      {pinPerson && <PinModal e={pinPerson} onClose={() => setPinFor(null)} />}
    </HrmsPage>
  );
}

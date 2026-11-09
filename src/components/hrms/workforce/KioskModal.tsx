'use client';
// Kiosk mode: a full-screen, tablet-style attendance screen for a shared tablet at a gate. Employee number, PIN, name
// confirmation, a SIMULATED face match step, then a big IN or OUT. No biometric data is captured or stored anywhere.
// The clock is the preview clock: the preview day plus a time of day that ticks from state after mount.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, T } from '../ui';
import { Select } from '../../ui';
import type { HrmsDb, Employee } from '../../../lib/hrms/types';
import { fmtDate, fullName } from '../../../lib/hrms/format';
import { TODAY, attemptPin, recordPunch, setClock } from '../../../lib/hrms/workforce/store';
import {
  counted, fmtHm, fmtHms, kioskPeople, lastDigits, lockRemaining, planFor, toAbs, type PunchOutcome,
} from '../../../lib/hrms/workforce/kioskEngine';
import type { KioskData } from '../../../lib/hrms/workforce/types';
import { SimBadge } from './shared';

type Stage = 'id' | 'pin' | 'confirm' | 'result' | 'locked';
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RESULT_SECONDS = 10;

const bigBtn = (extra: React.CSSProperties = {}): React.CSSProperties => ({
  fontFamily: 'inherit', cursor: 'pointer', borderRadius: 16, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, fontWeight: 600, ...extra,
});

// Flex, not a grid with fr columns: globals.css collapses inline fr grids to one column below 1024px, which would stack the keys.
const KEY: React.CSSProperties = { flex: '0 0 calc((100% - 24px) / 3)', height: 68 };
function Pad({ onDigit, onClear, onBack }: { onDigit: (d: string) => void; onClear: () => void; onBack: () => void }) {
  return (
    <div data-testid="kiosk-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, width: '100%', maxWidth: 360 }}>
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" onClick={() => onDigit(d)} style={bigBtn({ ...KEY, fontSize: 28 })}>{d}</button>)}
      <button type="button" onClick={onClear} style={bigBtn({ ...KEY, fontSize: 15, color: T.dim })}>Clear</button>
      <button type="button" onClick={() => onDigit('0')} style={bigBtn({ ...KEY, fontSize: 28 })}>0</button>
      <button type="button" aria-label="Delete last digit" onClick={onBack} style={bigBtn({ ...KEY, fontSize: 15, color: T.dim })}>Delete</button>
    </div>
  );
}

function Slots({ value, mask, label }: { value: string; mask?: boolean; label: string }) {
  return (
    <div role="img" aria-label={`${label}: ${value.length} of 4 digits entered`} data-testid="kiosk-slots" style={{ display: 'flex', gap: 12 }}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: 56, height: 68, borderRadius: 14, border: `2px solid ${i === value.length ? T.info : T.border}`, background: T.field, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontFamily: T.mono, color: T.text }}>
          {value[i] ? (mask ? '•' : value[i]) : ''}
        </span>
      ))}
    </div>
  );
}

function Icon({ kind }: { kind: 'ok' | 'warn' | 'info' | 'lock' }) {
  const color = kind === 'ok' ? T.ok : kind === 'warn' ? T.warn : kind === 'lock' ? T.red : T.info;
  const bg = kind === 'ok' ? T.okWash : kind === 'warn' ? T.warnWash : kind === 'lock' ? T.redWash : T.infoWash;
  return (
    <span aria-hidden style={{ width: 96, height: 96, borderRadius: 999, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {kind === 'ok' && <path d="M5 13l4 4L19 7" />}
        {kind === 'warn' && <><path d="M12 8v5" /><path d="M12 17h.01" /></>}
        {kind === 'info' && <><path d="M12 11v5" /><path d="M12 8h.01" /></>}
        {kind === 'lock' && <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></>}
      </svg>
    </span>
  );
}

export default function KioskModal({ db, kiosk, onClose }: { db: HrmsDb; kiosk: KioskData; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const firstActive = kiosk.devices.find((d) => d.status === 'active')?.id ?? '';
  const [deviceId, setDeviceId] = useState(firstActive);
  const [stage, setStage] = useState<Stage>('id');
  const [digits, setDigits] = useState('');
  const [pin, setPin] = useState('');
  const [person, setPerson] = useState<Employee | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<(PunchOutcome & { direction: 'in' | 'out'; at: string }) | null>(null);
  const [faceFail, setFaceFail] = useState(false);
  const [face, setFace] = useState<'ok' | 'fail'>('ok');
  const [secs, setSecs] = useState(0);

  const device = kiosk.devices.find((d) => d.id === deviceId);
  const nowMin = Math.min(1439, kiosk.clockMin + Math.floor(secs / 60));
  const people = kioskPeople(db);

  // The ticking clock starts after mount, so the server and the first client paint agree.
  useEffect(() => { const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { ref.current?.focus(); const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = prev; }; }, []);

  /** Make the minute on screen the stored preview time, keeping the seconds. */
  const commit = useCallback((): number => { setClock(nowMin); setSecs((s) => s % 60); return nowMin; }, [nowMin]);
  const advance = (min: number) => { const to = Math.min(1439, nowMin + min); setClock(to); setSecs((s) => s % 60); };

  const reset = useCallback(() => { setStage('id'); setDigits(''); setPin(''); setPerson(null); setMsg(null); setOutcome(null); }, []);
  useEffect(() => { if (stage !== 'result') return; const t = setTimeout(reset, RESULT_SECONDS * 1000); return () => clearTimeout(t); }, [stage, reset]);

  const lookup = (num: string) => {
    const p = people.find((e) => lastDigits(e) === num);
    if (!p) { setMsg('That employee number was not found. Check the last four digits of your ID.'); setDigits(''); return; }
    const left = lockRemaining(kiosk.locks[p.id], toAbs(TODAY, nowMin));
    setPerson(p);
    if (left > 0) { setMsg(`Too many wrong PINs. Try again in ${left} ${left === 1 ? 'minute' : 'minutes'}, or ask your supervisor.`); setStage('locked'); return; }
    setMsg(null); setStage('pin');
  };
  const submitPin = (entered: string) => {
    if (!person) return;
    const at = commit();
    const res = attemptPin(person.id, entered, at);
    if (res.ok) { setMsg(null); setFace(faceFail ? 'fail' : 'ok'); setStage('confirm'); return; }
    setMsg(res.message); setPin('');
    if (res.locked) setStage('locked');
  };
  const press = (d: string) => {
    if (stage === 'id') { const n = (digits + d).slice(0, 4); setDigits(n); setMsg(null); if (n.length === 4) lookup(n); }
    else if (stage === 'pin') { const n = (pin + d).slice(0, 4); setPin(n); if (n.length === 4) submitPin(n); }
  };
  const back = () => { setMsg(null); if (stage === 'id') setDigits((x) => x.slice(0, -1)); else if (stage === 'pin') setPin((x) => x.slice(0, -1)); };
  const clear = () => { setMsg(null); if (stage === 'id') setDigits(''); else if (stage === 'pin') setPin(''); };

  const punch = (direction: 'in' | 'out') => {
    if (!person || !device) return;
    const at = commit();
    const r = recordPunch({ employeeId: person.id, direction, deviceId: device.id, nowMin: at });
    if (!r.ok) { setMsg(r.error); return; }
    setOutcome({ ...r.value, direction, at: fmtHm(at) });
    setStage('result');
  };

  // Physical keyboard works too (handy on a desktop demo). Typing in the helper panel's fields is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { onClose(); return; }
      if (stage !== 'id' && stage !== 'pin') return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const last = person ? counted(kiosk.punches.filter((p) => p.employeeId === person.id)).slice(-1)[0] : undefined;
  const suggest: 'in' | 'out' = last?.direction === 'in' ? 'out' : 'in';
  const plan = person ? planFor(db, person, TODAY) : null;
  const dow = WEEKDAYS[new Date(`${TODAY}T00:00:00Z`).getUTCDay()];
  const code = person ? lastDigits(person) : '';

  const screen = (() => {
    if (!device || device.status !== 'active') {
      return (
        <Centered><Icon kind="lock" /><h2 style={h2}>This tablet is switched off</h2><p style={sub}>HR has disabled this tablet. Please use another gate or ask your supervisor.</p></Centered>
      );
    }
    if (stage === 'locked') {
      return (
        <Centered><Icon kind="lock" /><h2 style={h2}>Locked for now</h2><p role="alert" style={sub} data-testid="kiosk-message">{msg}</p><button type="button" onClick={reset} style={bigBtn({ height: 60, padding: '0 36px', fontSize: 18 })}>Back</button></Centered>
      );
    }
    if (stage === 'result' && outcome) {
      const kind = outcome.result === 'accepted' ? 'ok' : outcome.result === 'flagged' ? 'warn' : 'info';
      return (
        <Centered testId={`kiosk-result-${outcome.result}`}>
          <Icon kind={kind} />
          <h2 style={h2} data-testid="kiosk-headline">{outcome.headline}</h2>
          <p style={sub} data-testid="kiosk-message">{outcome.message}</p>
          <p style={{ ...sub, fontSize: 13 }}>{person ? fullName(person) : ''} · {outcome.at} · back to the start screen in {RESULT_SECONDS} seconds</p>
          <button type="button" onClick={reset} style={bigBtn({ height: 60, padding: '0 36px', fontSize: 18 })}>Done</button>
        </Centered>
      );
    }
    if (stage === 'confirm' && person) {
      return (
        <Centered>
          <div aria-hidden style={{ width: 120, height: 120, borderRadius: 999, background: T.raised, border: `2px dashed ${T.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.mute }}>
            <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round"><circle cx="12" cy="9" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
          </div>
          <div style={{ ...sub, fontSize: 12 }}>Photo placeholder. Nothing is captured.</div>
          <h2 style={{ ...h2, marginTop: 4 }} data-testid="kiosk-name">Is this you, {person.firstName} {person.lastName[0]}.?</h2>
          <div style={{ ...sub, fontSize: 14 }}>{plan?.shift ? `${plan.shift.name} shift, ${plan.shift.start} to ${plan.shift.end}` : 'No shift set'}{plan?.off ? ' (weekly off today)' : ''} · last punch {last ? `${last.direction === 'in' ? 'IN' : 'OUT'} at ${fmtHm(last.minute)}` : 'none'}</div>
          <div data-testid="kiosk-face" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', fontSize: 14, color: face === 'ok' ? T.ok : T.red }}>
            <SimBadge>Simulated face match</SimBadge>
            {face === 'ok' ? 'Matched (simulated). No photo is taken and no biometric data is stored.' : 'No match (simulated). Try again, or ask your supervisor.'}
          </div>
          {msg && <p role="alert" style={{ ...sub, color: T.red }}>{msg}</p>}
          {face === 'fail' ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <button type="button" onClick={() => setFace(faceFail ? 'fail' : 'ok')} style={bigBtn({ height: 60, padding: '0 32px', fontSize: 18 })}>Try again</button>
              <button type="button" onClick={reset} style={bigBtn({ height: 60, padding: '0 32px', fontSize: 18 })}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 520 }}>
              <button type="button" data-testid="kiosk-in" onClick={() => punch('in')} style={bigBtn({ flex: 1, height: 96, fontSize: 30, background: T.okWash, color: T.ok, border: `${suggest === 'in' ? 3 : 1}px solid ${T.ok}` })}>IN</button>
              <button type="button" data-testid="kiosk-out" onClick={() => punch('out')} style={bigBtn({ flex: 1, height: 96, fontSize: 30, background: T.infoWash, color: T.info, border: `${suggest === 'out' ? 3 : 1}px solid ${T.info}` })}>OUT</button>
            </div>
          )}
          {face !== 'fail' && <button type="button" onClick={reset} style={{ ...bigBtn({ height: 44, padding: '0 20px', fontSize: 14, color: T.dim, border: '1px solid transparent', background: 'transparent' }) }}>Not me, start again</button>}
        </Centered>
      );
    }
    const isPin = stage === 'pin';
    return (
      <Centered>
        <h2 style={h2}>{isPin ? `Employee ${code}: enter your PIN` : 'Enter your employee number'}</h2>
        <p style={sub}>{isPin ? 'Your 4-digit PIN.' : 'The last 4 digits of your employee ID, for example 1012 for MER-1012.'}</p>
        <Slots value={isPin ? pin : digits} mask={isPin} label={isPin ? 'PIN' : 'Employee number'} />
        <div style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>{msg && <p role="alert" data-testid="kiosk-message" style={{ ...sub, color: T.red, margin: 0 }}>{msg}</p>}</div>
        <Pad onDigit={press} onClear={clear} onBack={back} />
        {isPin && <button type="button" onClick={reset} style={bigBtn({ height: 44, padding: '0 20px', fontSize: 14, color: T.dim, border: '1px solid transparent', background: 'transparent' })}>Not me, start again</button>}
      </Centered>
    );
  })();

  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Site kiosk" tabIndex={-1} data-testid="kiosk-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'var(--canvas)', overflowY: 'auto', outline: 'none', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: T.panel, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: T.dim }}><b style={{ color: T.text }}>Kiosk mode</b> · full screen · preview</span>
        <Button size="sm" data-testid="exit-kiosk" onClick={onClose}>Exit kiosk mode</Button>
      </div>
      <div style={{ flex: 1, display: 'flex', gap: 16, padding: 16, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ flex: '1 1 560px', maxWidth: 900, minWidth: 0, border: `10px solid ${T.rule}`, borderRadius: 32, background: T.card, overflow: 'hidden', boxShadow: '0 20px 50px -20px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', minHeight: 640 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 22px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontFamily: T.heading, fontWeight: 700, fontSize: 18, color: T.text }}>Bhiwandi Warehouse</div>
              <div style={{ fontSize: 13, color: T.dim }}>{device ? `${device.name} · ${device.location}` : 'No tablet'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div data-testid="kiosk-clock" style={{ fontFamily: T.mono, fontSize: 34, fontWeight: 600, color: T.text, lineHeight: 1 }}>{fmtHms(nowMin, secs % 60)}</div>
              <div style={{ fontSize: 13, color: T.dim, marginTop: 4 }}>{dow}, {fmtDate(TODAY)}</div>
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex' }}>{screen}</div>
        </div>

        <aside aria-label="Preview helper" data-testid="kiosk-helper" style={{ flex: '0 1 320px', minWidth: 260, border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><b style={{ fontSize: 14, color: T.text }}>Preview helper</b><Badge tone="neutral">Not on a real tablet</Badge></div>
          <div>
            <label htmlFor="kiosk-device" style={{ fontSize: 12.5, color: T.dim }}>This tablet is</label>
            <Select id="kiosk-device" aria-label="This tablet" value={deviceId} onChange={(e) => { setDeviceId(e.target.value); reset(); }}>
              {kiosk.devices.map((d) => <option key={d.id} value={d.id}>{d.name}{d.status === 'disabled' ? ' (disabled)' : ''}</option>)}
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 6 }}>Preview clock: {fmtHm(nowMin)}. The time is simulated. Move it to try late, early and out-of-shift punches.</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <Button size="sm" onClick={() => advance(1)}>+1 min</Button>
              <Button size="sm" onClick={() => advance(15)}>+15 min</Button>
              <Button size="sm" onClick={() => advance(60)}>+1 hour</Button>
            </div>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: T.text }}>
            <input type="checkbox" checked={faceFail} onChange={(e) => setFaceFail(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--info)' }} />
            Simulate a face match failure
          </label>
          <div>
            <div style={{ fontSize: 12.5, color: T.dim, marginBottom: 6 }}>Sample logins. A real kiosk never shows PINs.</div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {people.map((e) => (
                <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: T.text }}>
                  <span>{fullName(e)}</span>
                  <span style={{ fontFamily: T.mono, color: T.dim }}>{lastDigits(e)} · {kiosk.pins[e.id] ?? 'no PIN'}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

const h2: React.CSSProperties = { margin: 0, fontFamily: T.heading, fontSize: 28, fontWeight: 700, color: T.text, textAlign: 'center', lineHeight: 1.2 };
const sub: React.CSSProperties = { margin: 0, fontSize: 15, color: T.dim, textAlign: 'center', lineHeight: 1.5, maxWidth: 460 };
function Centered({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return <div data-testid={testId} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px 16px' }}>{children}</div>;
}

'use client';
/**
 * Settings → Operational rules → "Attendance & shift rules".
 *
 * Per-client rules (shift window, late grace, weekly offs, offline check-in, selfie, form check-in/out) stored by
 * the backend at clients.settings.attendance_rules. Self-contained: loads GET /org-settings/attendance-rules, saves with PATCH,
 * and reloads whenever the global client picker changes (the rules belong to one client, so an org-wide view
 * has nothing to show and the API answers 400 "Select a client first").
 *
 * Nothing in here is decorative: every control below is part of the saved body.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import api, { type ApiError, type AttendanceRules, type AttendanceRulesPayload } from '../lib/api';
import { useClient } from '../context/ClientContext';
import { Badge, Button, Eyebrow, Field, Input, T } from './ui';

const DAYS = [
  { n: 0, short: 'Sun', full: 'Sunday' },
  { n: 1, short: 'Mon', full: 'Monday' },
  { n: 2, short: 'Tue', full: 'Tuesday' },
  { n: 3, short: 'Wed', full: 'Wednesday' },
  { n: 4, short: 'Thu', full: 'Thursday' },
  { n: 5, short: 'Fri', full: 'Friday' },
  { n: 6, short: 'Sat', full: 'Saturday' },
];

// Used only if the server omits `defaults` / `bounds` (it should not): the contract's resolved defaults.
const FALLBACK_DEFAULTS: AttendanceRules = {
  shift_start: '09:30', shift_end: '18:00', grace_minutes: 15, weekly_off: [0], allow_offline_checkin: false,
  selfie_required: true, form_checkin_required: false,
};
const FALLBACK_BOUNDS = { min: 0, max: 120 };

type Phase = 'loading' | 'ready' | 'needs-client' | 'error';

/** What the form edits. Grace is text so a half-typed number is not forced back into range mid-keystroke. */
interface Draft {
  shift_start: string; shift_end: string; grace: string; weekly_off: number[];
  allow_offline_checkin: boolean; selfie_required: boolean; form_checkin_required: boolean;
}
/** What the card holds after a load / save. `flags` = the server knows the selfie / form check-in rules (see readPayload). */
type Loaded = AttendanceRulesPayload & { flags: boolean };

const sortedDays = (d: number[]) => [...d].sort((a, b) => a - b);
const toDraft = (r: AttendanceRules): Draft => ({
  shift_start: String(r.shift_start || '').slice(0, 5),
  shift_end: String(r.shift_end || '').slice(0, 5),
  grace: String(r.grace_minutes ?? ''),
  weekly_off: sortedDays(Array.isArray(r.weekly_off) ? r.weekly_off : []),
  allow_offline_checkin: !!r.allow_offline_checkin,
  // A selfie is required unless the client turned it off; an unknown value reads as required.
  selfie_required: r.selfie_required !== false,
  form_checkin_required: r.form_checkin_required === true,
});
const sameDraft = (a: Draft, b: Draft) =>
  a.shift_start === b.shift_start && a.shift_end === b.shift_end && a.grace.trim() === b.grace.trim()
  && a.allow_offline_checkin === b.allow_offline_checkin
  && a.selfie_required === b.selfie_required && a.form_checkin_required === b.form_checkin_required
  && sortedDays(a.weekly_off).join(',') === sortedDays(b.weekly_off).join(',');

/** Accepts `{success, data:{…}}` (what the API sends) or the bare payload. */
function readPayload(res: any): Loaded | null {
  const d = res?.data && typeof res.data === 'object' && 'rules' in res.data ? res.data : res;
  if (!d || typeof d !== 'object' || !d.rules || typeof d.rules !== 'object') return null;
  const grace = d.bounds?.grace_minutes;
  return {
    // A server that predates the selfie / form check-in rules does not send them — and rejects a PATCH that
    // names a key it does not know. So the two switches only appear (and are only sent) when the server sent them.
    flags: typeof d.rules.selfie_required === 'boolean' || typeof d.rules.form_checkin_required === 'boolean',
    configured: !!d.configured,
    rules: { ...FALLBACK_DEFAULTS, ...d.rules },
    defaults: { ...FALLBACK_DEFAULTS, ...(d.defaults || {}) },
    bounds: { grace_minutes: grace && Number.isFinite(grace.min) && Number.isFinite(grace.max) ? grace : FALLBACK_BOUNDS },
  };
}

const errMessage = (e: unknown, fallback: string) => (e as Error)?.message || fallback;
/** The API answers 400 "Select a client first" when neither the token nor X-Client-Id names a client. */
const isNoClient = (e: unknown, anyBadRequest: boolean) => {
  const err = e as ApiError;
  return /select a client/i.test(err?.message || '') || (anyBadRequest && err?.status === 400);
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A labelled on/off switch (role="switch"); the label and hint are what assistive tech announces. */
function SwitchRow({ id, checked, disabled, onChange, label, hint }: {
  id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string; hint: string;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <button
        type="button" role="switch" aria-checked={checked}
        aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`}
        onClick={() => onChange(!checked)}
        style={{
          flexShrink: 0, width: 38, height: 22, marginTop: 1, padding: 2, borderRadius: 999, boxSizing: 'border-box',
          border: `1px solid ${checked ? T.info : T.borderStrong}`,
          background: checked ? T.info : T.card,
          cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: checked ? 'flex-end' : 'flex-start', transition: 'background .12s ease',
        }}
      >
        <span style={{ width: 16, height: 16, borderRadius: 999, background: checked ? '#FFFFFF' : T.mute }} />
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div id={`${id}-label`} style={{ fontSize: 13.5, fontWeight: 500, color: T.text }}>{label}</div>
        <div id={`${id}-hint`} style={{ fontSize: 12, color: T.mute }}>{hint}</div>
      </div>
    </div>
  );
}

export default function AttendanceRulesCard() {
  const { selectedClientId } = useClient();
  const [phase, setPhase] = useState<Phase>('loading');
  const [loadError, setLoadError] = useState('');
  const [payload, setPayload] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Bumped on every (re)load; a response that comes back for an older load (or an older client) is dropped.
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setPhase('loading');
    setLoadError('');
    setSaveError('');
    try {
      const res = await api.getAttendanceRules();
      if (id !== reqId.current) return;
      const p = readPayload(res);
      if (!p) throw new Error('The server sent an unexpected response.');
      setPayload(p);
      setDraft(toDraft(p.rules));
      setPhase('ready');
    } catch (e) {
      if (id !== reqId.current) return;
      setPayload(null);
      setDraft(null);
      if (isNoClient(e, true)) { setPhase('needs-client'); return; }
      setLoadError(errMessage(e, 'Could not load attendance rules.'));
      setPhase('error');
    }
  }, []);

  // Reload when the global client picker changes: the rules are per client.
  useEffect(() => { load(); }, [load, selectedClientId]);

  const bounds = payload?.bounds.grace_minutes ?? FALLBACK_BOUNDS;
  const graceText = draft?.grace.trim() ?? '';
  const graceNum = /^\d+$/.test(graceText) ? Number(graceText) : NaN;
  const graceError = Number.isInteger(graceNum) && graceNum >= bounds.min && graceNum <= bounds.max
    ? '' : `Enter a whole number from ${bounds.min} to ${bounds.max}.`;
  const startError = draft && !TIME_RE.test(draft.shift_start) ? 'Pick a start time.' : '';
  const endError = draft && !TIME_RE.test(draft.shift_end) ? 'Pick an end time.' : '';
  const valid = !!draft && !graceError && !startError && !endError;
  const dirty = !!draft && !!payload && !sameDraft(draft, toDraft(payload.rules));
  const configured = !!payload?.configured;
  // Only a change can be saved: the form shows the defaults for a client that stored nothing, and showing a default
  // is not choosing it (saving it would write the shift keys, which is what switches rule-based late marking on).
  const canSave = valid && dirty && !saving;

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const toggleDay = (n: number) =>
    setDraft((d) => (d ? { ...d, weekly_off: d.weekly_off.includes(n) ? d.weekly_off.filter((x) => x !== n) : sortedDays([...d.weekly_off, n]) } : d));

  const save = async () => {
    if (!draft || !payload || !canSave) return;
    // Send ONLY what the admin changed, compared with the rules the server resolved. Writing a shift key is what
    // turns on rule-based late marking for a client, so switching e.g. the selfie rule must not also write a shift
    // window nobody chose — and a default the form merely displays is not a change.
    const base = toDraft(payload.rules);
    const body: Partial<AttendanceRules> = {};
    if (draft.shift_start !== base.shift_start) body.shift_start = draft.shift_start;
    if (draft.shift_end !== base.shift_end) body.shift_end = draft.shift_end;
    if (draft.grace.trim() !== base.grace.trim()) body.grace_minutes = graceNum;
    if (sortedDays(draft.weekly_off).join(',') !== sortedDays(base.weekly_off).join(',')) body.weekly_off = sortedDays(draft.weekly_off);
    if (draft.allow_offline_checkin !== base.allow_offline_checkin) body.allow_offline_checkin = draft.allow_offline_checkin;
    if (payload.flags) {
      if (draft.selfie_required !== base.selfie_required) body.selfie_required = draft.selfie_required;
      if (draft.form_checkin_required !== base.form_checkin_required) body.form_checkin_required = draft.form_checkin_required;
    }
    if (Object.keys(body).length === 0) return; // nothing changed: nothing to send
    const id = reqId.current;
    setSaving(true);
    setSaveError('');
    try {
      const res = await api.updateAttendanceRules(body);
      toast.success('Attendance rules saved');
      if (id !== reqId.current) return; // the client changed while saving: this answer is for the old one
      const p = readPayload(res);
      const next: Loaded = p ?? { ...payload, configured: true, rules: { ...payload.rules, ...body } };
      setPayload(next);
      setDraft(toDraft(next.rules));
    } catch (e) {
      if (isNoClient(e, false)) {
        toast.error('Select a client first', { description: 'Attendance rules belong to one client.' });
        if (id === reqId.current) { setPhase('needs-client'); setPayload(null); setDraft(null); }
      } else {
        const msg = errMessage(e, 'Unknown error');
        toast.error('Attendance rules were not saved', { description: msg });
        if (id === reqId.current) setSaveError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const defaults = payload?.defaults ?? FALLBACK_DEFAULTS;
  const defaultsText = `${defaults.shift_start}–${defaults.shift_end}, ${defaults.grace_minutes} min grace, ${
    defaults.weekly_off.length ? `${sortedDays(defaults.weekly_off).map((n) => DAYS[n]?.full).join(' & ')} off` : 'no weekly off'}`;

  return (
    <div
      style={{ background: T.raised, border: `1px solid ${T.border}`, borderRadius: 8, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}
      aria-busy={phase === 'loading' || saving}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>Attendance & shift rules</Eyebrow>
          <div style={{ fontSize: 13, color: T.dim }}>Shift window, late grace, weekly offs and check-in options for the selected client.</div>
        </div>
        {phase === 'ready' && (
          <Badge tone={configured ? 'ok' : 'neutral'} dot>{configured ? 'Configured' : 'Using defaults'}</Badge>
        )}
      </div>

      {phase === 'loading' && <div style={{ fontSize: 13, color: T.mute }}>Loading attendance rules…</div>}

      {phase === 'needs-client' && (
        <div role="status" style={{ background: T.infoWash, border: `1px solid ${T.info}`, borderRadius: 8, padding: '12px 14px', fontSize: 13, color: T.text, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600 }}>Select a client first</div>
          <div style={{ color: T.dim, marginTop: 2 }}>
            Attendance rules are set per client. Pick a client in the client switcher at the top of the page, then come back to this tab.
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div role="alert" style={{ background: T.redWash, border: `1px solid ${T.red}`, borderRadius: 8, padding: '12px 14px', fontSize: 13, color: T.red, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: 200 }}>{loadError}</span>
          <Button size="sm" onClick={load}>Retry</Button>
        </div>
      )}

      {phase === 'ready' && draft && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
          {/* One disabled fieldset = the whole form is inert while a save is in flight. */}
          <fieldset disabled={saving} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {!configured && (
              <div role="status" style={{ background: T.infoWash, borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: T.dim, lineHeight: 1.5 }}>
                <span style={{ color: T.text, fontWeight: 600 }}>Not configured yet — using defaults</span> ({defaultsText}).
                Changing and saving the shift window, grace or weekly offs turns on rule-based late marking for this client. The check-in options below can be saved on their own, without it.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
              <Field label="Shift start" htmlFor="att-shift-start" error={startError}>
                <Input id="att-shift-start" type="time" value={draft.shift_start} invalid={!!startError} onChange={(e) => patch({ shift_start: e.target.value })} />
              </Field>
              <Field label="Shift end" htmlFor="att-shift-end" error={endError}>
                <Input id="att-shift-end" type="time" value={draft.shift_end} invalid={!!endError} onChange={(e) => patch({ shift_end: e.target.value })} />
              </Field>
              <Field
                label="Late grace (minutes)" htmlFor="att-grace" error={graceError}
                hint={!graceError ? `Check-ins up to ${graceNum} min after shift start count as on time.` : undefined}
              >
                <Input
                  id="att-grace" type="number" inputMode="numeric" min={bounds.min} max={bounds.max} step={1}
                  value={draft.grace} invalid={!!graceError} onChange={(e) => patch({ grace: e.target.value })}
                  style={{ fontFamily: T.mono }}
                />
              </Field>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div id="att-weekly-off-label" style={{ fontSize: 12.5, fontWeight: 500, color: T.dim }}>Weekly off days</div>
              <div role="group" aria-labelledby="att-weekly-off-label" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {DAYS.map((d) => {
                  const on = draft.weekly_off.includes(d.n);
                  return (
                    <button
                      key={d.n} type="button" aria-pressed={on} aria-label={d.full} title={d.full} onClick={() => toggleDay(d.n)}
                      style={{
                        minWidth: 48, height: 30, padding: '0 10px', borderRadius: 999, cursor: saving ? 'not-allowed' : 'pointer',
                        background: on ? T.infoWash : T.card, border: `1px solid ${on ? T.info : T.border}`,
                        color: on ? T.text : T.dim, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit',
                        transition: 'background .12s ease, border-color .12s ease',
                      }}
                    >{d.short}</button>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: T.mute }}>These days are not counted as working days in the monthly attendance summary.</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SwitchRow
                id="att-offline" checked={draft.allow_offline_checkin} disabled={saving}
                onChange={(v) => patch({ allow_offline_checkin: v })}
                label="Allow offline check-in" hint="Reps can check in without network; the time of the tap is used"
              />
              {payload?.flags && (
                <SwitchRow
                  id="att-selfie" checked={draft.selfie_required} disabled={saving}
                  onChange={(v) => patch({ selfie_required: v })}
                  label="Selfie required for check-in / check-out"
                  hint="Off = reps check in and out with one tap and their GPS location, no camera"
                />
              )}
              {payload?.flags && (
                <SwitchRow
                  id="att-form-checkin" checked={draft.form_checkin_required} disabled={saving}
                  onChange={(v) => patch({ form_checkin_required: v })}
                  label="Check-in and check-out on every form"
                  hint="Reps check in before filling a form and check out when they submit; the time spent shows in Work Activities"
                />
              )}
            </div>

            {saveError && (
              <div role="alert" style={{ background: T.redWash, border: `1px solid ${T.red}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: T.red }}>
                Not saved: {saveError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <Button type="button" disabled={!dirty || saving} onClick={() => { if (payload) { setDraft(toDraft(payload.rules)); setSaveError(''); } }}>Discard changes</Button>
              <Button type="submit" variant="primary" disabled={!canSave}>{saving ? 'Saving…' : 'Save attendance rules'}</Button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}

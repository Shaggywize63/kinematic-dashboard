'use client';
// The form half of the simulator: pick the kind of change, then fill in its numbers. One small form per kind.

import { useId } from 'react';
import { Field, FormGrid, Input, Select } from '../../ui';
import { Button, Card, CardTitle, T, useIsCompact } from '../ui';
import type { HrmsDb } from '../../../lib/hrms/types';
import { ESI, PF, rowOn, monthEnd } from '../../../lib/hrms/rules';
import { fmtMonth, inr } from '../../../lib/hrms/format';
import { SCENARIO_TYPES, currentBasicPct, currentCeiling, defaultInput, scopeOptions, simFromMonths, usualStructure } from '../../../lib/hrms/control/simulate';
import type { IncrementScope, ScenarioInput, ScenarioType } from '../../../lib/hrms/control/types';
import { Conf, Muted, Row } from './parts';

const SCOPE_LABEL: Record<IncrementScope, string> = { all: 'Everyone', department: 'A department', location: 'A location', grade: 'A grade' };

export default function SimForm({ db, value, onChange, errors, onRun, stale }: {
  db: HrmsDb; value: ScenarioInput; onChange: (v: ScenarioInput) => void; errors: Record<string, string>; onRun: () => void; stale: boolean;
}) {
  const narrow = useIsCompact(700);
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const months = simFromMonths();
  const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

  const monthField = (
    <Field label="From month" required htmlFor={id('fromMonth')} error={errors.fromMonth} hint="The 12-month view starts here.">
      <Select id={id('fromMonth')} value={value.fromMonth} onChange={(e) => onChange({ ...value, fromMonth: e.target.value })}>
        {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
      </Select>
    </Field>
  );

  return (
    <Card>
      <CardTitle>1. Pick the change you want to test</CardTitle>
      <div role="radiogroup" aria-label="Kind of change" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(200px, 100%), 1fr))`, gap: 10, marginBottom: 20 }}>
        {SCENARIO_TYPES.map((t) => {
          const on = t.type === value.type;
          return (
            <button key={t.type} type="button" role="radio" aria-checked={on} data-testid={`type-${t.type}`}
              onClick={() => { if (!on) onChange(defaultInput(db, t.type as ScenarioType)); }}
              style={{
                textAlign: 'left', padding: '12px 14px', borderRadius: T.radius.md, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${on ? T.info : T.border}`, background: on ? T.infoWash : T.card, color: T.text,
              }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{t.label}</div>
              <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2 }}>{t.blurb}</div>
            </button>
          );
        })}
      </div>

      <CardTitle>2. Set the numbers</CardTitle>
      <FormGrid narrow={narrow} columns={3}>
        {value.type === 'increment' && (
          <>
            <Field label="Increment (%)" required htmlFor={id('percent')} error={errors.percent}>
              <Input id={id('percent')} type="number" inputMode="decimal" step="0.5" min="0" max="100" value={Number.isNaN(value.percent) ? '' : value.percent} invalid={!!errors.percent}
                onChange={(e) => onChange({ ...value, percent: num(e.target.value) })} />
            </Field>
            <Field label="Who gets it" required htmlFor={id('scope')}>
              <Select id={id('scope')} value={value.scope} onChange={(e) => {
                const scope = e.target.value as IncrementScope;
                onChange({ ...value, scope, scopeValue: scopeOptions(db, scope)[0]?.value ?? '' });
              }}>
                {(Object.keys(SCOPE_LABEL) as IncrementScope[]).map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
              </Select>
            </Field>
            {value.scope !== 'all' ? (
              <Field label={SCOPE_LABEL[value.scope].replace('A ', '').replace(/^./, (c) => c.toUpperCase())} required htmlFor={id('scopeValue')} error={errors.scopeValue}>
                <Select id={id('scopeValue')} value={value.scopeValue} invalid={!!errors.scopeValue} onChange={(e) => onChange({ ...value, scopeValue: e.target.value })}>
                  {scopeOptions(db, value.scope).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            ) : <div />}
            {monthField}
          </>
        )}

        {value.type === 'hiring' && (
          <>
            <Field label="Number of people" required htmlFor={id('count')} error={errors.count}>
              <Input id={id('count')} type="number" inputMode="numeric" step="1" min="1" max="100" value={Number.isNaN(value.count) ? '' : value.count} invalid={!!errors.count}
                onChange={(e) => onChange({ ...value, count: num(e.target.value) })} />
            </Field>
            <Field label="Designation" required htmlFor={id('designationId')} error={errors.designationId}>
              <Select id={id('designationId')} value={value.designationId} invalid={!!errors.designationId}
                onChange={(e) => onChange({ ...value, designationId: e.target.value, structureId: usualStructure(db, e.target.value) })}>
                {db.designations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
            <Field label="Annual CTC (₹)" required htmlFor={id('annualCtc')} error={errors.annualCtc} hint={Number.isFinite(value.annualCtc) ? `${inr(value.annualCtc / 12)} a month` : undefined}>
              <Input id={id('annualCtc')} type="number" inputMode="numeric" step="1000" min="100000" value={Number.isNaN(value.annualCtc) ? '' : value.annualCtc} invalid={!!errors.annualCtc}
                onChange={(e) => onChange({ ...value, annualCtc: num(e.target.value) })} />
            </Field>
            <Field label="Location" required htmlFor={id('locationId')} error={errors.locationId}>
              <Select id={id('locationId')} value={value.locationId} invalid={!!errors.locationId} onChange={(e) => onChange({ ...value, locationId: e.target.value })}>
                {db.locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.state})</option>)}
              </Select>
            </Field>
            <Field label="Salary structure" required htmlFor={id('structureId')} error={errors.structureId}>
              <Select id={id('structureId')} value={value.structureId} invalid={!!errors.structureId} onChange={(e) => onChange({ ...value, structureId: e.target.value })}>
                {db.structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            {monthField}
          </>
        )}

        {value.type === 'structure' && (
          <>
            <Field label="Salary structure" required htmlFor={id('structureId')} error={errors.structureId}>
              <Select id={id('structureId')} value={value.structureId} invalid={!!errors.structureId} onChange={(e) => onChange({ ...value, structureId: e.target.value, basicPct: currentBasicPct(db, e.target.value) ?? value.basicPct })}>
                {db.structures.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Basic as a share of CTC (%)" required htmlFor={id('basicPct')} error={errors.basicPct}
              hint={`Now ${currentBasicPct(db, value.structureId) ?? 'not a percentage'}${currentBasicPct(db, value.structureId) != null ? '%' : ''}. The Labour Codes want wages at 50% or more.`}>
              <Input id={id('basicPct')} type="number" inputMode="decimal" step="1" min="10" max="90" value={Number.isNaN(value.basicPct) ? '' : value.basicPct} invalid={!!errors.basicPct}
                onChange={(e) => onChange({ ...value, basicPct: num(e.target.value) })} />
            </Field>
            {monthField}
            <label style={{ gridColumn: narrow ? undefined : 'span 3', display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 13.5, color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={value.pfOnActual} onChange={(e) => onChange({ ...value, pfOnActual: e.target.checked })} style={{ width: 18, height: 18, accentColor: 'var(--info)' }} />
              Pay PF on full wages instead of stopping at the ceiling, for people on this structure
            </label>
          </>
        )}

        {value.type === 'statutory' && (
          <>
            <Field label="Which ceiling" required htmlFor={id('rule')}>
              <Select id={id('rule')} value={value.rule} onChange={(e) => { const rule = e.target.value as typeof value.rule; onChange({ ...value, rule, value: 30000 }); }}>
                <option value="pf_ceiling">PF wage ceiling</option>
                <option value="esi_ceiling">ESI wage ceiling</option>
              </Select>
            </Field>
            <Field label="Hypothetical monthly ceiling (₹)" required htmlFor={id('value')} error={errors.value} hint="A value you type in. It is not a notified rule.">
              <Input id={id('value')} type="number" inputMode="numeric" step="500" min="1000" value={Number.isNaN(value.value) ? '' : value.value} invalid={!!errors.value}
                onChange={(e) => onChange({ ...value, value: num(e.target.value) })} />
            </Field>
            {monthField}
            <div style={{ gridColumn: narrow ? undefined : 'span 3', display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="statutory-baseline">
              <Row gap={8}>
                <span style={{ fontSize: 13, color: T.dim }}>In force now: {value.rule === 'pf_ceiling' ? 'PF' : 'ESI'} wage ceiling {inr(currentCeiling(value.rule, value.fromMonth))}</span>
                <Conf level={rowOn(value.rule === 'pf_ceiling' ? PF.ceiling : ESI.ceiling, monthEnd(value.fromMonth)).confidence} />
              </Row>
              <Row gap={8}>
                <span style={{ fontSize: 13, color: T.dim }}>Your hypothetical: {Number.isFinite(value.value) ? inr(value.value) : '—'}</span>
                <Conf level="indicative" />
              </Row>
            </div>
          </>
        )}
      </FormGrid>

      <Row style={{ marginTop: 20 }} gap={12}>
        <Button variant="primary" onClick={onRun} data-testid="run-simulation">Run simulation</Button>
        {stale && <Muted style={{ color: T.warn }}>You changed the inputs. Run the simulation to update the numbers below.</Muted>}
      </Row>
    </Card>
  );
}

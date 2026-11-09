'use client';
// Pay transparency: the band ranges an employee would be allowed to see in the live product, and a switch to preview that
// employee view. The employee view never shows other people, midpoints, market figures or headcounts.

import { useMemo, useState } from 'react';
import { Badge, Card, CardTitle, EmptyState, Note, T } from '../../ui';
import { Field, Segmented, Select } from '../../../ui';
import { fullName, inr } from '../../../../lib/hrms/format';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { bandPeople, positionInBand } from '../../../../lib/hrms/rewards/engines';
import { setPublished } from '../../../../lib/hrms/rewards/store';
import type { RewardsState } from '../../../../lib/hrms/rewards/types';
import { AdvisorNote, CheckRow, Muted } from '../common';
import RangeChart from './RangeChart';

type View = 'hr' | 'employee';

export default function TransparencyTab({ db, st }: { db: HrmsDb; st: RewardsState }) {
  const [view, setView] = useState<View>('hr');
  const people = useMemo(() => bandPeople(db, st.comp.bands), [db, st.comp.bands]);
  const [asId, setAsId] = useState('');
  const me = people.find((p) => p.employee.id === (asId || people[0]?.employee.id));
  const desig = (grade: string) => db.designations.filter((d) => d.grade === grade).map((d) => d.name).join(', ');
  const published = st.comp.bands.filter((b) => b.published);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <Segmented<View> value={view} onChange={setView} options={[{ value: 'hr', label: 'HR view' }, { value: 'employee', label: 'Employee view' }]} />
        <span style={{ fontSize: 13, color: T.dim }}>{published.length} of {st.comp.bands.length} grades published</span>
      </div>
      <AdvisorNote>Whether to publish pay bands, and how, is a company policy choice. Check any legal duty to disclose pay ranges where you hire.</AdvisorNote>

      {view === 'hr' && (
        <Card>
          <CardTitle>What employees would see</CardTitle>
          <Muted style={{ marginBottom: 10 }}>Tick a grade to publish its range. Only published ranges appear in the employee view. Publishing shows the minimum and the maximum, nothing else.</Muted>
          <div data-testid="publish-list">
            {st.comp.bands.map((b, i) => (
              <div key={b.grade} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0', borderTop: i ? `1px solid ${T.border}` : 0 }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <CheckRow checked={b.published} onChange={(v) => setPublished(b.grade, v)} testId={`publish-${b.grade}`}>
                    <b>{b.grade}</b> <span style={{ color: T.dim }}>{desig(b.grade)}</span>
                  </CheckRow>
                </div>
                <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 13.5 }}>{inr(b.min)} to {inr(b.max)}</div>
                <Badge tone={b.published ? 'ok' : 'neutral'} dot>{b.published ? 'Published' : 'Not published'}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {view === 'employee' && (
        <Card>
          <CardTitle right={<Badge tone="info">Preview of the employee view</Badge>}>Pay bands at Meridian</CardTitle>
          <Field label="Preview as" htmlFor="tr-as" hint="HR picks whose own band to highlight. The view below shows nothing about anyone else.">
            <Select id="tr-as" value={me?.employee.id ?? ''} style={{ maxWidth: 320 }} onChange={(e) => setAsId(e.target.value)}>
              {people.map((p) => <option key={p.employee.id} value={p.employee.id}>{fullName(p.employee)}</option>)}
            </Select>
          </Field>
          <div data-testid="employee-view" style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {published.length === 0 ? <EmptyState title="No ranges are published" description="Publish a grade in the HR view and it appears here." /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {st.comp.bands.map((b) => {
                  const mine = me?.grade === b.grade;
                  if (!b.published) {
                    return mine ? (
                      <div key={b.grade} data-testid={`emp-band-${b.grade}`} style={{ border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.md, padding: 14, fontSize: 13.5, color: T.dim }}>
                        <b style={{ color: T.text }}>{b.grade}</b> (your grade): the range is not published yet.
                      </div>
                    ) : null;
                  }
                  return (
                    <div key={b.grade} data-testid={`emp-band-${b.grade}`} style={{ border: `1px solid ${mine ? 'var(--info)' : T.border}`, borderRadius: T.radius.md, padding: 14, background: mine ? 'var(--info-w)' : undefined }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div><b style={{ fontFamily: T.heading }}>{b.grade}</b> <span style={{ color: T.dim, fontSize: 13.5 }}>{desig(b.grade)}</span></div>
                        <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{inr(b.min)} to {inr(b.max)} a year</div>
                      </div>
                      {mine && me && (
                        <div style={{ marginTop: 6, fontSize: 13.5 }} data-testid="emp-own">
                          <Badge tone="info">Your band</Badge> Your CTC is {inr(me.ctc)}, which is {positionInBand(me.ctc, b) === 'in' ? 'inside' : positionInBand(me.ctc, b) === 'below' ? 'below' : 'above'} this range. Ask your manager or HR how pay moves within it.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {me && st.comp.bands.find((b) => b.grade === me.grade && b.published) && (
              <div style={{ maxWidth: 640 }}>
                <RangeChart band={st.comp.bands.find((b) => b.grade === me.grade)!} people={[]} showPeople={false} showMarket={false} showMid={false} />
              </div>
            )}
            <Note>This view hides midpoints, market figures, headcounts and everyone else&apos;s pay. It is how the page would look to an employee in the live product.</Note>
          </div>
        </Card>
      )}
    </div>
  );
}

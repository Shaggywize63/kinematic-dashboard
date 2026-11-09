'use client';
// Company limits for timesheets. Sample values; the real figures come from company policy and Time & Leave.

import { useState } from 'react';
import { toast } from 'sonner';
import { Field, Input } from '../../../ui';
import { setPolicy } from '../../../../lib/hrms/people/timesheetActions';
import type { TimesheetPolicy } from '../../../../lib/hrms/people/types';
import { FormModal, Muted, Stack } from '../shared';

export default function PolicyModal({ policy, onClose }: { policy: TimesheetPolicy; onClose: () => void }) {
  const [day, setDay] = useState(String(policy.maxPerDay));
  const [week, setWeek] = useState(String(policy.weeklyCap));
  const [std, setStd] = useState(String(policy.standardWeek));
  return (
    <FormModal title="Timesheet limits" confirmLabel="Save limits" width={460} onClose={onClose}
      onConfirm={() => {
        const r = setPolicy({ maxPerDay: Number(day), weeklyCap: Number(week), standardWeek: Number(std) });
        if (!r.ok) return r.error;
        toast.success('Limits saved and logged.');
        return null;
      }}>
      <Stack gap={12}>
        <Muted>These are company policy, shown to everyone who fills a timesheet. Overtime rates, consent and quarterly caps are set in Time &amp; Leave.</Muted>
        <Field label="Most hours in one day" htmlFor="pol-day"><Input id="pol-day" inputMode="decimal" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
        <Field label="Weekly cap that raises a flag" htmlFor="pol-week"><Input id="pol-week" inputMode="decimal" value={week} onChange={(e) => setWeek(e.target.value)} /></Field>
        <Field label="Standard week (for utilisation)" htmlFor="pol-std"><Input id="pol-std" inputMode="decimal" value={std} onChange={(e) => setStd(e.target.value)} /></Field>
      </Stack>
    </FormModal>
  );
}

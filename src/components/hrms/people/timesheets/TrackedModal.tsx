'use client';
// Who fills a weekly timesheet: usually the roles that bill or track effort. A tick list of current employees with a search.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { T } from '../../ui';
import { Input } from '../../../ui';
import { fullName } from '../../../../lib/hrms/format';
import { setTracked } from '../../../../lib/hrms/people/timesheetActions';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { FormModal, Muted, Stack } from '../shared';
import { CheckRow } from '../../rewards/common';

export default function TrackedModal({ db, trackedIds, onClose }: { db: HrmsDb; trackedIds: string[]; onClose: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(trackedIds));
  const [q, setQ] = useState('');
  const people = useMemo(
    () => db.employees.filter((e) => e.status === 'active' || e.status === 'on_notice' || picked.has(e.id)).sort((a, b) => fullName(a).localeCompare(fullName(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.employees],
  );
  const shown = people.filter((e) => !q || `${fullName(e)} ${e.code}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string, on: boolean) => setPicked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <FormModal title="Who tracks time" confirmLabel={`Save (${picked.size} ${picked.size === 1 ? 'person' : 'people'})`} width={520} onClose={onClose}
      onConfirm={async () => {
        const r = await setTracked([...picked]);
        if (!r.ok) return r.error;
        toast.success('Saved who tracks time.');
        return null;
      }}>
      <Stack gap={10}>
        <Muted>Tick the people who fill a weekly timesheet. Others do not see one. Untick someone to stop new weeks for them; their past weeks stay.</Muted>
        <Input aria-label="Search people" placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} />
        <div data-testid="tracked-list" style={{ maxHeight: 340, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: '0 12px' }}>
          {shown.map((e) => (
            <CheckRow key={e.id} checked={picked.has(e.id)} onChange={(v) => toggle(e.id, v)} testId={`track-${e.id}`}>
              {fullName(e)} <span style={{ color: T.mute }}>{e.code}</span>
            </CheckRow>
          ))}
          {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, color: T.mute }}>Nobody matches.</div>}
        </div>
      </Stack>
    </FormModal>
  );
}

'use client';
// Edit one cell of the skills matrix: the level and the evidence behind it. Saved and logged.

import { useState } from 'react';
import { toast } from 'sonner';
import { Field, Input, Select, Textarea } from '../../../ui';
import { Badge, T } from '../../ui';
import { ACTOR } from '../../../../lib/hrms/actions';
import { fmtDate } from '../../../../lib/hrms/format';
import { setRating } from '../../../../lib/hrms/people/talentActions';
import { LEVEL_HELP, LEVEL_LABEL, levelOf, ratingKey } from '../../../../lib/hrms/people/talentEngine';
import type { SkillLevel, TalentState } from '../../../../lib/hrms/people/types';
import type { Employee } from '../../../../lib/hrms/types';
import { FormModal, Muted, Stack } from '../shared';
import type { TalentView } from './view';

export default function RatingModal({ tv, st, person, skillId, onClose }: { tv: TalentView; st: TalentState; person: Employee; skillId: string; onClose: () => void }) {
  const skill = st.skills.find((s) => s.id === skillId)!;
  const cur = st.ratings[ratingKey(person.id, skillId)];
  const need = st.requirements[person.designationId]?.[skillId];
  const [level, setLevel] = useState<string>(String(levelOf(st.ratings, person.id, skillId)));
  const [note, setNote] = useState(cur?.note ?? '');
  const [assessor, setAssessor] = useState(cur?.by ?? ACTOR);
  return (
    <FormModal title={`${skill.name}: ${person.firstName} ${person.lastName}`} confirmLabel="Save level" width={540} onClose={onClose}
      onConfirm={() => {
        const r = setRating(person.id, skillId, Number(level) as SkillLevel, note, assessor);
        if (!r.ok) return r.error;
        toast.success('Skill level saved and logged.');
        return null;
      }}>
      <Stack gap={12}>
        <Muted>{skill.blurb} {need != null ? `The role of ${tv.des(person.designationId)} needs level ${need}.` : `${tv.des(person.designationId)} has no set requirement for this skill.`}</Muted>
        {cur && <div style={{ fontSize: 13, color: T.dim }}>Current: <Badge tone="info">Level {cur.level}, {LEVEL_LABEL[cur.level]}</Badge> assessed by {cur.by} on {fmtDate(cur.on)}.</div>}
        <Field label="Level" htmlFor="rate-level" hint={LEVEL_HELP[Number(level)]}>
          <Select id="rate-level" value={level} onChange={(e) => setLevel(e.target.value)}>
            {[0, 1, 2, 3, 4].map((l) => <option key={l} value={l}>{l} · {LEVEL_LABEL[l]}</option>)}
          </Select>
        </Field>
        <Field label="Evidence" htmlFor="rate-note" hint="What did the assessor see? Needed for level 3 and 4.">
          <Textarea id="rate-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
        </Field>
        <Field label="Assessed by" htmlFor="rate-by"><Input id="rate-by" value={assessor} onChange={(e) => setAssessor(e.target.value)} /></Field>
      </Stack>
    </FormModal>
  );
}

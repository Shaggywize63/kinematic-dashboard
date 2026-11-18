'use client';
// Add or edit a project people log hours against. A billable project carries an hourly rate for the project value; an
// internal one does not. Archiving keeps the project on the weeks that used it but takes it off the "Add a project" list.

import { useState } from 'react';
import { toast } from 'sonner';
import { Field, FormGrid, Input, Select } from '../../../ui';
import { createProject, updateProject, type ProjectInput } from '../../../../lib/hrms/people/timesheetActions';
import type { Project } from '../../../../lib/hrms/people/types';
import { FormModal, Muted, Stack } from '../shared';
import { CheckRow } from '../../rewards/common';

const digits = (v: string) => v.replace(/[^\d.]/g, '');

export default function ProjectModal({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [name, setName] = useState(project?.name ?? '');
  const [client, setClient] = useState(project?.client ?? '');
  const [kind, setKind] = useState<'client' | 'internal'>(project?.kind ?? 'client');
  const [billable, setBillable] = useState(project?.billable ?? true);
  const [budget, setBudget] = useState(String(project?.budgetHours ?? ''));
  const [prior, setPrior] = useState(String(project?.priorHours ?? ''));
  const [rate, setRate] = useState(String(project?.sampleRate ?? ''));
  const [archived, setArchived] = useState(!!project?.archived);

  const input = (): ProjectInput => ({
    name, client, kind, billable, budgetHours: Number(budget || 0), priorHours: Number(prior || 0), rate: Number(rate || 0),
    ...(project ? { archived } : {}),
  });

  return (
    <FormModal title={project ? `Edit project: ${project.name}` : 'Add a project'} confirmLabel={project ? 'Save project' : 'Add project'} width={560} onClose={onClose}
      onConfirm={async () => {
        const r = project ? await updateProject(project.id, input()) : await createProject(input());
        if (!r.ok) return r.error;
        toast.success(project ? 'Project saved.' : 'Project added.');
        return null;
      }}>
      <Stack gap={12}>
        <FormGrid>
          <Field label="Project name" htmlFor="prj-name" required><Input id="prj-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
          <Field label="Client" htmlFor="prj-client" hint="Leave blank for internal work."><Input id="prj-client" value={client} onChange={(e) => setClient(e.target.value)} maxLength={120} /></Field>
          <Field label="Kind" htmlFor="prj-kind">
            <Select id="prj-kind" value={kind} onChange={(e) => { const k = e.target.value as 'client' | 'internal'; setKind(k); if (k === 'internal') setBillable(false); }}>
              <option value="client">Client project</option>
              <option value="internal">Internal</option>
            </Select>
          </Field>
          <Field label="Budget (hours)" htmlFor="prj-budget"><Input id="prj-budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(digits(e.target.value))} /></Field>
          <Field label="Hours logged before this system" htmlFor="prj-prior" hint="Counts towards the budget bar."><Input id="prj-prior" inputMode="decimal" value={prior} onChange={(e) => setPrior(digits(e.target.value))} /></Field>
          {billable && <Field label="Hourly rate (₹)" htmlFor="prj-rate" hint="Used for the project value."><Input id="prj-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(digits(e.target.value))} /></Field>}
        </FormGrid>
        <CheckRow checked={billable} onChange={setBillable} testId="prj-billable">Billable to the client</CheckRow>
        {project && <CheckRow checked={archived} onChange={setArchived} testId="prj-archived">Archived: keep it on past weeks, but do not offer it for new ones</CheckRow>}
        <Muted>Projects are shared by everyone who tracks time. A rate is only used to show an indicative value; it is not a rate card.</Muted>
      </Stack>
    </FormModal>
  );
}

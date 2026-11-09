'use client';
// Catalogue: the ten courses, who each is mandatory for, how far along people are, manual assignment and the rules.

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge, Button, Card, Note, ProgressBar, SearchBox, T } from '../../ui';
import { Field, Input, Segmented } from '../../../ui';
import type { HrmsDb } from '../../../../lib/hrms/types';
import { addDays, fullName } from '../../../../lib/hrms/format';
import type { Audience, Course, LearningState } from '../../../../lib/hrms/people/types';
import { assignCourse, syncRuleAssignments, updateCourseRules } from '../../../../lib/hrms/people/learningActions';
import { currentAssignments, eligibleFor, inAudience, isLearner, minutesText } from '../../../../lib/hrms/people/learningEngine';
import { FormModal, Muted, Stack } from '../shared';
import type { LearningView } from './view';

function CourseCard({ c, view, onAssign, onRules }: { c: Course; view: LearningView; onAssign: () => void; onRules: () => void }) {
  const s = view.courseStats.get(c.id)!;
  const pct = s.assigned ? Math.round((s.done / s.assigned) * 100) : 0;
  return (
    <div data-testid={`course-${c.id}`} style={{ display: 'flex' }}>
    <Card padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Badge tone={c.category === 'compliance' ? 'warn' : 'info'}>{c.category === 'compliance' ? 'Compliance' : 'Role skill'}</Badge>
          <Badge>{c.mode === 'classroom' ? 'Classroom' : 'Self-paced'}</Badge>
          <Badge tone={c.mandatory ? 'red' : 'neutral'}>{c.mandatory ? 'Mandatory' : 'Recommended'}</Badge>
        </div>
        <h3 style={{ margin: 0, fontSize: 15, fontFamily: T.heading, color: T.text }}>{c.title}</h3>
        <div style={{ fontSize: 13, color: T.dim, lineHeight: 1.5 }}>{c.summary}</div>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: 12.5 }}>
          <dt style={{ color: T.mute }}>Duration</dt><dd style={{ margin: 0, color: T.text }}>{minutesText(c.durationMin)}</dd>
          <dt style={{ color: T.mute }}>{c.mandatory ? 'Mandatory for' : 'Meant for'}</dt><dd style={{ margin: 0, color: T.text }}>{view.audienceOf(c)}</dd>
          <dt style={{ color: T.mute }}>Refresher</dt><dd style={{ margin: 0, color: T.text }}>{c.refresherMonths ? `Every ${c.refresherMonths} months` : 'One-off'}</dd>
          <dt style={{ color: T.mute }}>Owner</dt><dd style={{ margin: 0, color: T.text }}>{c.owner}</dd>
        </dl>
        <div style={{ marginTop: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: T.dim, marginBottom: 4 }}>
            <span>{s.assigned ? `${s.done} of ${s.assigned} done` : 'Nobody assigned yet'}</span>
            {s.overdue > 0 && <span style={{ color: T.red, fontWeight: 600 }}>{s.overdue} overdue</span>}
          </div>
          <ProgressBar pct={pct} tone={s.overdue > 0 ? 'warn' : 'ok'} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onAssign}>Assign</Button>
        <Button size="sm" variant="ghost" onClick={onRules}>Edit who it is for</Button>
      </div>
    </Card>
    </div>
  );
}

function AssignModal({ db, st, view, course, onClose }: { db: HrmsDb; st: LearningState; view: LearningView; course: Course; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [due, setDue] = useState(addDays(view.today, course.dueDays));
  const open = useMemo(() => new Set(currentAssignments(st.assignments).filter((a) => a.courseId === course.id && !a.completedOn).map((a) => a.employeeId)), [st, course.id]);
  const list = view.learners.filter((e) => `${fullName(e)} ${e.code}`.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const audienceIds = eligibleFor(course, db.employees).map((e) => e.id).filter((id) => !open.has(id));

  return (
    <FormModal title={`Assign: ${course.title}`} confirmLabel={`Assign to ${picked.size || ''} ${picked.size === 1 ? 'person' : 'people'}`.replace('  ', ' ')} width={560} disabled={picked.size === 0}
      onClose={onClose}
      onConfirm={() => {
        if (picked.size === 0) return 'Pick at least one person.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due < view.today) return 'Pick a due date that is today or later.';
        const r = assignCourse(course.id, [...picked], due);
        toast.success(`Assigned to ${r.created} ${r.created === 1 ? 'person' : 'people'}${r.skipped ? `. ${r.skipped} already had it open.` : '.'}`);
        return null;
      }}>
      <Stack gap={12}>
        <Field label="Due date" htmlFor="asg-due"><Input id="asg-due" type="date" value={due} min={view.today} onChange={(e) => setDue(e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search people" width={220} />
          <Button size="sm" onClick={() => setPicked(new Set(audienceIds))} disabled={audienceIds.length === 0}>Select everyone it is meant for ({audienceIds.length})</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear</Button>
        </div>
        <div role="group" aria-label="People" style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.md }}>
          {list.map((e) => (
            <label key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderBottom: `1px solid ${T.border}`, fontSize: 13.5, color: open.has(e.id) ? T.mute : T.text, cursor: open.has(e.id) ? 'not-allowed' : 'pointer' }}>
              <input type="checkbox" disabled={open.has(e.id)} checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
              <span style={{ flex: 1 }}>{fullName(e)} <span style={{ color: T.mute }}>· {view.names.dep(e.departmentId)}</span></span>
              {open.has(e.id) && <Badge>Already open</Badge>}
            </label>
          ))}
          {list.length === 0 && <div style={{ padding: 16, fontSize: 13, color: T.mute }}>No one matches.</div>}
        </div>
      </Stack>
    </FormModal>
  );
}

function RulesModal({ db, course, onClose }: { db: HrmsDb; course: Course; onClose: () => void }) {
  const [mandatory, setMandatory] = useState(course.mandatory);
  const [aud, setAud] = useState<Audience>(structuredClone(course.audience));
  const [months, setMonths] = useState(String(course.refresherMonths));
  const toggle = (k: keyof Audience, id: string) => setAud((a) => ({ ...a, [k]: a[k].includes(id) ? a[k].filter((x) => x !== id) : [...a[k], id] }));
  const matching = db.employees.filter((e) => isLearner(e) && inAudience(aud, e)).length;
  const group = (label: string, k: keyof Audience, options: { id: string; name: string }[]) => (
    <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, margin: 0, padding: '8px 12px' }}>
      <legend style={{ fontSize: 12.5, color: T.dim, padding: '0 6px' }}>{label} (none ticked means everyone)</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
        {options.map((o) => (
          <label key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: T.text }}>
            <input type="checkbox" checked={aud[k].includes(o.id)} onChange={() => toggle(k, o.id)} />{o.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <FormModal title={`Who it is for: ${course.title}`} confirmLabel="Save" width={600} onClose={onClose}
      onConfirm={() => {
        const m = Number(months);
        if (!Number.isFinite(m) || m < 0 || m > 60) return 'The refresher interval is between 0 and 60 months. Use 0 for a one-off course.';
        updateCourseRules(course.id, { mandatory, audience: aud, refresherMonths: m });
        toast.success('Saved. Use "Apply rules" to create assignments for anyone newly covered.');
        return null;
      }}>
      <Stack gap={12}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, color: T.text }}>
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} /> Mandatory (assignments are created from this rule)
        </label>
        {group('Departments', 'departmentIds', db.departments.map((d) => ({ id: d.id, name: d.name })))}
        {group('Designations', 'designationIds', db.designations.map((d) => ({ id: d.id, name: d.name })))}
        {group('Locations', 'locationIds', db.locations.map((l) => ({ id: l.id, name: l.name })))}
        <Field label="Refresher every (months, 0 for none)" htmlFor="rule-months"><Input id="rule-months" inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} style={{ maxWidth: 140 }} /></Field>
        <Muted>{matching} {matching === 1 ? 'person matches' : 'people match'} this audience today.</Muted>
      </Stack>
    </FormModal>
  );
}

export default function CatalogueTab({ db, st, view }: { db: HrmsDb; st: LearningState; view: LearningView }) {
  const [assign, setAssign] = useState<string | null>(null);
  const [rules, setRules] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'compliance' | 'skill'>('all');
  const courses = st.courses.filter((c) => filter === 'all' || c.category === filter);
  const courseA = assign ? st.courses.find((c) => c.id === assign) : undefined;
  const courseR = rules ? st.courses.find((c) => c.id === rules) : undefined;

  return (
    <Stack>
      {view.missing.length > 0 ? (
        <Note tone="warn">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span data-testid="missing-note"><b>{view.missing.length}</b> {view.missing.length === 1 ? 'assignment is' : 'assignments are'} missing: {view.missing.length === 1 ? 'a person matches' : 'people match'} a mandatory rule but {view.missing.length === 1 ? 'has' : 'have'} not been assigned the course.</span>
            <Button variant="primary" size="sm" onClick={() => { const n = syncRuleAssignments(db.employees); toast.success(`${n} assignment${n === 1 ? '' : 's'} created from the rules.`); }}>Apply rules</Button>
          </div>
        </Note>
      ) : (
        <div data-testid="missing-note"><Muted>Every mandatory rule is applied. Nobody is missing an assignment. Joiners are assigned on their start date.</Muted></div>
      )}
      <div>
        <Segmented<'all' | 'compliance' | 'skill'> value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All courses' }, { value: 'compliance', label: 'Compliance' }, { value: 'skill', label: 'Role skills' }]} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 14 }}>
        {courses.map((c) => <CourseCard key={c.id} c={c} view={view} onAssign={() => setAssign(c.id)} onRules={() => setRules(c.id)} />)}
      </div>
      <Muted>Which courses are mandatory is the company's decision. Some are expected by law, for example harassment awareness and safety training. Confirm the exact requirement and interval with your advisor.</Muted>
      {courseA && <AssignModal db={db} st={st} view={view} course={courseA} onClose={() => setAssign(null)} />}
      {courseR && <RulesModal db={db} course={courseR} onClose={() => setRules(null)} />}
    </Stack>
  );
}

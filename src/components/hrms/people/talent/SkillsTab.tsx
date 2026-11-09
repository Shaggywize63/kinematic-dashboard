'use client';
// Skills matrix: people by skills, levels 0 to 4 with evidence, a "who has skill X" search and gaps against the role.

import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardTitle, DataTable, EmployeeCell, Note, T, Toolbar, type Col } from '../../ui';
import { Segmented, Select } from '../../../ui';
import type { Employee, HrmsDb } from '../../../../lib/hrms/types';
import { fmtDate } from '../../../../lib/hrms/format';
import { LEVEL_LABEL, gapsFor, levelOf, whoHas, type SkillHolder } from '../../../../lib/hrms/people/talentEngine';
import type { TalentState } from '../../../../lib/hrms/people/types';
import { Muted, Stack, ROW_TH } from '../shared';
import RatingModal from './RatingModal';
import type { TalentView } from './view';

const FILL = ['transparent', 12, 28, 48, 72];
const cellBg = (level: number) => (level === 0 ? 'transparent' : `color-mix(in srgb, var(--info) ${FILL[level]}%, var(--card))`);

type Mode = 'matrix' | 'search' | 'gaps';

export default function SkillsTab({ db, st, tv }: { db: HrmsDb; st: TalentState; tv: TalentView }) {
  const [mode, setMode] = useState<Mode>('matrix');
  const [dept, setDept] = useState('all');
  const [showGaps, setShowGaps] = useState(true);
  const [skillQ, setSkillQ] = useState(st.skills[0]!.id);
  const [minLevel, setMinLevel] = useState('3');
  const [edit, setEdit] = useState<{ empId: string; skillId: string } | null>(null);

  const people = useMemo(() => tv.people.filter((e) => dept === 'all' || e.departmentId === dept), [tv.people, dept]);
  const person = edit ? tv.emp.get(edit.empId) : undefined;
  const recent = st.log.filter((l) => l.action === 'Skill level changed').slice(0, 5);

  const holders = useMemo(() => whoHas(people, st.ratings, skillQ, Number(minLevel)), [people, st.ratings, skillQ, minLevel]);
  const holderCols: Col<SkillHolder & { id: string }>[] = [
    { key: 'p', label: 'Person', render: (h) => <EmployeeCell e={h.employee} sub={tv.des(h.employee.designationId)} /> },
    { key: 'dep', label: 'Department', render: (h) => tv.dep(h.employee.departmentId) },
    { key: 'lvl', label: 'Level', nowrap: true, sortValue: (h) => h.level, render: (h) => <Badge tone="info">{h.level} · {LEVEL_LABEL[h.level]}</Badge> },
    { key: 'ev', label: 'Evidence', render: (h) => <span style={{ color: T.dim }}>{h.rating?.note}</span> },
    { key: 'by', label: 'Assessed', nowrap: true, render: (h) => `${h.rating?.by ?? ''}, ${fmtDate(h.rating?.on)}` },
    { key: 'act', label: '', align: 'right', render: (h) => <Button size="sm" aria-label={`Edit level for ${h.employee.firstName} ${h.employee.lastName}`} onClick={() => setEdit({ empId: h.employee.id, skillId: skillQ })}>Edit</Button> },
  ];

  const gapRows = useMemo(() => people.map((e) => ({ id: e.id, e, gaps: gapsFor(e, st.ratings, st.requirements) })).filter((r) => r.gaps.length > 0).sort((a, b) => b.gaps.length - a.gaps.length || a.e.id.localeCompare(b.e.id, undefined, { numeric: true })), [people, st]);
  const skillName = (id: string) => st.skills.find((s) => s.id === id)?.name ?? id;

  return (
    <Stack gap={14}>
      <Toolbar>
        <Segmented<Mode> value={mode} onChange={setMode} options={[{ value: 'matrix', label: 'Matrix' }, { value: 'search', label: 'Who has skill X' }, { value: 'gaps', label: 'Gaps against role' }]} />
        <Select aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 190 }}>
          <option value="all">All departments</option>
          {db.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        {mode === 'matrix' && (
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, color: T.dim }}>
            <input type="checkbox" checked={showGaps} onChange={(e) => setShowGaps(e.target.checked)} /> Mark gaps against the role
          </label>
        )}
      </Toolbar>

      {mode === 'matrix' && (
        <>
          <div data-testid="skills-matrix" style={{ overflowX: 'auto', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.card }}>
            <table style={{ borderCollapse: 'collapse', minWidth: 190 + st.skills.length * 72, width: '100%' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ position: 'sticky', left: 0, background: T.panel, textAlign: 'left', padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.mute, borderBottom: `1px solid ${T.border}`, minWidth: 190, zIndex: 1 }}>Person</th>
                  {st.skills.map((s) => (
                    <th key={s.id} scope="col" title={s.blurb} style={{ background: T.panel, padding: '8px 4px', fontSize: 11.5, fontWeight: 600, color: T.dim, borderBottom: `1px solid ${T.border}`, width: 72, verticalAlign: 'bottom', lineHeight: 1.25 }}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((e) => {
                  const need = st.requirements[e.designationId] ?? {};
                  return (
                    <tr key={e.id}>
                      <th scope="row" style={{ ...ROW_TH, position: 'sticky', left: 0, background: T.card, textAlign: 'left', padding: '6px 12px', borderTop: `1px solid ${T.border}`, fontWeight: 500, zIndex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>{e.firstName} {e.lastName}</div>
                        <div style={{ fontSize: 11.5, color: T.mute, whiteSpace: 'nowrap' }}>{tv.des(e.designationId)}</div>
                      </th>
                      {st.skills.map((s) => {
                        const lvl = levelOf(st.ratings, e.id, s.id);
                        const req = need[s.id];
                        const gap = showGaps && req != null && lvl < req;
                        return (
                          <td key={s.id} style={{ borderTop: `1px solid ${T.border}`, padding: 3, textAlign: 'center' }}>
                            <button type="button" data-testid={`cell-${e.id}-${s.id}`} aria-label={`${e.firstName} ${e.lastName}, ${s.name}: level ${lvl}${req != null ? `, role needs ${req}` : ''}. Edit`}
                              onClick={() => setEdit({ empId: e.id, skillId: s.id })}
                              style={{ width: 62, height: 34, borderRadius: T.radius.sm, border: 0, background: cellBg(lvl), color: T.text, fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: gap ? `inset 0 0 0 2px ${T.red}` : req != null ? `inset 0 0 0 1px ${T.borderStrong}` : 'none', fontVariantNumeric: 'tabular-nums' }}>
                              {lvl === 0 ? '–' : lvl}{gap ? <span style={{ color: T.red, fontWeight: 700 }}> /{req}</span> : null}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Muted>
            Levels: 0 not assessed, 1 aware, 2 working, 3 proficient, 4 expert. A thin outline marks a skill the person's role needs. A red outline with a slash and a number, for example "1 /3", means the level is below what the role needs. Click a cell to change the level; a level of 3 or 4 needs a note on what was seen.
          </Muted>
          <Card padding={16}>
            <CardTitle>Recent changes</CardTitle>
            {recent.length === 0 ? <Muted>No changes yet. Edit a cell and it appears here.</Muted> : (
              <ul data-testid="skill-log" style={{ margin: 0, paddingLeft: 18, listStyle: 'disc', fontSize: 13, color: T.dim, lineHeight: 1.7 }}>
                {recent.map((l) => <li key={l.id}>{l.detail} <span style={{ color: T.mute }}>({l.by})</span></li>)}
              </ul>
            )}
          </Card>
        </>
      )}

      {mode === 'search' && (
        <Stack gap={12}>
          <Toolbar>
            <Select aria-label="Skill" value={skillQ} onChange={(e) => setSkillQ(e.target.value)} style={{ width: 240 }}>
              {st.skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select aria-label="Minimum level" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} style={{ width: 200 }}>
              {[1, 2, 3, 4].map((l) => <option key={l} value={l}>Level {l} or above</option>)}
            </Select>
          </Toolbar>
          <div data-testid="skill-search-count" style={{ fontSize: 14, color: T.text }}>
            <b>{holders.length}</b> {holders.length === 1 ? 'person has' : 'people have'} {skillName(skillQ)} at level {minLevel} or above{dept === 'all' ? '' : ` in ${tv.dep(dept)}`}.
          </div>
          <DataTable columns={holderCols} rows={holders.map((h) => ({ ...h, id: h.employee.id }))} minWidth={760} empty="Nobody matches. Try a lower level or all departments." />
        </Stack>
      )}

      {mode === 'gaps' && (
        <Stack gap={12}>
          <Note>A gap is a skill the person's role needs at a level they have not reached yet. It is a development prompt, not a verdict. Click a gap to update the level.</Note>
          <DataTable<{ id: string; e: Employee; gaps: ReturnType<typeof gapsFor> }>
            minWidth={720} empty="Nobody has a gap against their role."
            columns={[
              { key: 'p', label: 'Person', render: (r) => <EmployeeCell e={r.e} sub={tv.des(r.e.designationId)} /> },
              { key: 'n', label: 'Gaps', align: 'right', sortValue: (r) => r.gaps.length, render: (r) => r.gaps.length },
              {
                key: 'g', label: 'Skills below the role\'s level',
                render: (r) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {r.gaps.map((g) => (
                      <button key={g.skillId} type="button" data-testid={`gap-${r.id}-${g.skillId}`} onClick={() => setEdit({ empId: r.id, skillId: g.skillId })}
                        style={{ border: `1px solid ${T.border}`, background: T.raised, color: T.text, borderRadius: 999, padding: '3px 10px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {skillName(g.skillId)} <b style={{ color: T.red }}>{g.actual} of {g.required}</b>
                      </button>
                    ))}
                  </div>
                ),
              },
            ]}
            rows={gapRows}
          />
        </Stack>
      )}
      {edit && person && <RatingModal tv={tv} st={st} person={person} skillId={edit.skillId} onClose={() => setEdit(null)} />}
    </Stack>
  );
}

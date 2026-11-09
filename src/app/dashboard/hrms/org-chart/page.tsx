'use client';
// Org chart: the reporting lines from the core employee records, drawn as an interactive chart with zoom and pan,
// search, open roles, a loop-safe "Change manager", a grouped list view and a CSV download.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Avatar, Badge, Button, Card, CardTitle, HrmsPage, Loading, Note, SearchBox, Stat, T, Toolbar, downloadRows, useIsCompact } from '../../../../components/hrms/ui';
import { Segmented } from '../../../../components/ui';
import { useHrmsDb } from '../../../../lib/hrms/db';
import { fmtDate, fullName } from '../../../../lib/hrms/format';
import { CSV_HEADER, DEPT_COLOURS, ancestorsOf, buildTree, layoutTree, orgRows, orgStats, searchIds } from '../../../../lib/hrms/assist/orgChart';
import { orgStore, removeVacancy, setOrgPrefs } from '../../../../lib/hrms/assist/store';
import type { Employee } from '../../../../lib/hrms/types';
import OrgCanvas from '../../../../components/hrms/assist/OrgCanvas';
import OrgList from '../../../../components/hrms/assist/OrgList';
import { Tiles } from '../../../../components/hrms/assist/shared';
import { ChangeManagerModal, VacancyModal } from '../../../../components/hrms/assist/OrgModals';

type Modal = { kind: 'manager'; id: string } | { kind: 'vacancy'; managerId?: string } | null;

export default function OrgChartPage() {
  const db = useHrmsDb();
  const org = orgStore.use();
  const narrow = useIsCompact(1100);
  const [selectedId, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [pendingFocus, setPendingFocus] = useState<{ id: string; n: number } | null>(null);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);

  const prefs = org?.prefs;
  const tree = useMemo(() => (db && org ? buildTree(db.employees, org.vacancies, { showExited: org.prefs.showExited }) : null), [db, org]);
  const collapsed = useMemo(() => new Set(prefs?.collapsed ?? []), [prefs?.collapsed]);
  const layout = useMemo(() => (tree ? layoutTree(tree.roots, collapsed) : null), [tree, collapsed]);
  const matches = useMemo(() => (db && tree ? new Set(searchIds(tree, db, query)) : new Set<string>()), [db, tree, query]);

  // Search: open the path down to every match, then centre the first one once it has been drawn.
  useEffect(() => {
    if (!tree || !prefs || !query.trim()) return;
    const ids = [...matches];
    if (!ids.length) return;
    const need = new Set(ids.flatMap((id) => ancestorsOf(tree, id)));
    if (prefs.collapsed.some((c) => need.has(c))) setOrgPrefs({ collapsed: prefs.collapsed.filter((c) => !need.has(c)) });
    setPendingFocus((p) => ({ id: ids[0]!, n: (p?.n ?? 0) + 1 }));
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pendingFocus && layout?.boxes.some((b) => b.key === `p:${pendingFocus.id}`)) { setFocus(pendingFocus); setPendingFocus(null); }
  }, [pendingFocus, layout]);

  if (!db || !org || !tree || !layout || !prefs) return <Loading />;

  const stats = orgStats(tree);
  const selected = selectedId ? db.employees.find((e) => e.id === selectedId) ?? null : null;
  const selNode = selected ? tree.byId.get(selected.id) : undefined;
  const exitedCount = db.employees.filter((e) => e.status === 'exited').length;
  const parentOf = new Map<string, Employee>();
  for (const n of tree.byId.values()) for (const c of n.children) parentOf.set(c.emp.id, n.emp);
  const des = (e: Employee) => db.designations.find((d) => d.id === e.designationId)?.name ?? '';
  const managerEntry = modal?.kind === 'manager' ? db.employees.find((e) => e.id === modal.id) : undefined;
  const allWithKids = [...tree.byId.values()].filter((n) => n.children.length || n.vacancies.length).map((n) => n.emp.id);
  const toggle = (id: string) => setOrgPrefs({ collapsed: collapsedWith(prefs.collapsed, id) });
  const csv = () => { downloadRows('org-chart', CSV_HEADER, orgRows(db, tree)); toast.success('Org chart downloaded as CSV'); };

  return (
    <HrmsPage
      eyebrow="HRMS · People"
      title="Org chart"
      description="Who reports to whom, from the employee records. Change a manager here and the Employees page shows it too."
      actions={<><Button onClick={() => setModal({ kind: 'vacancy' })} data-testid="vac-open">Add open role</Button><Button onClick={csv} data-testid="org-csv">Download CSV</Button></>}
    >
      <Tiles min={150}>
        <Stat label="People shown" value={<span data-testid="stat-people">{stats.people}</span>} hint={prefs.showExited ? 'Including people who left' : `${exitedCount} who left are hidden`} />
        <Stat label="Managers" value={<span data-testid="stat-managers">{stats.managers}</span>} hint="People with at least one report" />
        <Stat label="Average span" value={<span data-testid="stat-span">{stats.avgSpan}</span>} hint="Direct reports per manager" />
        <Stat label="Widest span" value={<span data-testid="stat-maxspan">{stats.maxSpan?.n ?? 0}</span>} hint={stats.maxSpan?.name ?? 'No managers yet'} />
        <Stat label="Levels" value={<span data-testid="stat-levels">{stats.levels}</span>} hint="Top to bottom" />
        <Stat label="No manager set" value={<span data-testid="stat-nomanager">{stats.noManager}</span>} tone={stats.noManager > 3 ? 'warn' : undefined} hint={`${stats.vacancies} open role${stats.vacancies === 1 ? '' : 's'} planned`} />
      </Tiles>

      <Toolbar>
        <Segmented<'chart' | 'list'> value={prefs.view} onChange={(v) => setOrgPrefs({ view: v })} options={[{ value: 'chart', label: 'Chart' }, { value: 'list', label: 'List' }]} />
        <SearchBox value={query} onChange={setQuery} placeholder="Search a person or role" width={280} />
        {query.trim() && <Badge tone={matches.size ? 'info' : 'warn'}><span data-testid="org-match-count">{matches.size}</span>&nbsp;{matches.size === 1 ? 'match' : 'matches'}</Badge>}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text, cursor: 'pointer' }}>
          <input type="checkbox" data-testid="org-show-exited" checked={prefs.showExited} onChange={(e) => setOrgPrefs({ showExited: e.target.checked })} style={{ width: 16, height: 16 }} /> Show people who left ({exitedCount})
        </label>
        {prefs.view === 'chart' && (
          <>
            <Button size="sm" onClick={() => setOrgPrefs({ collapsed: [] })} data-testid="org-expand-all">Expand all</Button>
            <Button size="sm" onClick={() => setOrgPrefs({ collapsed: allWithKids })} data-testid="org-collapse-all">Collapse all</Button>
          </>
        )}
      </Toolbar>

      {tree.issues.length > 0 && (
        <Note tone="warn">
          <div data-testid="org-issues"><b>Check the reporting lines.</b>
            {tree.issues.map((i) => (
              <div key={i.employeeId + i.kind} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                <span>{i.message}</span>
                <Button size="sm" onClick={() => setModal({ kind: 'manager', id: i.employeeId })} aria-label={`Fix the reporting line for ${fullName(db.employees.find((e) => e.id === i.employeeId)!)}`}>Fix it</Button>
              </div>
            ))}
          </div>
        </Note>
      )}

      {prefs.view === 'chart' ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: narrow ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 300px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <Legend />
            <OrgCanvas db={db} tree={tree} layout={layout} vacancies={org.vacancies} selectedId={selectedId} matches={matches} searching={!!query.trim() && matches.size > 0}
              collapsed={collapsed} onSelect={setSelected} onToggle={toggle} onRemoveVacancy={(id) => { removeVacancy(id); toast.success('Open role removed'); }} focus={focus} />
          </div>
          <Card padding={16} style={{ minWidth: 0 }}>
            <div data-testid="org-detail">
              {selected ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Avatar name={fullName(selected)} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, color: T.text }}>{fullName(selected)}</div>
                      <div style={{ fontSize: 13, color: T.dim }}>{des(selected)}</div>
                    </div>
                  </div>
                  <dl style={{ margin: 0, display: 'grid', gap: 8, fontSize: 13.5 }}>
                    {([
                      ['Employee ID', selected.code], ['Department', db.departments.find((d) => d.id === selected.departmentId)?.name], ['Location', db.locations.find((l) => l.id === selected.locationId)?.name],
                      ['Status', selected.status.replace('_', ' ') + (selected.status === 'on_notice' && selected.lastWorkingDate ? `, last day ${fmtDate(selected.lastWorkingDate)}` : '')],
                      ['Reports to', parentOf.get(selected.id) ? fullName(parentOf.get(selected.id)!) : selected.reportingToId === selected.id ? 'Themselves (data mistake)' : 'Nobody set'],
                      ['Direct reports', String(selNode?.children.length ?? 0) + (selNode?.vacancies.length ? ` and ${selNode.vacancies.length} open` : '')],
                    ] as [string, string | undefined][]).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><dt style={{ color: T.mute }}>{k}</dt><dd style={{ margin: 0, textAlign: 'right', color: T.text }}>{v}</dd></div>
                    ))}
                  </dl>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <Button variant="primary" onClick={() => setModal({ kind: 'manager', id: selected.id })} data-testid="org-change-manager">Change manager</Button>
                    <Button onClick={() => setModal({ kind: 'vacancy', managerId: selected.id })}>Add an open role under {selected.firstName}</Button>
                    <Link href={`/dashboard/hrms/employees/${selected.id}`} className="km-btn" data-variant="secondary" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: 6, border: `1px solid ${T.borderStrong}`, fontSize: 13.5, fontWeight: 600, color: T.text, textDecoration: 'none', background: T.card }}>Open the employee record</Link>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13.5, color: T.dim, lineHeight: 1.55 }}>Select a person in the chart to see their details and change who they report to.<br /><br />Drag the chart to move it. With the chart focused, use the arrow keys to move, plus and minus to zoom, and 0 to fit.</div>
              )}
            </div>
          </Card>
        </div>
      ) : (
        <OrgList db={db} tree={tree} groupBy={prefs.groupBy} onChangeManager={(e) => setModal({ kind: 'manager', id: e.id })} onSelect={(id) => setSelected(id)} />
      )}

      {tree.unplaced.length > 0 && prefs.view === 'chart' && (
        <Card padding={16}>
          <CardTitle right={<Badge tone="neutral">{tree.unplaced.length}</Badge>}>No reporting line yet</CardTitle>
          <div style={{ fontSize: 13.5, color: T.dim, marginBottom: 12 }}>
            These people have no manager and nobody reports to them, so the chart does not draw them. The sample data records reporting lines for the sales team only. Choose a manager for each person and they join the chart.
          </div>
          <ul data-testid="org-unplaced" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(min(250px, 100%), 1fr))' }}>
            {tree.unplaced.map((e) => (
              <li key={e.id} data-match={matches.has(e.id) ? 'true' : undefined} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${matches.has(e.id) ? T.info : T.border}`, background: matches.has(e.id) ? T.infoWash : T.card, borderRadius: T.radius.md, padding: '8px 10px', borderLeft: `4px solid ${DEPT_COLOURS[e.departmentId] ?? T.border}` }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(e)}</span>
                  <span style={{ display: 'block', fontSize: 12, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{des(e)}{e.status !== 'active' ? ` · ${e.status.replace('_', ' ')}` : ''}</span>
                </span>
                <Button size="sm" onClick={() => setModal({ kind: 'manager', id: e.id })} aria-label={`Set a manager for ${fullName(e)}`} data-testid={`org-set-${e.id}`}>Set manager</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {modal?.kind === 'manager' && managerEntry && (
        <ChangeManagerModal db={db} person={managerEntry} onClose={() => setModal(null)} onDone={() => setSelected(managerEntry.id)} />
      )}
      {modal?.kind === 'vacancy' && <VacancyModal db={db} managerId={modal.managerId} onClose={() => setModal(null)} />}
    </HrmsPage>
  );
}

function collapsedWith(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function Legend() {
  const items: [string, string][] = [['dep_sales', 'Sales & Field'], ['dep_ops', 'Operations'], ['dep_fin', 'Finance'], ['dep_hr', 'People'], ['dep_wh', 'Warehouse'], ['dep_tech', 'Technology']];
  return (
    <div data-testid="org-legend" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, color: T.dim }}>
      {items.map(([id, label]) => <span key={id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: DEPT_COLOURS[id] }} />{label}</span>)}
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ width: 16, height: 10, border: `2px dashed ${T.warn}`, borderRadius: 3 }} />On notice</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ width: 16, height: 10, border: `2px dotted ${T.info}`, borderRadius: 3 }} />Joining</span>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><span aria-hidden style={{ width: 16, height: 10, border: `2px dashed ${T.borderStrong}`, borderRadius: 3 }} />Open role</span>
    </div>
  );
}

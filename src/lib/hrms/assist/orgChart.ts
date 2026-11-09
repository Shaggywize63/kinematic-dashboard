// Pure logic for the org chart: the tree from reportingToId, loop-safe manager changes, layout, stats and CSV rows.
// No React and no storage. The core data has quirks (a person recorded as reporting to themselves, managers who left),
// so every function here tolerates them and reports them as issues instead of failing.

import type { Employee, HrmsDb, Id } from '../types';
import { fmtDate, fullName } from '../format';
import type { Vacancy } from './types';

export interface OrgNode { emp: Employee; children: OrgNode[]; vacancies: Vacancy[]; depth: number }
export interface OrgIssue { employeeId: Id; kind: 'self' | 'loop' | 'missing_manager'; message: string }
export interface OrgTree {
  /** Top of each chart: people with reports (or open roles) and no manager. */
  roots: OrgNode[];
  /** People with no manager, no reports and no open roles. They are listed beside the chart, not drawn in it. */
  unplaced: Employee[];
  byId: Map<Id, OrgNode>;
  issues: OrgIssue[];
  /** People shown in total: placed plus unplaced. */
  visible: number;
}

const isLive = (e: Employee) => e.status !== 'exited';

/**
 * Build the tree. People who have left are left out unless `showExited`; their reports move up to the nearest manager
 * who is still shown, so nobody disappears with their manager.
 */
export function buildTree(employees: Employee[], vacancies: Vacancy[], opts: { showExited: boolean }): OrgTree {
  const all = new Map(employees.map((e) => [e.id, e]));
  const shown = new Set(employees.filter((e) => opts.showExited || isLive(e)).map((e) => e.id));
  const issues: OrgIssue[] = [];
  const parent = new Map<Id, Id>();

  for (const e of employees) {
    if (!shown.has(e.id) || !e.reportingToId) continue;
    if (e.reportingToId === e.id) { issues.push({ employeeId: e.id, kind: 'self', message: `${fullName(e)} is recorded as reporting to themselves.` }); continue; }
    if (!all.has(e.reportingToId)) { issues.push({ employeeId: e.id, kind: 'missing_manager', message: `${fullName(e)} reports to someone who is not in the records.` }); continue; }
    // Walk up past managers who are not shown (left the company).
    let m: Id | undefined = e.reportingToId; const seen = new Set<Id>([e.id]);
    while (m && !shown.has(m) && !seen.has(m)) { seen.add(m); const next: Id | undefined = all.get(m)?.reportingToId; m = next && next !== m ? next : undefined; }
    if (m && shown.has(m) && m !== e.id) parent.set(e.id, m);
  }

  // Break any loop: the person whose id sorts first in a loop becomes a top-level person.
  for (const id of parent.keys()) {
    const path: Id[] = []; let cur: Id | undefined = id;
    while (cur && parent.has(cur)) {
      if (path.includes(cur)) {
        const loop = path.slice(path.indexOf(cur)).sort();
        const cut = loop[0]!;
        parent.delete(cut);
        issues.push({ employeeId: cut, kind: 'loop', message: `${fullName(all.get(cut)!)} is part of a reporting loop. Shown as top-level until it is fixed.` });
        break;
      }
      path.push(cur); cur = parent.get(cur);
    }
  }

  const byId = new Map<Id, OrgNode>();
  for (const e of employees) if (shown.has(e.id)) byId.set(e.id, { emp: e, children: [], vacancies: [], depth: 0 });
  for (const [child, par] of parent) byId.get(par)!.children.push(byId.get(child)!);
  for (const v of vacancies) byId.get(v.managerId)?.vacancies.push(v);
  const byName = (a: OrgNode, b: OrgNode) => (b.children.length - a.children.length) || fullName(a.emp).localeCompare(fullName(b.emp));
  for (const n of byId.values()) n.children.sort(byName);

  const topLevel = [...byId.values()].filter((n) => !parent.has(n.emp.id)).sort(byName);
  const setDepth = (n: OrgNode, d: number) => { n.depth = d; n.children.forEach((c) => setDepth(c, d + 1)); };
  topLevel.forEach((n) => setDepth(n, 0));
  const roots = topLevel.filter((n) => n.children.length || n.vacancies.length);
  const unplaced = topLevel.filter((n) => !n.children.length && !n.vacancies.length).map((n) => n.emp);
  return { roots, unplaced, byId, issues, visible: byId.size };
}

// ───────────────────────────── changing a manager ─────────────────────────────
/** Everyone below a person, by the recorded reporting lines (a self-reference is ignored). Includes people who have left. */
export function subtreeIds(employees: Employee[], id: Id): Set<Id> {
  const kids = new Map<Id, Id[]>();
  for (const e of employees) if (e.reportingToId && e.reportingToId !== e.id) kids.set(e.reportingToId, [...(kids.get(e.reportingToId) ?? []), e.id]);
  const out = new Set<Id>(); const stack = [...(kids.get(id) ?? [])];
  while (stack.length) { const c = stack.pop()!; if (out.has(c) || c === id) continue; out.add(c); stack.push(...(kids.get(c) ?? [])); }
  return out;
}

export interface ReportCheck { ok: boolean; reason?: string }
/** Can `personId` report to `managerId`? Not to themselves, and not to anyone below them (that would make a loop). */
export function canReportTo(employees: Employee[], personId: Id, managerId: Id | undefined | null): ReportCheck {
  if (!managerId) return { ok: true };
  const person = employees.find((e) => e.id === personId);
  const mgr = employees.find((e) => e.id === managerId);
  if (!person || !mgr) return { ok: false, reason: 'That person is not in the records.' };
  if (personId === managerId) return { ok: false, reason: 'A person cannot report to themselves.' };
  if (subtreeIds(employees, personId).has(managerId)) return { ok: false, reason: `${fullName(mgr)} already reports to ${fullName(person)}, directly or through others. That would make a loop.` };
  if (mgr.status === 'exited') return { ok: false, reason: `${fullName(mgr)} has left the company.` };
  return { ok: true };
}
/** People who can be chosen as the new manager of `personId`. */
export function validManagers(employees: Employee[], personId: Id): Employee[] {
  return employees.filter((e) => canReportTo(employees, personId, e.id).ok).sort((a, b) => fullName(a).localeCompare(fullName(b)));
}

// ───────────────────────────── stats ─────────────────────────────
export interface OrgStats {
  people: number;
  managers: number;
  avgSpan: number;
  maxSpan: { name: string; n: number } | null;
  levels: number;
  noManager: number;
  vacancies: number;
}
export function orgStats(tree: OrgTree): OrgStats {
  const nodes = [...tree.byId.values()];
  const mgrs = nodes.filter((n) => n.children.length);
  const reports = mgrs.reduce((s, n) => s + n.children.length, 0);
  const max = mgrs.reduce<OrgNode | null>((m, n) => (!m || n.children.length > m.children.length ? n : m), null);
  return {
    people: tree.visible,
    managers: mgrs.length,
    avgSpan: mgrs.length ? Math.round((reports / mgrs.length) * 10) / 10 : 0,
    maxSpan: max ? { name: fullName(max.emp), n: max.children.length } : null,
    levels: nodes.length ? Math.max(...nodes.map((n) => n.depth)) + 1 : 0,
    noManager: tree.roots.length + tree.unplaced.length,
    vacancies: nodes.reduce((s, n) => s + n.vacancies.length, 0),
  };
}

// ───────────────────────────── search and paths ─────────────────────────────
export function searchIds(tree: OrgTree, db: HrmsDb, q: string): Id[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const des = (e: Employee) => db.designations.find((d) => d.id === e.designationId)?.name ?? '';
  return [...tree.byId.values()].filter((n) => `${fullName(n.emp)} ${n.emp.code} ${des(n.emp)}`.toLowerCase().includes(s)).map((n) => n.emp.id);
}
/** Ids from the top of the chart down to (not including) the person. */
export function ancestorsOf(tree: OrgTree, id: Id): Id[] {
  const parentOf = new Map<Id, Id>();
  for (const n of tree.byId.values()) for (const c of n.children) parentOf.set(c.emp.id, n.emp.id);
  const out: Id[] = []; let cur = parentOf.get(id);
  while (cur && !out.includes(cur)) { out.unshift(cur); cur = parentOf.get(cur); }
  return out;
}

// ───────────────────────────── layout ─────────────────────────────
export const BOX = { w: 212, h: 104, gapX: 18, gapY: 44, rootGap: 56, rowGap: 26 } as const;
export interface LayoutBox { key: string; kind: 'person' | 'vacancy'; id: Id; x: number; y: number; w: number; h: number }
export interface LayoutEdge { key: string; d: string; dashed: boolean }
export interface Layout { boxes: LayoutBox[]; edges: LayoutEdge[]; width: number; height: number }

const isLeaf = (n: OrgNode) => !n.children.length && !n.vacancies.length;
/** A manager whose team is four or more people and open roles, none of them managers, is drawn as a small grid instead of one long row. */
export const GRID_MIN = 4;
export const gridColumns = (n: number): number => Math.min(3, Math.ceil(n / 2));

/**
 * A tidy top-down layout: leaves take one slot each, a parent sits over the middle of its children. Collapsed people hide
 * their subtree. A team of four or more leaves is laid out as a grid of up to three columns, so wide teams stay readable.
 */
export function layoutTree(roots: OrgNode[], collapsed: Set<Id>): Layout {
  const boxes: LayoutBox[] = []; const edges: LayoutEdge[] = [];
  const unit = BOX.w + BOX.gapX;
  let slot = 0;
  const pos = new Map<string, { x: number; y: number }>();
  const add = (key: string, kind: LayoutBox['kind'], id: Id, x: number, y: number) => { boxes.push({ key, kind, id, x, y, w: BOX.w, h: BOX.h }); pos.set(key, { x, y }); };

  const place = (n: OrgNode): number => {
    const y = n.depth * (BOX.h + BOX.gapY);
    const key = `p:${n.emp.id}`;
    const open = !collapsed.has(n.emp.id);
    const items = open ? n.children.length + n.vacancies.length : 0;

    if (open && items >= GRID_MIN && n.children.every(isLeaf)) {
      const cols = gridColumns(items);
      const left = slot * unit; slot += cols;
      const x = left + (cols * unit - BOX.gapX - BOX.w) / 2;
      add(key, 'person', n.emp.id, x, y);
      const list: { key: string; kind: LayoutBox['kind']; id: Id }[] = [
        ...n.children.map((c) => ({ key: `p:${c.emp.id}`, kind: 'person' as const, id: c.emp.id })),
        ...n.vacancies.map((v) => ({ key: `v:${v.id}`, kind: 'vacancy' as const, id: v.id })),
      ];
      const top = y + BOX.h + BOX.gapY;
      const rows = Math.ceil(list.length / cols);
      const busY = (r: number) => top + r * (BOX.h + BOX.rowGap) - BOX.rowGap / 2;
      const trunkX = left - 12;
      list.forEach((it, i) => add(it.key, it.kind, it.id, left + (i % cols) * unit, top + Math.floor(i / cols) * (BOX.h + BOX.rowGap)));
      const px = x + BOX.w / 2;
      edges.push({ key: `${key}#stem`, d: `M${px},${y + BOX.h} V${busY(0)}`, dashed: false });
      if (rows > 1) edges.push({ key: `${key}#trunk`, d: `M${trunkX},${busY(0)} V${busY(rows - 1)}`, dashed: false });
      for (let r = 0; r < rows; r++) {
        const inRow = list.slice(r * cols, r * cols + cols);
        const lastCx = left + (inRow.length - 1) * unit + BOX.w / 2;
        edges.push({ key: `${key}#bus${r}`, d: `M${rows > 1 ? trunkX : left + BOX.w / 2},${busY(r)} H${r === 0 ? Math.max(lastCx, px) : lastCx}`, dashed: false });
        inRow.forEach((it, c) => edges.push({ key: `${key}>${it.key}`, d: `M${left + c * unit + BOX.w / 2},${busY(r)} V${top + r * (BOX.h + BOX.rowGap)}`, dashed: it.kind === 'vacancy' }));
      }
      return x;
    }

    const kids: { key: string; x: number }[] = [];
    if (open) {
      for (const c of n.children) kids.push({ key: `p:${c.emp.id}`, x: place(c) });
      for (const v of n.vacancies) {
        const vx = slot * unit; slot += 1;
        add(`v:${v.id}`, 'vacancy', v.id, vx, y + BOX.h + BOX.gapY);
        kids.push({ key: `v:${v.id}`, x: vx });
      }
    }
    let x: number;
    if (kids.length) x = (kids[0]!.x + kids[kids.length - 1]!.x) / 2;
    else { x = slot * unit; slot += 1; }
    add(key, 'person', n.emp.id, x, y);
    for (const k of kids) {
      const c = pos.get(k.key)!;
      const px = x + BOX.w / 2; const py = y + BOX.h; const cx = c.x + BOX.w / 2; const my = py + BOX.gapY / 2;
      edges.push({ key: `${key}>${k.key}`, d: `M${px},${py} V${my} H${cx} V${c.y}`, dashed: k.key.startsWith('v:') });
    }
    return x;
  };
  roots.forEach((r, i) => { if (i > 0) slot += BOX.rootGap / unit; place(r); });
  const width = boxes.reduce((m, b) => Math.max(m, b.x + b.w), 0);
  const height = boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0);
  return { boxes, edges, width, height };
}

// ───────────────────────────── colours, grouping, CSV ─────────────────────────────
export const DEPT_COLOURS: Record<string, string> = {
  dep_sales: '#3E9EFF', dep_ops: '#F59E0B', dep_fin: '#14B8A6', dep_hr: '#EC4899', dep_wh: '#8B5CF6', dep_tech: '#22C55E',
};
const FALLBACK = ['#64748B', '#06B6D4', '#EF4444', '#84CC16'];
export function deptColour(departmentId: string): string {
  if (DEPT_COLOURS[departmentId]) return DEPT_COLOURS[departmentId]!;
  let h = 0; for (const ch of departmentId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length]!;
}

export function groupPeople(db: HrmsDb, people: Employee[], by: 'department' | 'location'): { key: string; label: string; people: Employee[] }[] {
  const groups = new Map<string, { key: string; label: string; people: Employee[] }>();
  for (const e of people) {
    const key = by === 'department' ? e.departmentId : e.locationId;
    const label = by === 'department' ? db.departments.find((d) => d.id === key)?.name ?? key : db.locations.find((l) => l.id === key)?.name ?? key;
    const g = groups.get(key) ?? { key, label, people: [] };
    g.people.push(e); groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map((g) => ({ ...g, people: g.people.sort((a, b) => fullName(a).localeCompare(fullName(b))) }));
}

export const CSV_HEADER = ['Employee ID', 'Name', 'Designation', 'Department', 'Location', 'Reports to', 'Status', 'Level', 'Direct reports', 'Joined'];
export function orgRows(db: HrmsDb, tree: OrgTree): (string | number)[][] {
  const people = [...tree.byId.values()].sort((a, b) => fullName(a.emp).localeCompare(fullName(b.emp)));
  const parentOf = new Map<Id, OrgNode>();
  for (const n of tree.byId.values()) for (const c of n.children) parentOf.set(c.emp.id, n);
  return people.map((n) => [
    n.emp.code, fullName(n.emp), db.designations.find((d) => d.id === n.emp.designationId)?.name ?? '',
    db.departments.find((d) => d.id === n.emp.departmentId)?.name ?? '', db.locations.find((l) => l.id === n.emp.locationId)?.name ?? '',
    parentOf.get(n.emp.id) ? fullName(parentOf.get(n.emp.id)!.emp) : '', n.emp.status.replace('_', ' '), n.depth + 1, n.children.length, fmtDate(n.emp.joinDate),
  ]);
}

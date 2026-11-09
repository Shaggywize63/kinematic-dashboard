'use client';
// The org chart canvas: person cards and dashed open-role boxes drawn with plain HTML and one SVG for the lines.
// Zoom and pan are a CSS transform driven by buttons, the keyboard (arrows, plus, minus, 0) and dragging.

import { PointerEvent as RPointerEvent, KeyboardEvent as RKeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Avatar, Badge, T } from '../ui';
import type { HrmsDb, Id } from '../../../lib/hrms/types';
import { fmtDate, fmtMonth, fullName } from '../../../lib/hrms/format';
import { BOX, deptColour, type Layout, type OrgNode, type OrgTree } from '../../../lib/hrms/assist/orgChart';
import type { Vacancy } from '../../../lib/hrms/assist/types';

const MIN = 0.3; const MAX = 1.6;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

interface View { x: number; y: number; scale: number }

export interface OrgCanvasProps {
  db: HrmsDb;
  tree: OrgTree;
  layout: Layout;
  vacancies: Vacancy[];
  selectedId: Id | null;
  matches: Set<Id>;
  searching: boolean;
  collapsed: Set<Id>;
  onSelect: (id: Id) => void;
  onToggle: (id: Id) => void;
  onRemoveVacancy: (id: Id) => void;
  /** Changes whenever the chart should scroll a person into view. */
  focus: { id: Id; n: number } | null;
}

export default function OrgCanvas(p: OrgCanvasProps) {
  const { db, tree, layout } = p;
  const vp = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 16, y: 16, scale: 1 });
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);

  const size = useCallback(() => { const r = vp.current?.getBoundingClientRect(); return { w: r?.width ?? 800, h: r?.height ?? 520 }; }, []);

  /** Fit the whole chart in the box, but never smaller than 55% so the cards stay readable. */
  const fit = useCallback(() => {
    const { w, h } = size();
    if (!layout.width) { setView({ x: 16, y: 16, scale: 1 }); return; }
    const s = clamp(Math.min((w - 32) / layout.width, (h - 32) / layout.height, 1), 0.55, 1);
    const x = layout.width * s <= w ? (w - layout.width * s) / 2 : 16;
    setView({ x, y: 16, scale: s });
  }, [layout.width, layout.height, size]);

  // Fit once, when the chart first has something in it.
  const fitted = useRef(false);
  useLayoutEffect(() => { if (!fitted.current && layout.width) { fitted.current = true; fit(); } }, [layout.width, fit]);

  // Centre a person in the box when asked (search, "show in chart").
  useEffect(() => {
    if (!p.focus) return;
    const b = layout.boxes.find((x) => x.key === `p:${p.focus!.id}`);
    if (!b) return;
    const { w, h } = size();
    setView((v) => ({ ...v, x: w / 2 - (b.x + b.w / 2) * v.scale, y: h / 3 - (b.y + b.h / 2) * v.scale }));
  }, [p.focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoom = (f: number) => setView((v) => {
    const { w, h } = size();
    const s = clamp(Math.round(v.scale * f * 100) / 100, MIN, MAX);
    const k = s / v.scale;
    return { scale: s, x: w / 2 - (w / 2 - v.x) * k, y: h / 2 - (h / 2 - v.y) * k };
  });
  const pan = (dx: number, dy: number) => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));

  const onKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = 64;
    const map: Record<string, () => void> = {
      ArrowLeft: () => pan(step, 0), ArrowRight: () => pan(-step, 0), ArrowUp: () => pan(0, step), ArrowDown: () => pan(0, -step),
      '+': () => zoom(1.2), '=': () => zoom(1.2), '-': () => zoom(1 / 1.2), '0': fit,
    };
    const f = map[e.key];
    if (f) { e.preventDefault(); f(); }
  };

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    drag.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    d.moved = true;
    setView((v) => ({ ...v, x: d.x + (e.clientX - d.px), y: d.y + (e.clientY - d.py) }));
  };
  const up = (e: RPointerEvent<HTMLDivElement>) => {
    drag.current = null; setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const ctl = (label: string, onClick: () => void, children: React.ReactNode, testid?: string) => (
    <button type="button" aria-label={label} title={label} data-testid={testid} onClick={onClick} style={{
      width: 32, height: 32, borderRadius: 6, border: `1px solid ${T.border}`, background: T.card, color: T.text, cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>{children}</button>
  );

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', marginBottom: 8 }} role="group" aria-label="Zoom and pan">
        {ctl('Zoom out', () => zoom(1 / 1.2), '−', 'org-zoom-out')}
        <span data-testid="org-zoom" aria-live="polite" style={{ minWidth: 48, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, color: T.dim }}>{Math.round(view.scale * 100)}%</span>
        {ctl('Zoom in', () => zoom(1.2), '+', 'org-zoom-in')}
        {ctl('Fit the chart in view', fit, '⤢', 'org-fit')}
        {ctl('Reset zoom to 100%', () => setView({ x: 16, y: 16, scale: 1 }), '1:1', 'org-reset')}
        {ctl('Move the chart left', () => pan(-80, 0), '←', 'org-pan-left')}
        {ctl('Move the chart up', () => pan(0, -80), '↑', 'org-pan-up')}
        {ctl('Move the chart down', () => pan(0, 80), '↓', 'org-pan-down')}
        {ctl('Move the chart right', () => pan(80, 0), '→', 'org-pan-right')}
      </div>
      <div ref={vp} data-testid="org-viewport" role="region" tabIndex={0} aria-label="Org chart. Focus here, then use the arrow keys to move, plus and minus to zoom, and zero to fit."
        onKeyDown={onKey} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        style={{ position: 'relative', height: 'min(560px, 70vh)', minHeight: 340, overflow: 'hidden', border: `1px solid ${T.border}`, borderRadius: T.radius.lg, background: T.panel, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', outlineOffset: 2 }}>
        <div data-testid="org-canvas" style={{ position: 'absolute', left: 0, top: 0, width: layout.width, height: layout.height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: '0 0' }}>
          <svg width={layout.width} height={layout.height} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden>
            {layout.edges.map((e) => <path key={e.key} d={e.d} fill="none" stroke="var(--border-l)" strokeWidth={1.5} strokeDasharray={e.dashed ? '5 4' : undefined} />)}
          </svg>
          {layout.boxes.map((b) => {
            if (b.kind === 'person') {
              const node = tree.byId.get(b.id)!;
              return <PersonCard key={b.key} db={db} node={node} x={b.x} y={b.y} selected={p.selectedId === b.id} match={p.matches.has(b.id)} dim={p.searching && !p.matches.has(b.id)}
                collapsed={p.collapsed.has(b.id)} onSelect={() => p.onSelect(b.id)} onToggle={() => p.onToggle(b.id)} />;
            }
            const v = p.vacancies.find((x) => x.id === b.id)!;
            return <VacancyCard key={b.key} db={db} v={v} x={b.x} y={b.y} onRemove={() => p.onRemoveVacancy(v.id)} />;
          })}
        </div>
        {!layout.boxes.length && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.dim, fontSize: 14, padding: 24, textAlign: 'center' }}>No reporting lines to draw yet. Set a manager for someone in the list below.</div>}
      </div>
    </div>
  );
}

function PersonCard({ db, node, x, y, selected, match, dim, collapsed, onSelect, onToggle }: {
  db: HrmsDb; node: OrgNode; x: number; y: number; selected: boolean; match: boolean; dim: boolean; collapsed: boolean; onSelect: () => void; onToggle: () => void;
}) {
  const e = node.emp;
  const des = db.designations.find((d) => d.id === e.designationId)?.name ?? '';
  const dep = db.departments.find((d) => d.id === e.departmentId)?.name ?? '';
  const loc = db.locations.find((l) => l.id === e.locationId)?.city ?? '';
  const colour = deptColour(e.departmentId);
  const kids = node.children.length + node.vacancies.length;
  const border = e.status === 'on_notice' ? `2px dashed ${T.warn}` : e.status === 'onboarding' ? `2px dotted ${T.info}` : `1px solid ${selected ? T.borderStrong : T.border}`;
  const statusText = e.status === 'on_notice' ? `On notice${e.lastWorkingDate ? ` · last day ${fmtDate(e.lastWorkingDate)}` : ''}` : e.status === 'onboarding' ? `Joining ${fmtDate(e.joinDate)}` : e.status === 'exited' ? `Left ${e.lastWorkingDate ? fmtDate(e.lastWorkingDate) : ''}` : '';
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: BOX.w, height: BOX.h, opacity: dim ? 0.45 : e.status === 'exited' ? 0.6 : 1, filter: e.status === 'exited' ? 'grayscale(1)' : undefined }}>
      <button type="button" data-testid={`org-node-${e.id}`} data-status={e.status} data-match={match ? 'true' : undefined} aria-pressed={selected}
        aria-label={`${fullName(e)}, ${des}, ${dep}, ${e.status.replace('_', ' ')}${kids ? `, ${node.children.length} direct reports` : ''}`} onClick={onSelect}
        style={{
          width: '100%', height: '100%', boxSizing: 'border-box', textAlign: 'left', fontFamily: 'inherit', color: T.text, cursor: 'pointer', padding: '6px 10px 6px 14px', overflow: 'hidden', justifyContent: 'center',
          background: match ? T.infoWash : T.card, border, borderRadius: T.radius.md, display: 'flex', flexDirection: 'column', gap: 3,
          boxShadow: match ? `0 0 0 3px ${T.ring}` : selected ? `0 0 0 2px ${T.ring}` : '0 1px 2px rgba(10,14,26,.08)',
        }}>
        <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: colour }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Avatar name={fullName(e)} size={26} />
          <span style={{ display: 'block', minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fullName(e)}</span>
            <span style={{ display: 'block', fontSize: 12, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{des}</span>
          </span>
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: T.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{loc} · {dep}</span>
        <span style={{ display: 'block', minHeight: 18 }}>
          {statusText ? <Badge tone={e.status === 'on_notice' ? 'warn' : e.status === 'onboarding' ? 'info' : 'neutral'} style={{ height: 18, fontSize: 11, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{statusText}</Badge>
            : <Badge tone="ok" dot style={{ height: 18, fontSize: 11 }}>Active</Badge>}
        </span>
      </button>
      {kids > 0 && (
        <button type="button" data-testid={`org-toggle-${e.id}`} aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${fullName(e)}'s team (${node.children.length} ${node.children.length === 1 ? 'person' : 'people'}${node.vacancies.length ? `, ${node.vacancies.length} open` : ''})`}
          onClick={onToggle}
          style={{ position: 'absolute', left: '50%', bottom: -13, transform: 'translateX(-50%)', height: 24, minWidth: 40, padding: '0 8px', borderRadius: 999, border: `1px solid ${T.borderStrong}`, background: T.card, color: T.text, fontFamily: 'inherit', fontSize: 11.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, zIndex: 2 }}>
          <span aria-hidden>{collapsed ? '▸' : '▾'}</span>{node.children.length + node.vacancies.length}
        </button>
      )}
    </div>
  );
}

function VacancyCard({ db, v, x, y, onRemove }: { db: HrmsDb; v: Vacancy; x: number; y: number; onRemove: () => void }) {
  const loc = db.locations.find((l) => l.id === v.locationId)?.city;
  const dep = db.departments.find((d) => d.id === v.departmentId)?.name;
  return (
    <div data-testid={`org-vacancy-${v.id}`} style={{ position: 'absolute', left: x, top: y, width: BOX.w, height: BOX.h, boxSizing: 'border-box', border: `2px dashed ${T.borderStrong}`, borderRadius: T.radius.md, background: 'transparent', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 3, color: T.text, justifyContent: 'center' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
        <Badge tone="neutral" style={{ height: 18, fontSize: 11 }}>Open role</Badge>
        <button type="button" aria-label={`Remove open role ${v.title}`} onClick={onRemove} style={{ border: 0, background: 'transparent', color: T.dim, cursor: 'pointer', fontSize: 16, lineHeight: '18px', height: 18, padding: '0 2px' }}>×</button>
      </span>
      <span style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</span>
      <span style={{ fontSize: 11.5, color: T.mute, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[loc, dep].filter(Boolean).join(' · ')}</span>
      <span style={{ fontSize: 11.5, color: T.dim }}>{v.targetMonth ? `Planned for ${fmtMonth(v.targetMonth)}` : 'No date set'}</span>
    </div>
  );
}

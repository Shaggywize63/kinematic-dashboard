'use client';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import type { AppCustomization } from '../../lib/appCustomization';
import {
  APP_ITEM_NEEDS, BAR_ONLY, MAX_EXTRA_TABS, TAB_CAPABLE, boardLabel, boardOf, heldFrom, homeSectionOf, itemDef, listOf,
  moveItem, needLabel, resetLayout, setListHidden, setListOrder,
  type Board, type ListSection, type Zone,
} from '../../lib/appLayout';

/**
 * Client Management → App layout.
 *
 * Drag screens between the bottom bar, the side menu and Hidden, and reorder them; Settings rows, CRM "More" rows and Home
 * cards reorder in their own lists. Only screens the client's ticked modules provide are draggable — the rest are listed
 * as "needs <module>". Everything is also reachable without a pointer (move up / down and a "Move to" menu on every
 * item). All edits go through lib/appLayout.ts and are written to `app_ui` (hide flags + `layout`), which the apps read.
 */

interface Props {
  value: AppCustomization;
  onChange: (next: AppCustomization) => void;
  /** The module ids currently ticked in the client form. */
  modules: string[];
}

const ZONES: { id: Zone; title: string; hint: string }[] = [
  { id: 'bar', title: 'Bottom bar', hint: `Home + up to ${MAX_EXTRA_TABS} screens` },
  { id: 'menu', title: 'Side menu', hint: 'Opens from the ☰ button' },
  { id: 'hidden', title: 'Hidden', hint: 'Not shown anywhere in the app' },
];

const LISTS: { id: ListSection; title: string }[] = [
  { id: 'settings', title: 'Settings screen rows' },
  { id: 'crm_more', title: 'CRM “More” menu' },
  { id: 'home', title: 'Home screen cards' },
];

const GRIP = (
  <svg width={12} height={14} viewBox="0 0 12 16" aria-hidden fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></svg>
);

const btn: React.CSSProperties = {
  border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--textSec)', borderRadius: 6,
  width: 24, height: 24, fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0,
};

/** Index at which a pointer would drop inside `container`, from the vertical midpoints of its `[data-item-id]` children. */
function dropIndex(container: HTMLElement, clientY: number, skipId?: string): number {
  const kids = Array.from(container.querySelectorAll<HTMLElement>('[data-item-id]')).filter((k) => k.dataset.itemId !== skipId);
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return kids.length;
}

export default function AppLayoutEditor({ value, onChange, modules }: Props) {
  const held = useMemo(() => heldFrom(modules), [modules]);
  const board: Board = useMemo(() => boardOf(value, held), [value, held]);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState<{ id: string; from: 'zone' | ListSection } | null>(null);
  const [over, setOver] = useState<{ target: Zone | ListSection; index: number } | null>(null);
  const zoneRefs = useRef<Record<string, HTMLElement | null>>({});

  const apply = (id: string, zone: Zone, index: number) => {
    const r = moveItem(value, held, id, zone, index);
    setError(r.error ?? '');
    if (!r.error) onChange(r.cfg);
  };
  const zoneIds = (z: Zone) => (z === 'bar' ? board.bar : z === 'menu' ? board.menu : board.hidden);
  const zoneOf = (id: string): Zone => (board.bar.includes(id) ? 'bar' : board.hidden.includes(id) ? 'hidden' : 'menu');
  const step = (id: string, dir: -1 | 1) => {
    const z = zoneOf(id);
    const ids = zoneIds(z);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length || z === 'hidden') return;
    apply(id, z, j);
  };
  const canGo = (id: string, z: Zone): boolean => {
    if (z === 'bar') return TAB_CAPABLE.includes(id);
    if (z === 'menu') return !BAR_ONLY.includes(id);
    return true;
  };

  const onZoneDrop = (e: DragEvent, z: Zone) => {
    e.preventDefault();
    const id = drag?.id || e.dataTransfer.getData('text/plain');
    const el = zoneRefs.current[z];
    const idx = el ? dropIndex(el, e.clientY, id) : 0;
    setDrag(null); setOver(null);
    if (id && drag?.from === 'zone') apply(id, z, idx);
  };

  const renderItem = (id: string, z: Zone) => {
    const label = boardLabel(value, id);
    const ids = zoneIds(z);
    const pos = ids.indexOf(id);
    const barOnly = BAR_ONLY.includes(id);
    return (
      <div
        key={id} role="listitem" data-item-id={id} draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setDrag({ id, from: 'zone' }); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, cursor: 'grab',
          background: 'var(--s2)', border: '1px solid var(--border)', opacity: drag?.id === id ? 0.45 : 1,
        }}
      >
        <span style={{ color: 'var(--textTert)', display: 'inline-flex' }}>{GRIP}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
          {barOnly && <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: 'var(--textTert)', textTransform: 'uppercase', letterSpacing: 0.4 }}>tab only</span>}
        </span>
        {z !== 'hidden' && (
          <>
            <button type="button" style={btn} aria-label={`Move ${label} up`} disabled={pos <= 0} onClick={() => step(id, -1)}>↑</button>
            <button type="button" style={btn} aria-label={`Move ${label} down`} disabled={pos >= ids.length - 1} onClick={() => step(id, 1)}>↓</button>
          </>
        )}
        <select
          aria-label={`Move ${label} to`} value={z}
          onChange={(e) => { const to = e.target.value as Zone; apply(id, to, zoneIds(to).length); }}
          style={{ fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', maxWidth: 104 }}
        >
          {ZONES.map((o) => <option key={o.id} value={o.id} disabled={!canGo(id, o.id)}>{o.title}</option>)}
        </select>
      </div>
    );
  };

  const renderZone = (z: (typeof ZONES)[number]) => {
    const ids = zoneIds(z.id);
    const showLine = over?.target === z.id && drag?.from === 'zone';
    return (
      <div key={z.id} style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)' }}>{z.title}</div>
          <div style={{ fontSize: 10.5, color: 'var(--textTert)' }}>{z.id === 'bar' ? `${ids.length}/${MAX_EXTRA_TABS}` : z.hint}</div>
        </div>
        <div
          ref={(el) => { zoneRefs.current[z.id] = el; }}
          role="list" aria-label={z.title}
          onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const el = zoneRefs.current[z.id]; setOver({ target: z.id, index: el ? dropIndex(el, e.clientY, drag.id) : 0 }); }}
          onDragLeave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOver((o) => (o?.target === z.id ? null : o)); }}
          onDrop={(e) => onZoneDrop(e, z.id)}
          style={{
            display: 'flex', flexDirection: 'column', gap: 6, minHeight: 64, padding: 8, borderRadius: 12,
            background: 'var(--s3)', border: `1.5px dashed ${showLine ? 'var(--primary)' : 'var(--border)'}`,
          }}
        >
          {z.id === 'bar' && <div style={{ padding: '6px 8px', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--textTert)', border: '1px solid var(--border)' }}>Home <span style={{ fontWeight: 500 }}>(always first)</span></div>}
          {z.id === 'menu' && <div style={{ padding: '6px 8px', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--textTert)', border: '1px solid var(--border)' }}>Home <span style={{ fontWeight: 500 }}>(always first)</span></div>}
          {ids.map((id) => renderItem(id, z.id))}
          {ids.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--textTert)', padding: '6px 4px' }}>{z.id === 'hidden' ? 'Nothing hidden.' : 'Drop screens here.'}</div>}
          {z.id === 'menu' && <div style={{ padding: '6px 8px', borderRadius: 9, fontSize: 12, fontWeight: 700, color: 'var(--textTert)', border: '1px solid var(--border)' }}>Settings · Sign out <span style={{ fontWeight: 500 }}>(always last)</span></div>}
        </div>
      </div>
    );
  };

  const renderList = (section: ListSection, title: string) => {
    const { rows, unavailable } = listOf(value, held, section);
    if (!rows.length && !unavailable.length) return null;
    const reorder = (id: string, to: number) => {
      const ids = rows.map((r) => r.id).filter((x) => x !== id);
      ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
      onChange(setListOrder(value, section, ids));
    };
    return (
      <div key={section} style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)', marginBottom: 6 }}>{title}</div>
        <div
          role="list" aria-label={title}
          onDragOver={(e) => { if (drag?.from === section) { e.preventDefault(); setOver({ target: section, index: 0 }); } }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag?.from !== section) return;
            reorder(drag.id, dropIndex(e.currentTarget as HTMLElement, e.clientY, drag.id));
            setDrag(null); setOver(null);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 12, background: 'var(--s3)', border: '1.5px dashed var(--border)' }}
        >
          {rows.map((r, i) => (
            <div
              key={r.id} role="listitem" data-item-id={r.id} draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; setDrag({ id: r.id, from: section }); }}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, cursor: 'grab', background: 'var(--s2)', border: '1px solid var(--border)', opacity: drag?.id === r.id ? 0.45 : r.hidden ? 0.6 : 1 }}
            >
              <span style={{ color: 'var(--textTert)', display: 'inline-flex' }}>{GRIP}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textDecoration: r.hidden ? 'line-through' : 'none' }}>{r.label}</span>
              <button type="button" style={btn} aria-label={`Move ${r.label} up`} disabled={i === 0} onClick={() => reorder(r.id, i - 1)}>↑</button>
              <button type="button" style={btn} aria-label={`Move ${r.label} down`} disabled={i === rows.length - 1} onClick={() => reorder(r.id, i + 1)}>↓</button>
              <button
                type="button" style={{ ...btn, width: 'auto', padding: '0 7px', color: r.hidden ? 'var(--textTert)' : 'var(--text)' }}
                aria-pressed={!r.hidden} aria-label={`${r.hidden ? 'Show' : 'Hide'} ${r.label}`}
                onClick={() => onChange(setListHidden(value, section, r.id, !r.hidden))}
              >{r.hidden ? 'Hidden' : 'Shown'}</button>
            </div>
          ))}
        </div>
        {unavailable.length > 0 && (
          <div style={{ fontSize: 10.5, color: 'var(--textTert)', marginTop: 5 }}>
            Not available: {unavailable.map((u) => `${u.label} (needs ${needLabel(APP_ITEM_NEEDS[section][u.id])})`).join(' · ')}
          </div>
        )}
      </div>
    );
  };

  const unavailable = board.unavailable.filter((id) => !!itemDef(id));
  const hasLayout = !!value.layout && Object.keys(value.layout).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 11.5, color: 'var(--textSec)', lineHeight: 1.5 }}>
        Drag screens between the <b>bottom bar</b>, the <b>side menu</b> and <b>Hidden</b>, and drag to reorder. Only screens the
        ticked modules provide can be placed. Home stays first; Settings and Sign out stay last. Every item also has ↑ ↓ and a
        <b> Move to</b> menu if you prefer not to drag.
      </div>

      {error && <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '8px 12px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {ZONES.map(renderZone)}
      </div>

      {unavailable.length > 0 && (
        <details>
          <summary style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--textSec)', cursor: 'pointer' }}>
            Not available — needs a module that isn’t ticked ({unavailable.length})
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {unavailable.map((id) => (
              <span key={id} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 999, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--textTert)' }}>
                {boardLabel(value, id)} · needs {needLabel(APP_ITEM_NEEDS[homeSectionOf(id)][id])}
              </span>
            ))}
          </div>
        </details>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14 }}>
        {LISTS.map((l) => renderList(l.id, l.title))}
      </div>

      <Preview value={value} board={board} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button" disabled={!hasLayout} onClick={() => { setError(''); onChange(resetLayout(value)); }}
          style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--s2)', color: hasLayout ? 'var(--text)' : 'var(--textTert)', fontSize: 12, fontWeight: 600, cursor: hasLayout ? 'pointer' : 'default' }}
        >Reset layout</button>
        <span style={{ fontSize: 11, color: 'var(--textTert)' }}>Resets order and bottom-bar placement; hidden screens and renames stay.</span>
      </div>
    </div>
  );
}

/** A small mock of the phone: the bottom bar and the side menu as the current layout would show them. */
function Preview({ value, board }: { value: AppCustomization; board: Board }) {
  const tab = (label: string, key: string) => (
    <div key={key} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, fontWeight: 600, color: 'var(--textSec)', padding: '6px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
  );
  return (
    <div aria-label="Preview" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ width: 210, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--s2)', padding: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)', marginBottom: 6 }}>Preview · bottom bar</div>
        <div style={{ height: 36, borderRadius: 8, background: 'var(--s3)', marginBottom: 8 }} />
        <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 2 }}>
          {tab('Home', 'home')}
          {board.bar.map((id) => tab(boardLabel(value, id), id))}
        </div>
      </div>
      <div style={{ width: 210, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--s2)', padding: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)', marginBottom: 6 }}>Preview · side menu</div>
        {['Home', ...board.menu.map((id) => boardLabel(value, id)), 'Settings', 'Sign out'].map((l, i) => (
          <div key={`${l}-${i}`} style={{ fontSize: 11, color: 'var(--text)', padding: '3px 4px' }}>{l}</div>
        ))}
      </div>
    </div>
  );
}

'use client';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import type { AppCustomization, AppUiSection } from '../../lib/appCustomization';
import {
  APP_ITEM_NEEDS, BAR_ONLY, MAX_EXTRA_TABS, TAB_CAPABLE, boardLabel, boardOf, defaultLabelOf, heldFrom, homeSectionOf, itemDef,
  labelOf, listOf, moveItem, needLabel, resetLayout, setLabel, setListHidden, setListOrder, zoneOfItem,
  type Board, type ListSection, type Zone,
} from '../../lib/appLayout';
import AppPreview, { BASE_H, BASE_W, type Platform, type PreviewScreen, type Sel } from './AppPreview';

/**
 * Client Management → App layout.
 *
 * Drag screens between the bottom bar, the side menu and Hidden, and reorder them; Settings rows, CRM "More" rows and Home
 * cards reorder in their own lists. Only screens the client's ticked modules provide are draggable — the rest are listed
 * as "needs <module>". Everything is also reachable without a pointer (move up / down and a "Move to" menu on every
 * item). All edits go through lib/appLayout.ts and are written to `app_ui` (hide flags + `layout` + `labels`), which the
 * apps read.
 *
 * Beside the lists sits a live phone (AppPreview) that redraws on every edit. Screens in it can be clicked to rename, move
 * or hide them in place, and dragged between the bar and the side menu. "Full screen" opens the same editor in a large
 * designer. The phone is a schematic: it shows WHICH screens appear WHERE and in what order, not the apps' exact styling.
 */

interface Props {
  value: AppCustomization;
  onChange: (next: AppCustomization) => void;
  /** The module ids currently ticked in the client form. */
  modules: string[];
  /** Shown in the full-screen designer's header (the client's name). */
  title?: string;
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

const SCREENS: { id: PreviewScreen; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'menu', label: 'Side menu' },
  { id: 'settings', label: 'Settings' },
  { id: 'crm', label: 'CRM More' },
];

const SECTION_NAME: Record<AppUiSection, string> = {
  menu: 'Side menu / bar', tabs: 'Bottom bar', settings: 'Settings screen', crm_more: 'CRM “More” menu', home: 'Home screen card',
};

const ZOOMS = [0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5];

const GRIP = (
  <svg width={12} height={14} viewBox="0 0 12 16" aria-hidden fill="currentColor"><circle cx="3" cy="3" r="1.4"/><circle cx="9" cy="3" r="1.4"/><circle cx="3" cy="8" r="1.4"/><circle cx="9" cy="8" r="1.4"/><circle cx="3" cy="13" r="1.4"/><circle cx="9" cy="13" r="1.4"/></svg>
);

const btn: React.CSSProperties = {
  border: '1px solid var(--border)', background: 'var(--s2)', color: 'var(--textSec)', borderRadius: 6,
  width: 24, height: 24, fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0,
};

const seg = (active: boolean): React.CSSProperties => ({
  padding: '5px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', border: 'none',
  background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--textSec)',
});

const segGroup: React.CSSProperties = { display: 'inline-flex', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--s2)' };

/** Index at which a pointer would drop inside `container`, from the vertical midpoints of its `[data-item-id]` children. */
function dropIndex(container: HTMLElement, clientY: number, skipId?: string): number {
  const kids = Array.from(container.querySelectorAll<HTMLElement>('[data-item-id]')).filter((k) => k.dataset.itemId !== skipId);
  for (let i = 0; i < kids.length; i++) {
    const r = kids[i].getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return i;
  }
  return kids.length;
}

export default function AppLayoutEditor({ value, onChange, modules, title }: Props) {
  const held = useMemo(() => heldFrom(modules), [modules]);
  const board: Board = useMemo(() => boardOf(value, held), [value, held]);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState<{ id: string; from: 'zone' | ListSection } | null>(null);
  const [over, setOver] = useState<{ target: Zone | ListSection; index: number } | null>(null);
  const zoneRefs = useRef<Record<string, HTMLElement | null>>({});

  // Live preview state.
  const [sel, setSel] = useState<Sel | null>(null);
  const [screen, setScreen] = useState<PreviewScreen>('home');
  const [platform, setPlatform] = useState<Platform>('android');
  const [zoom, setZoom] = useState({ inline: 0.9, full: 1 });
  const [full, setFull] = useState(false);
  const openBtn = useRef<HTMLButtonElement>(null);
  const wasFull = useRef(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full]);
  useEffect(() => {
    if (!full && wasFull.current) openBtn.current?.focus();
    wasFull.current = full;
  }, [full]);

  const openFull = () => {
    // Largest zoom whose phone fits under the designer's header and toolbar.
    const fit = ZOOMS.filter((z) => BASE_H * z <= window.innerHeight - 230).pop() ?? ZOOMS[0];
    setZoom((p) => ({ ...p, full: fit }));
    setFull(true);
  };

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
  const reorderList = (section: ListSection, id: string, to: number) => {
    const ids = listOf(value, held, section).rows.map((r) => r.id).filter((x) => x !== id);
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, id);
    onChange(setListOrder(value, section, ids));
  };

  /** Select a screen from a list on the left: also bring the matching phone screen up so the change is visible. */
  const focusItem = (s: Sel, z: Zone | null) => {
    setSel(s);
    if (s.section === 'settings') setScreen('settings');
    else if (s.section === 'crm_more') setScreen('crm');
    else if (s.section === 'home') setScreen('home');
    else if (z === 'menu') setScreen('menu');
    else if (z === 'bar' && screen === 'crm') setScreen('home');
  };

  const onZoneDrop = (e: DragEvent, z: Zone) => {
    e.preventDefault();
    const id = drag?.id || e.dataTransfer.getData('text/plain');
    const el = zoneRefs.current[z];
    const idx = el ? dropIndex(el, e.clientY, id) : 0;
    setDrag(null); setOver(null);
    if (id && drag?.from === 'zone') apply(id, z, idx);
  };

  const isSel = (section: AppUiSection, id: string) => sel?.section === section && sel.id === id;

  // ── The selected screen, if it still exists ──
  const selIsBoard = !!sel && (sel.section === 'menu' || sel.section === 'tabs');
  const selZone: Zone | null = sel && selIsBoard ? zoneOfItem(board, sel.id) : null;
  const selListRows = sel && !selIsBoard ? listOf(value, held, sel.section as ListSection).rows : [];
  const selRow = sel && !selIsBoard ? selListRows.find((r) => r.id === sel.id) : undefined;
  const selValid = !!sel && (selIsBoard ? selZone !== null : !!selRow);

  const renderItem = (id: string, z: Zone) => {
    const label = boardLabel(value, id);
    const ids = zoneIds(z);
    const pos = ids.indexOf(id);
    const barOnly = BAR_ONLY.includes(id);
    const picked = isSel(homeSectionOf(id), id);
    return (
      <div
        key={id} role="listitem" data-item-id={id} draggable aria-current={picked || undefined}
        onClick={() => focusItem({ section: homeSectionOf(id), id }, z)}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; setDrag({ id, from: 'zone' }); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, cursor: 'grab',
          background: 'var(--s2)', border: `1px solid ${picked ? 'var(--primary)' : 'var(--border)'}`, opacity: drag?.id === id ? 0.45 : 1,
        }}
      >
        <span style={{ color: 'var(--textTert)', display: 'inline-flex' }}>{GRIP}</span>
        <span title={label} style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
          style={{ fontSize: 11, padding: '3px 4px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', maxWidth: 96 }}
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
    return (
      <div key={section} style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)', marginBottom: 6 }}>{title}</div>
        <div
          role="list" aria-label={title}
          onDragOver={(e) => { if (drag?.from === section) { e.preventDefault(); setOver({ target: section, index: 0 }); } }}
          onDrop={(e) => {
            e.preventDefault();
            if (drag?.from !== section) return;
            reorderList(section, drag.id, dropIndex(e.currentTarget as HTMLElement, e.clientY, drag.id));
            setDrag(null); setOver(null);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, borderRadius: 12, background: 'var(--s3)', border: '1.5px dashed var(--border)' }}
        >
          {rows.map((r, i) => {
            const picked = isSel(section, r.id);
            return (
              <div
                key={r.id} role="listitem" data-item-id={r.id} draggable aria-current={picked || undefined}
                onClick={() => focusItem({ section, id: r.id }, null)}
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; setDrag({ id: r.id, from: section }); }}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 9, cursor: 'grab', background: 'var(--s2)', border: `1px solid ${picked ? 'var(--primary)' : 'var(--border)'}`, opacity: drag?.id === r.id ? 0.45 : r.hidden ? 0.6 : 1 }}
              >
                <span style={{ color: 'var(--textTert)', display: 'inline-flex' }}>{GRIP}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', textDecoration: r.hidden ? 'line-through' : 'none' }}>{r.label}</span>
                <button type="button" style={btn} aria-label={`Move ${r.label} up`} disabled={i === 0} onClick={() => reorderList(section, r.id, i - 1)}>↑</button>
                <button type="button" style={btn} aria-label={`Move ${r.label} down`} disabled={i === rows.length - 1} onClick={() => reorderList(section, r.id, i + 1)}>↓</button>
                <button
                  type="button" style={{ ...btn, width: 'auto', padding: '0 7px', color: r.hidden ? 'var(--textTert)' : 'var(--text)' }}
                  aria-pressed={!r.hidden} aria-label={`${r.hidden ? 'Show' : 'Hide'} ${r.label}`}
                  onClick={() => onChange(setListHidden(value, section, r.id, !r.hidden))}
                >{r.hidden ? 'Hidden' : 'Shown'}</button>
              </div>
            );
          })}
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

  const renderControls = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ fontSize: 11.5, color: 'var(--textSec)', lineHeight: 1.5 }}>
        Drag screens between the <b>bottom bar</b>, the <b>side menu</b> and <b>Hidden</b>, and drag to reorder — or edit straight
        on the phone: click a screen to rename, move or hide it, and drag it between the bar and the side menu. Only screens the
        ticked modules provide can be placed. Home stays first; Settings and Sign out stay last. Every item also has ↑ ↓ and a
        <b> Move to</b> menu if you prefer not to drag.
      </div>

      {error && <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: '#B91C1C', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 10, padding: '8px 12px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
        {LISTS.map((l) => renderList(l.id, l.title))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          type="button" disabled={!hasLayout} onClick={() => { setError(''); onChange(resetLayout(value)); }}
          style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--s2)', color: hasLayout ? 'var(--text)' : 'var(--textTert)', fontSize: 12, fontWeight: 600, cursor: hasLayout ? 'pointer' : 'default' }}
        >Reset layout</button>
        <span style={{ fontSize: 11, color: 'var(--textTert)' }}>Resets order and bottom-bar placement; hidden screens and renames stay.</span>
      </div>
    </div>
  );

  // ── Live preview column ──
  const nudge = (dir: -1 | 1) => {
    if (!sel || !selValid) return;
    if (selIsBoard) { step(sel.id, dir); return; }
    const i = selListRows.findIndex((r) => r.id === sel.id);
    reorderList(sel.section as ListSection, sel.id, i + dir);
  };
  const hideOrShow = () => {
    if (!sel || !selValid) return;
    if (selIsBoard) {
      if (selZone === 'hidden') apply(sel.id, canGo(sel.id, 'menu') ? 'menu' : 'bar', 1e6);
      else apply(sel.id, 'hidden', 0);
    } else if (selRow) {
      onChange(setListHidden(value, sel.section as ListSection, sel.id, !selRow.hidden));
    }
  };

  const renderPreview = (isFull: boolean) => {
    const z = isFull ? zoom.full : zoom.inline;
    const setZ = (n: number) => setZoom((p) => (isFull ? { ...p, full: n } : { ...p, inline: n }));
    const zi = ZOOMS.indexOf(z);
    const phoneW = BASE_W * z;
    const panel = (
      <QuickEdit
        key={sel ? `${sel.section}:${sel.id}` : 'none'}
        value={value}
        sel={selValid ? sel : null}
        placement={selZone}
        hidden={selIsBoard ? selZone === 'hidden' : !!selRow?.hidden}
        position={selIsBoard && selZone && selZone !== 'hidden' ? { i: zoneIds(selZone).indexOf(sel!.id), n: zoneIds(selZone).length } : selRow ? { i: selListRows.findIndex((r) => r.id === sel!.id), n: selListRows.length } : null}
        canGo={(zone) => !!sel && canGo(sel.id, zone)}
        onRename={(text) => {
          if (!sel) return;
          const same = text.trim() === defaultLabelOf(sel.section, sel.id);
          onChange(setLabel(value, sel.section, sel.id, same ? '' : text));
        }}
        onPlace={(zone) => { if (sel) apply(sel.id, zone, 1e6); }}
        onHideShow={hideOrShow}
        onNudge={nudge}
        onClose={() => setSel(null)}
      />
    );
    return (
      <div
        style={isFull
          ? { flex: '0 0 auto', maxWidth: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }
          : { flex: '0 0 auto', maxWidth: '100%', position: 'sticky', top: 0, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)' }}>Live preview</div>
          <div style={{ fontSize: 10.5, color: 'var(--textTert)' }}>Updates as you edit</div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="tablist" aria-label="Preview screen" style={{ ...segGroup, maxWidth: '100%', flexWrap: 'wrap' }}>
            {SCREENS.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={screen === s.id} onClick={() => setScreen(s.id)} style={seg(screen === s.id)}>{s.label}</button>
            ))}
          </div>
          <div role="group" aria-label="Phone style" style={segGroup}>
            <button type="button" aria-pressed={platform === 'android'} onClick={() => setPlatform('android')} style={seg(platform === 'android')}>Android</button>
            <button type="button" aria-pressed={platform === 'ios'} onClick={() => setPlatform('ios')} style={seg(platform === 'ios')}>iPhone</button>
          </div>
          <div role="group" aria-label="Zoom" style={{ ...segGroup, alignItems: 'center' }}>
            <button type="button" aria-label="Zoom out" disabled={zi <= 0} onClick={() => setZ(ZOOMS[Math.max(0, zi - 1)])} style={{ ...seg(false), opacity: zi <= 0 ? 0.4 : 1 }}>−</button>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', minWidth: 38, textAlign: 'center' }} aria-live="polite">{Math.round(z * 100)}%</span>
            <button type="button" aria-label="Zoom in" disabled={zi >= ZOOMS.length - 1} onClick={() => setZ(ZOOMS[Math.min(ZOOMS.length - 1, zi + 1)])} style={{ ...seg(false), opacity: zi >= ZOOMS.length - 1 ? 0.4 : 1 }}>+</button>
          </div>
          {!isFull && (
            <button ref={openBtn} type="button" aria-label="Open full-screen designer" onClick={openFull} style={{ ...seg(false), border: '1px solid var(--border)', borderRadius: 9, background: 'var(--s2)', color: 'var(--text)' }}>⤢ Full screen</button>
          )}
        </div>

        {error && <div role="status" style={{ fontSize: 11.5, fontWeight: 600, color: '#B91C1C', background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 9, padding: '6px 10px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <AppPreview
            value={value} modules={modules} screen={screen} platform={platform} scale={z}
            selected={selValid ? sel : null} onSelect={setSel} onScreen={setScreen}
            onMove={(id, zone, index) => apply(id, zone, index)}
          />
          <div style={{ width: isFull ? 290 : 250, maxWidth: '100%', minWidth: 0 }}>{panel}</div>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--textTert)', lineHeight: 1.45, maxWidth: isFull ? 320 : undefined }}>
          A schematic of the client&apos;s app: it shows which screens appear where, and in what order. Colours and spacing in the real apps differ slightly.
        </div>
      </div>
    );
  };

  if (full && typeof document !== 'undefined') {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, border: '1px dashed var(--border)', fontSize: 12, color: 'var(--textSec)' }}>
          <span>The layout designer is open full screen.</span>
          <button type="button" onClick={() => setFull(false)} style={{ ...seg(false), border: '1px solid var(--border)', borderRadius: 9, background: 'var(--s2)', color: 'var(--text)' }}>Back to editor</button>
        </div>
        {createPortal(
          <div
            role="dialog" aria-modal="true" aria-label="App layout designer"
            style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'var(--s1)', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--s2)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Syne', sans-serif" }}>App layout designer</div>
                <div style={{ fontSize: 11.5, color: 'var(--textTert)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {title ? `${title} · ` : ''}Changes apply to the form behind this window — close it, then press Update Client to save.
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <button
                type="button" autoFocus aria-label="Close full-screen designer" onClick={() => setFull(false)}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 10, background: 'var(--primary)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}
              >Done</button>
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 28, padding: 20, flexWrap: 'wrap', overflowY: 'auto', alignContent: 'flex-start' }}>
              <div style={{ flex: '1 1 520px', minWidth: 0 }}>{renderControls()}</div>
              {renderPreview(true)}
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 460px', minWidth: 0 }}>{renderControls()}</div>
      {renderPreview(false)}
    </div>
  );
}

/** Edit the screen selected in the phone (or in a list): name, placement, order, visibility. */
function QuickEdit({ value, sel, placement, hidden, position, canGo, onRename, onPlace, onHideShow, onNudge, onClose }: {
  value: AppCustomization;
  sel: Sel | null;
  placement: Zone | null;
  hidden: boolean;
  position: { i: number; n: number } | null;
  canGo: (zone: Zone) => boolean;
  onRename: (text: string) => void;
  onPlace: (zone: Zone) => void;
  onHideShow: () => void;
  onNudge: (dir: -1 | 1) => void;
  onClose: () => void;
}) {
  const current = sel ? labelOf(value, sel.section, sel.id) : '';
  const fallback = sel ? defaultLabelOf(sel.section, sel.id) : '';
  const [draft, setDraft] = useState(current);
  // Follow a rename made elsewhere (App Customization below) while this screen stays selected.
  useEffect(() => {
    if ((draft.trim() || fallback) !== current) setDraft(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const box: React.CSSProperties = { borderRadius: 14, border: '1px solid var(--border)', background: 'var(--s2)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 };
  if (!sel) {
    return (
      <div style={{ ...box, fontSize: 11.5, color: 'var(--textSec)', lineHeight: 1.5 }} aria-label="Edit selected screen" role="group">
        <b style={{ color: 'var(--text)' }}>Edit a screen</b>
        Click any screen on the phone — or a row on the left — to rename it, move it or hide it. Drag screens on the phone to
        reorder them or swap them between the bottom bar and the side menu.
      </div>
    );
  }
  const renamed = current !== fallback;
  return (
    <div style={box} role="group" aria-label="Edit selected screen">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--textTert)' }}>
            {placement ? (placement === 'bar' ? 'Bottom bar' : placement === 'menu' ? 'Side menu' : 'Hidden') : SECTION_NAME[sel.section]}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Clear selection" style={btn}>×</button>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--textSec)' }}>
        Name shown in the app
        <input
          aria-label="Screen name" value={draft} maxLength={40} placeholder={fallback}
          onChange={(e) => { setDraft(e.target.value); onRename(e.target.value); }}
          style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', fontSize: 12.5 }}
        />
      </label>
      {renamed && (
        <button type="button" onClick={() => { setDraft(fallback); onRename(''); }} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, color: '#3E9EFF', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
          Reset to “{fallback}”
        </button>
      )}

      {placement && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--textSec)' }}>
          Placement
          <select
            aria-label="Selected screen placement" value={placement} onChange={(e) => onPlace(e.target.value as Zone)}
            style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', fontSize: 12 }}
          >
            {ZONES.map((o) => <option key={o.id} value={o.id} disabled={!canGo(o.id)}>{o.title}</option>)}
          </select>
        </label>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" aria-label="Move selected earlier" disabled={hidden || !position || position.i <= 0} onClick={() => onNudge(-1)} style={{ ...btn, width: 'auto', padding: '0 9px', height: 28 }}>↑ Earlier</button>
        <button type="button" aria-label="Move selected later" disabled={hidden || !position || position.i >= position.n - 1} onClick={() => onNudge(1)} style={{ ...btn, width: 'auto', padding: '0 9px', height: 28 }}>↓ Later</button>
        <button type="button" onClick={onHideShow} style={{ ...btn, width: 'auto', padding: '0 9px', height: 28, color: hidden ? 'var(--text)' : '#B91C1C' }}>
          {hidden ? 'Show in app' : 'Hide from app'}
        </button>
      </div>
    </div>
  );
}

'use client';
import { useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  BarChart3, Banknote, Bell, BookOpen, Boxes, Briefcase, Building2, CalendarCheck, CalendarDays, Camera, ClipboardList,
  Clock, FileText, Home, Info, Kanban, LayoutDashboard, Layers, Lock, LogOut, Megaphone, Menu as MenuIcon, MapPin,
  MessageSquareWarning, Navigation, OctagonAlert, Package, PackageCheck, Palette, PieChart, Plus, Receipt, Route,
  ScanFace, Settings, ShoppingCart, Smartphone, Sparkles, Store, Target, Trophy, TriangleAlert, Truck, User, Wallet,
  Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppCustomization, AppUiSection } from '../../lib/appCustomization';
import { boardLabel, boardOf, heldFrom, homeSectionOf, labelOf, listOf, type ListSection } from '../../lib/appLayout';

/**
 * A schematic phone showing the client's app as the current layout would render it: bottom bar, side menu, Settings and
 * CRM "More". It reads the same config the editor writes, so every drag, hide or rename shows here at once. Items are
 * clickable (select → edit in place). It is a faithful picture of WHICH screens appear WHERE and in what order, not a pixel
 * copy of the apps' styling.
 */

export type PreviewScreen = 'home' | 'menu' | 'settings' | 'crm';
export type Platform = 'android' | 'ios';
export interface Sel { section: AppUiSection; id: string }

export const BASE_W = 320;
export const BASE_H = 660;

const ICONS: Record<string, LucideIcon> = {
  home: Home, attendance: CalendarCheck, route_plan: Route, activity: ClipboardList, new_form: Plus, expenses: Receipt,
  leave: CalendarDays, timeline: Clock, log_visit: MapPin, broadcast: Megaphone, notifications: Bell, crm: LayoutDashboard,
  my_orders: ShoppingCart, book_order: ShoppingCart, collect_payment: Wallet, profile: User, learning_hub: BookOpen,
  leaderboard: Trophy, activity_feed: FileText, stock: Package, grievance: MessageSquareWarning, emergency_sos: OctagonAlert,
  planogram: Camera, van_load: Truck, distributor_stock: Boxes, log_damage: TriangleAlert, stock_batches: PackageCheck,
  ask_kini: Sparkles, appearance: Palette, crm_only_mode: Briefcase, app_lock: Lock, about: Info, face_enrollment: ScanFace,
  accounts: Building2, pipeline: Kanban, products: Package, custom_objects: Layers, nearest_leads: Navigation,
  dashboard: LayoutDashboard, lead_analytics: BarChart3, reports: PieChart, switch_ff: Smartphone,
  stores: Store, visited: MapPin, forms: ClipboardList, todays_route: Route, open_volume: Banknote, my_targets: Target,
};
const Ico = ({ id, size = 18 }: { id: string; size?: number }) => {
  const I = ICONS[id] ?? Circle;
  return <I size={size} strokeWidth={2} />;
};

const RED = '#E01E2C';
const INK = '#111827';
const MUTE = '#6B7280';
const LINE = '#E5E7EB';

/** A clickable (and, in the bar / side menu, draggable) element of the mock: one screen of the app. */
function Pick({ id, label, selected, onSelect, style, children, dnd }: {
  id: string; label: string; selected: boolean; onSelect: () => void; style?: CSSProperties; children: React.ReactNode;
  dnd?: { dragging: boolean; onStart: (e: DragEvent) => void; onEnd: () => void };
}) {
  return (
    <div
      role="button" tabIndex={0} aria-label={`Preview ${label}`} aria-pressed={selected} data-item-id={id}
      draggable={!!dnd} onDragStart={dnd?.onStart} onDragEnd={dnd?.onEnd}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      style={{ cursor: dnd ? 'grab' : 'pointer', outline: selected ? `2px solid ${RED}` : 'none', outlineOffset: 1, borderRadius: 10, opacity: dnd?.dragging ? 0.4 : 1, ...style }}
    >{children}</div>
  );
}

interface Props {
  value: AppCustomization;
  modules: string[];
  screen: PreviewScreen;
  platform: Platform;
  scale: number;
  selected: Sel | null;
  onSelect: (s: Sel) => void;
  onScreen: (s: PreviewScreen) => void;
  /** Drag in the phone: put a screen in the bar or the side menu at an index. Omit for a click-only preview. */
  onMove?: (id: string, zone: 'bar' | 'menu', index: number) => void;
}

export default function AppPreview({ value, modules, screen, platform, scale, selected, onSelect, onScreen, onMove }: Props) {
  const held = heldFrom(modules);
  const board = boardOf(value, held);
  const ios = platform === 'ios';
  const isSel = (section: AppUiSection, id: string) => selected?.section === section && selected.id === id;

  // The dragged id lives in a ref as well as state: dragover / drop must see it the instant the drag starts, not after the
  // next render (state only drives the dimmed look of the dragged screen).
  const dragRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<'bar' | 'menu' | null>(null);
  const endDrag = () => { dragRef.current = null; setDragId(null); setOverZone(null); };
  const dndOf = (id: string) => (onMove ? {
    dragging: dragId === id,
    onStart: (e: DragEvent) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; dragRef.current = id; setDragId(id); },
    onEnd: endDrag,
  } : undefined);
  // Drop target for a container of draggable screens: the index is read from where the pointer is among its items.
  const dropOn = (zone: 'bar' | 'menu') => (onMove ? {
    onDragOver: (e: DragEvent) => { if (!dragRef.current) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverZone(zone); },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverZone((z) => (z === zone ? null : z)); },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      const id = dragRef.current;
      const kids = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-item-id]')).filter((k) => k.dataset.itemId !== id);
      let at = kids.length;
      for (let i = 0; i < kids.length; i++) {
        const r = kids[i].getBoundingClientRect();
        if ((zone === 'bar' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2)) { at = i; break; }
      }
      endDrag();
      if (id) onMove(id, zone, at);
    },
  } : {});
  const dropRing = (zone: 'bar' | 'menu'): CSSProperties => (overZone === zone ? { boxShadow: `inset 0 0 0 2px ${RED}` } : {});

  const bar = (
    <div {...dropOn('bar')} style={{ display: 'flex', borderTop: ios ? `0.5px solid ${LINE}` : 'none', background: ios ? 'rgba(249,250,251,0.96)' : '#fff', boxShadow: ios ? 'none' : '0 -2px 8px rgba(0,0,0,0.06)', padding: ios ? '6px 4px 18px' : '8px 4px 10px', ...dropRing('bar') }}>
      <div style={{ flex: 1, textAlign: 'center', color: RED, fontSize: 10, fontWeight: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'center', ...(ios ? {} : { background: 'rgba(224,30,44,0.12)', borderRadius: 999, width: 44, height: 26, alignItems: 'center', margin: '0 auto' }) }}><Home size={18} /></div>
        <div style={{ marginTop: 2 }}>Home</div>
      </div>
      {board.bar.map((id) => {
        const label = boardLabel(value, id);
        return (
          <Pick key={id} id={id} label={label} selected={isSel(homeSectionOf(id), id)} onSelect={() => onSelect({ section: homeSectionOf(id), id })} dnd={dndOf(id)} style={{ flex: 1, textAlign: 'center', color: MUTE, fontSize: 10, fontWeight: 600, padding: '2px 0', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'center', height: ios ? 'auto' : 26, alignItems: 'center' }}><Ico id={id} /></div>
            <div style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{label}</div>
          </Pick>
        );
      })}
    </div>
  );

  // The CRM shell has its own bar: Home, then the CRM tabs the client holds, then More.
  const crmTabs = ([['crm_leads', 'Leads', 'accounts'], ['crm_deals', 'Deals', 'pipeline'], ['crm_activities', 'Activities', 'activity']] as const)
    .filter(([m]) => held.modules.has(m));
  const crmBar = (
    <div style={{ display: 'flex', borderTop: ios ? `0.5px solid ${LINE}` : 'none', background: ios ? 'rgba(249,250,251,0.96)' : '#fff', boxShadow: ios ? 'none' : '0 -2px 8px rgba(0,0,0,0.06)', padding: ios ? '6px 4px 18px' : '8px 4px 10px' }}>
      {[['Home', 'home'], ...crmTabs.map(([, l, ic]) => [l, ic]), ['More', 'dashboard']].map(([l, ic]) => (
        <div key={l} style={{ flex: 1, textAlign: 'center', color: l === 'More' ? RED : MUTE, fontSize: 10, fontWeight: l === 'More' ? 700 : 600, padding: '2px 0', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', height: ios ? 'auto' : 26, alignItems: 'center' }}><Ico id={ic} /></div>
          <div style={{ marginTop: 2 }}>{l}</div>
        </div>
      ))}
    </div>
  );

  const row = (section: ListSection, r: { id: string; label: string }) => (
    <Pick key={r.id} id={r.id} label={r.label} selected={isSel(section, r.id)} onSelect={() => onSelect({ section, id: r.id })} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12 }}>
      <span style={{ color: RED, display: 'inline-flex' }}><Ico id={r.id} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: INK }}>{r.label}</span>
      <span style={{ color: '#9CA3AF', fontSize: 14 }}>›</span>
    </Pick>
  );
  const fixedRow = (label: string, icon: string) => (
    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F9FAFB', border: `1px dashed ${LINE}`, borderRadius: 12 }}>
      <span style={{ color: MUTE, display: 'inline-flex' }}><Ico id={icon} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: MUTE }}>{label}</span>
    </div>
  );

  const appBar = (title: string, left: 'menu' | 'back') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff', borderBottom: `1px solid ${LINE}` }}>
      <button type="button" aria-label={left === 'menu' ? 'Preview open menu' : 'Preview back to home'} onClick={() => onScreen(left === 'menu' ? 'menu' : 'home')} style={{ border: 'none', background: 'transparent', padding: 4, color: INK, cursor: 'pointer', display: 'inline-flex' }}>
        {left === 'menu' ? <MenuIcon size={20} /> : <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span>}
      </button>
      <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: INK }}>{title}</div>
      <Bell size={18} color={MUTE} />
    </div>
  );

  const homeBody = () => {
    const tiles = listOf(value, held, 'home').rows.filter((r) => !r.hidden);
    return (
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', flex: 1 }}>
        <div style={{ background: RED, color: '#fff', borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 11, opacity: 0.85 }}>Good morning</div>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>Start your day</div>
          <div style={{ marginTop: 10, display: 'inline-block', background: '#fff', color: RED, borderRadius: 999, padding: '5px 12px', fontSize: 11, fontWeight: 800 }}>Clock in</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {tiles.map((t, i) => (
            <Pick key={t.id} id={t.id} label={t.label} selected={isSel('home', t.id)} onSelect={() => onSelect({ section: 'home', id: t.id })} style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: '10px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: MUTE, fontSize: 10.5, fontWeight: 700 }}><Ico id={t.id} size={13} />{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: INK, marginTop: 4 }}>{[12, 8, 5, 3, '₹4.2L', '68%'][i % 6]}</div>
            </Pick>
          ))}
          {tiles.length === 0 && <div style={{ gridColumn: '1 / -1', fontSize: 11, color: MUTE, padding: 8 }}>No cards on Home.</div>}
        </div>
      </div>
    );
  };

  const drawer = (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', zIndex: 5 }}>
      <div {...dropOn('menu')} style={{ width: '78%', background: '#fff', padding: 14, display: 'flex', flexDirection: 'column', gap: 4, overflow: 'hidden', boxShadow: '4px 0 18px rgba(0,0,0,0.25)', ...dropRing('menu') }}>
        <div style={{ background: 'rgba(224,30,44,0.08)', borderRadius: 12, padding: 10, fontSize: 11, color: MUTE, fontStyle: 'italic', marginBottom: 6 }}>“Developing your potential is the best way to spend your time.”</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', fontSize: 13, fontWeight: 700, color: RED }}><Home size={17} />Home</div>
        {board.menu.map((id) => {
          const label = boardLabel(value, id);
          return (
            <Pick key={id} id={id} label={label} selected={isSel('menu', id)} onSelect={() => onSelect({ section: 'menu', id })} dnd={dndOf(id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', fontSize: 13, fontWeight: 600, color: INK }}>
              <span style={{ color: MUTE, display: 'inline-flex' }}><Ico id={id} size={17} /></span>{label}
            </Pick>
          );
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', fontSize: 13, fontWeight: 600, color: MUTE }}><Settings size={17} />Settings</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', fontSize: 13, fontWeight: 600, color: MUTE }}><LogOut size={17} />Sign out</div>
      </div>
      <div onClick={() => onScreen('home')} role="button" aria-label="Preview close menu" style={{ flex: 1, background: 'rgba(0,0,0,0.45)', cursor: 'pointer' }} />
    </div>
  );

  let content: React.ReactNode;
  if (screen === 'settings') {
    const rows = listOf(value, held, 'settings').rows.filter((r) => !r.hidden);
    content = (
      <>
        {appBar('Settings', 'back')}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden', background: '#F9FAFB' }}>
          <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 999, background: RED, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>A</span>
            <div><div style={{ fontSize: 13, fontWeight: 800, color: INK }}>Asha Verma</div><div style={{ fontSize: 10.5, color: MUTE }}>Field executive</div></div>
          </div>
          {rows.map((r) => row('settings', r))}
          {fixedRow('Sign out', 'about')}
        </div>
      </>
    );
  } else if (screen === 'crm') {
    const rows = listOf(value, held, 'crm_more').rows.filter((r) => !r.hidden);
    content = (
      <>
        {appBar('More', 'back')}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden', background: '#F9FAFB' }}>
          {rows.map((r) => row('crm_more', r))}
          {rows.length === 0 && <div style={{ fontSize: 11, color: MUTE, padding: 8 }}>Nothing in More.</div>}
          {fixedRow('Sign out', 'about')}
        </div>
      </>
    );
  } else {
    content = (<>{appBar('Home', 'menu')}<div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', background: '#F9FAFB', overflow: 'hidden' }}>{homeBody()}{screen === 'menu' && drawer}</div>{bar}</>);
  }
  if (screen === 'settings') content = (<>{content}{bar}</>);
  if (screen === 'crm') content = (<>{content}{crmBar}</>);

  return (
    <div role="group" aria-label="App preview" style={{ width: BASE_W * scale, height: BASE_H * scale, flexShrink: 0 }}>
      <div style={{ width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'top left', background: '#0B0F19', borderRadius: ios ? 46 : 36, padding: 9, boxShadow: '0 18px 40px rgba(0,0,0,0.35)', boxSizing: 'border-box', fontFamily: ios ? "-apple-system, 'SF Pro Text', system-ui, sans-serif" : "Roboto, system-ui, sans-serif" }}>
        <div style={{ width: '100%', height: '100%', background: '#fff', borderRadius: ios ? 38 : 28, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 18px', fontSize: 11, fontWeight: 700, color: INK, position: 'relative', background: '#fff' }}>
            <span>9:41</span>
            {ios
              ? <span style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', width: 74, height: 18, borderRadius: 999, background: '#0B0F19' }} />
              : <span style={{ position: 'absolute', left: '50%', top: 8, transform: 'translateX(-50%)', width: 10, height: 10, borderRadius: 999, background: '#0B0F19' }} />}
            <span style={{ fontSize: 10, letterSpacing: 1 }}>●●● 100%</span>
          </div>
          {content}
          {ios && <div style={{ position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)', width: 110, height: 4, borderRadius: 999, background: '#111827', opacity: 0.8 }} />}
        </div>
      </div>
    </div>
  );
}

export { labelOf };

import type { Glyph } from './spec';
import { ar, ci, dt, j, pg, rr, star, ticks } from './shapes';

/**
 * Marks, arrows, states, actions and controls — the small vocabulary every screen leans on. Plain marks (arrows,
 * chevrons, check) carry no plate; anything with a body (a circle, a shield, a panel) does.
 */
const C = 11.25;

const TRI = 'M11.25 3.8 19.1 17.6a1.7 1.7 0 0 1-1.5 2.4H4.9a1.7 1.7 0 0 1-1.5-2.4Z';
const SHIELD = 'M11.25 3.4 4.2 6v5.5c0 3.9 2.9 6.6 7.05 8.2 4.15-1.6 7.05-4.3 7.05-8.2V6Z';
const TRAY = 'M3.8 14.6v1.9a2.9 2.9 0 0 0 2.9 2.9h9.1a2.9 2.9 0 0 0 2.9-2.9v-1.9';
const FUNNEL = 'M3.7 4.6h15.1l-5.7 6.9v5.4l-3.7 2V11.5Z';
const BOOKMARK = 'M6.4 3.6h9.7a1.8 1.8 0 0 1 1.8 1.8v14.1l-6.65-4-6.65 4V5.4a1.8 1.8 0 0 1 1.8-1.8Z';
const BULB = 'M8.2 14.5c-.9-1-1.9-2.2-1.9-4a4.95 4.95 0 0 1 9.9 0c0 1.8-1 3-1.9 4-.5.6-.7 1.2-.7 2H8.9c0-.8-.2-1.4-.7-2Z';
const BOLT = 'M12.4 3.2 5 12.2h5.5l-1 7.3 7.6-9.1h-5.6Z';
const SPARK = 'M10 4.2c.6 3.9 2.2 5.5 6.1 6.1-3.9.6-5.5 2.2-6.1 6.1-.6-3.9-2.2-5.5-6.1-6.1 3.9-.6 5.5-2.2 6.1-6.1Z';
const MOON = 'M18.7 12.8A7.6 7.6 0 1 1 9.7 3.8a6 6 0 0 0 9 9Z';
const LENS = 'M2.9 11.25C4.7 7.2 7.8 5.2 11.25 5.2s6.55 2 8.35 6.05c-1.8 4.05-4.9 6.05-8.35 6.05S4.7 15.3 2.9 11.25Z';
const PADLOCK = rr(4.3, 9.6, 13.9, 9.9, 2.8);

export const MARKS: Record<string, Glyph> = {
  // ── marks & arrows (no plate) ─────────────────────────────────────────────
  'check-check': { line: 'M3.2 11.9l4.2 4.2L14.9 7.6M10.2 14.5l1.7 1.7 7.3-8.6' },
  'chevron-left': { line: 'M13.7 5.4 7.9 11.25l5.8 5.85' },
  'chevron-down': { line: 'M5.4 8.8l5.85 5.8 5.85-5.8' },
  'arrow-left': { line: 'M18.1 11.25H5.1M10.1 5.9 4.7 11.25l5.4 5.35' },
  'arrow-up': { line: 'M11.25 18.1v-13M5.9 10.1l5.35-5.4 5.35 5.4' },
  'arrow-down': { line: 'M11.25 4.4v13M5.9 12.4l5.35 5.4 5.35-5.4' },
  'arrow-up-down': { line: 'M7.2 19V4.6M3.6 8.2l3.6-3.6 3.6 3.6M15.3 3.8v14.4M11.7 14.6l3.6 3.6 3.6-3.6' },
  'arrow-left-right': { line: 'M4.2 7.4h13.7M14.4 3.9l3.5 3.5-3.5 3.5M18.3 15.1H4.6M8.1 11.6l-3.5 3.5 3.5 3.5' },
  'arrow-down-to-line': { line: 'M11.25 3.6v11.2M6.9 10.5l4.35 4.3 4.35-4.3M4.2 19.4h14.1' },
  'arrow-up-from-line': { line: 'M11.25 15V3.9M6.9 8.2l4.35-4.3 4.35 4.3M4.2 19.4h14.1' },
  download: { line: j('M11.25 3.6v10.5M6.9 9.8l4.35 4.3 4.35-4.3', TRAY) },
  upload: { line: j('M11.25 14.2V3.7M6.9 8l4.35-4.3L15.6 8', TRAY) },
  'external-link': { line: j('M10.4 5H6.3a2.8 2.8 0 0 0-2.8 2.8v9a2.8 2.8 0 0 0 2.8 2.8h9a2.8 2.8 0 0 0 2.8-2.8v-4.1', 'M12.6 3.6h6.1v6.1M18.7 3.6l-7.6 7.6') },
  refresh: { line: j(ar(C, C, 7.2, 205, 335), 'M17.8 4v4.2h-4.2', ar(C, C, 7.2, 25, 155), 'M4.7 18.5v-4.2h4.2') },
  'rotate-ccw': { line: 'M3.9 11.25a7.35 7.35 0 1 0 2.2-5.2L3.8 8.3M3.8 4.3v4h4' },
  undo: { line: 'M5.2 9.2h8.3a4.9 4.9 0 0 1 0 9.8H8.4M8.5 5.5 4.8 9.2l3.7 3.7' },
  link: { line: 'M9.7 13a3.9 3.9 0 0 0 5.5 0l3-3a3.9 3.9 0 0 0-5.5-5.5l-.9.9M12.9 9.5a3.9 3.9 0 0 0-5.5 0l-3 3a3.9 3.9 0 0 0 5.5 5.5l.9-.9' },
  'log-in': { line: 'M10.4 3.6h5.2a2.9 2.9 0 0 1 2.9 2.9v8.5a2.9 2.9 0 0 1-2.9 2.9h-5.2M3.8 11.25h9.9M10.6 7.7l3.6 3.55-3.6 3.55' },
  'log-out': { line: 'M8.9 3.6H6.3a2.9 2.9 0 0 0-2.9 2.9v8.5a2.9 2.9 0 0 0 2.9 2.9h2.6M18.7 11.25H9.2M15.3 7.7l3.6 3.55-3.6 3.55' },
  loader: { line: 'M11.25 3.2a8.05 8.05 0 1 0 8.05 8.05', node: [19.3, 11.25] },
  power: { line: 'M11.25 3.4v7M6.7 6.5a7.5 7.5 0 1 0 9.1 0' },
  'power-off': { line: 'M11.25 3.4v7M6.7 6.5a7.5 7.5 0 1 0 9.1 0M3.6 3.6l15.3 15.3' },
  'align-left': { line: 'M3.6 5.8h14.7M3.6 11.25h9.6M3.6 16.7h12.1' },
  list: { line: j('M8.6 6h9.9M8.6 11.25h9.9M8.6 16.5h9.9', dt(4.1, 6), dt(4.1, 11.25), dt(4.1, 16.5)) },
  'list-ordered': { line: 'M9.4 6h9.1M9.4 11.25h9.1M9.4 16.5h9.1M4.4 4.2l1.3-.7v5M4.2 10.2h2.6l-2.6 3h2.7M4.2 15.4h2.6l-1.2 1.4a1.1 1.1 0 1 1-1.2 1.4' },
  hash: { line: 'M7.6 3.9 6.4 18.6M15.5 3.9l-1.2 14.7M4.1 8.2h14M3.5 14.3h14' },
  type: { line: 'M4.9 6.6V4.6h12.7v2M11.25 4.6v14M8.3 18.6h5.9' },

  // ── states ────────────────────────────────────────────────────────────────
  'x-circle': { line: j(ci(C, C, 8), 'M8.3 8.3l5.9 5.9M14.2 8.3l-5.9 5.9'), plate: ci(C, C, 8) },
  'circle-dot': { line: ci(C, C, 8), plate: ci(C, C, 8), node: [C, C] },
  'pause-circle': { line: j(ci(C, C, 8), 'M9.5 8.7v5.1M13 8.7v5.1'), plate: ci(C, C, 8) },
  'alert-triangle': { line: j(TRI, 'M11.25 9.2v4'), plate: TRI, node: [C, 16.4] },
  info: { line: j(ci(C, C, 8), 'M11.25 10.7v4.9'), plate: ci(C, C, 8), node: [C, 7.7] },
  help: { line: j(ci(C, C, 8), 'M9 9.1a2.35 2.35 0 0 1 4.55.8c0 1.55-2.3 1.9-2.3 3.2'), plate: ci(C, C, 8), node: [C, 15.9] },
  ban: { line: j(ci(C, C, 8), 'M5.6 5.6l11.3 11.3'), plate: ci(C, C, 8) },
  'shield-check': { line: j(SHIELD, 'M8.3 11.3l2.1 2.1 3.9-4.2'), plate: SHIELD },
  'shield-alert': { line: j(SHIELD, 'M11.25 8v3.6'), plate: SHIELD, node: [C, 14.5] },
  play: { line: 'M7.6 4.9 17 11.25 7.6 17.6Z', plate: 'M7.6 4.9 17 11.25 7.6 17.6Z' },
  pause: { line: j(rr(5.4, 4.2, 4, 14.1, 1.4), rr(13.1, 4.2, 4, 14.1, 1.4)), plate: j(rr(5.4, 4.2, 4, 14.1, 1.4), rr(13.1, 4.2, 4, 14.1, 1.4)) },
  'skip-forward': { line: 'M5.2 5.2 13.7 11.25 5.2 17.3ZM17.6 4.9v12.7', plate: 'M5.2 5.2 13.7 11.25 5.2 17.3Z' },

  // ── actions & controls ────────────────────────────────────────────────────
  copy: { line: j(rr(8.2, 8.2, 11.3, 11.3, 2.8), 'M5.9 14.8A2.5 2.5 0 0 1 3.4 12.3V5.9A2.5 2.5 0 0 1 5.9 3.4h6.4a2.5 2.5 0 0 1 2.5 2.5'), plate: rr(8.2, 8.2, 11.3, 11.3, 2.8) },
  save: { line: j(rr(3.4, 3.4, 16.1, 16.1, 3), 'M7.6 3.4v4.5h6.9V3.4M7.4 19.5v-5.4h8.6v5.4'), plate: rr(3.4, 3.4, 16.1, 16.1, 3) },
  filter: { line: FUNNEL, plate: FUNNEL },
  'sliders-horizontal': {
    line: j('M4 6.6h4.85M13.85 6.6H19M4 11.25h8.25M17.25 11.25H19M4 15.9h2.4M11.4 15.9H19', ci(11.35, 6.6, 2.5), ci(14.75, 11.25, 2.5), ci(8.9, 15.9, 2.5)),
    plate: j(ci(11.35, 6.6, 2.5), ci(14.75, 11.25, 2.5), ci(8.9, 15.9, 2.5)),
  },
  'settings-2': {
    line: j('M4 8h4.6M14.4 8H19M4 14.5h8.8M18.2 14.5H19', ci(11.5, 8, 2.9), ci(15.5, 14.5, 2.7)),
    plate: j(ci(11.5, 8, 2.9), ci(15.5, 14.5, 2.7)),
  },
  plug: {
    line: j('M9 3.6v4.1M13.5 3.6v4.1', 'M6.7 7.7h9.1v3.6a4.55 4.55 0 0 1-9.1 0Z', 'M11.25 15.9v3.6'),
    plate: 'M6.7 7.7h9.1v3.6a4.55 4.55 0 0 1-9.1 0Z',
  },
  unplug: {
    line: j('M9 3.6v4.1M13.5 3.6v4.1', 'M6.7 7.7h9.1v3.6a4.55 4.55 0 0 1-9.1 0Z', 'M11.25 15.9v3.6', 'M4 4l14.5 14.5'),
    plate: 'M6.7 7.7h9.1v3.6a4.55 4.55 0 0 1-9.1 0Z',
  },
  star: { line: star(C, 11.7, 8.5, 3.7), plate: star(C, 11.7, 8.5, 3.7) },
  bookmark: { line: BOOKMARK, plate: BOOKMARK },
  flag: { line: 'M5 19.5V4M5 4.6h10.9l-2.3 3.4 2.3 3.4H5', plate: 'M5 4.6h10.9l-2.3 3.4 2.3 3.4H5Z' },
  pin: { line: j('M8.2 3.6h6.1l-.7 5.3a5.4 5.4 0 0 1 3 4.5H5.9a5.4 5.4 0 0 1 3-4.5Z', 'M11.25 13.4v6.1'), plate: 'M8.2 3.6h6.1l-.7 5.3a5.4 5.4 0 0 1 3 4.5H5.9a5.4 5.4 0 0 1 3-4.5Z' },
  lightbulb: { line: j(BULB, 'M9.1 19.4h4.3'), plate: BULB, node: [C, 10.3] },
  zap: { line: BOLT, plate: BOLT },
  sparkles: { line: j(SPARK, 'M17.7 3.7c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2Z'), plate: SPARK },
  sun: { line: j(ci(C, C, 3.8), ticks(C, C, 6.4, 8.5, 8, 0)), plate: ci(C, C, 3.8) },
  moon: { line: MOON, plate: MOON },
  eye: { line: LENS, plate: LENS, node: [C, C] },
  'eye-off': { line: j(LENS, 'M4 4l14.5 14.5'), plate: LENS, node: [C, C] },
  lock: { line: j(PADLOCK, 'M7.4 9.6V7.2a3.85 3.85 0 0 1 7.7 0v2.4'), plate: PADLOCK, node: [C, 14.4] },
  'key-round': { line: j(ci(8.2, 14.2, 4.7), 'M11.7 10.7 18.6 3.8M15.4 7.1l2.4 2.4M13.3 9.2l1.7 1.7'), plate: ci(8.2, 14.2, 4.7), node: [8.2, 14.2] },
  'mouse-pointer-click': { line: 'M9.6 9.6l9.4 3.6-4.3 1.7-1.7 4.3Z M8.4 3.6 7.9 5.7M4.2 7.9l2.1.5M5.3 4.8l1.5 1.5M12.4 5.2l-1.2 1.8' },
  'scan-search': { line: j('M3.6 8V6.2a2.6 2.6 0 0 1 2.6-2.6H8M15.2 3.6h1.6a2.6 2.6 0 0 1 2.6 2.6V8M19.4 14.8V16.8a2.6 2.6 0 0 1-2.6 2.6H15.2M8 19.4H6.2a2.6 2.6 0 0 1-2.6-2.6V15.2', ci(11.25, 11.25, 3.6), 'M14 14l2.6 2.6'), plate: ci(11.25, 11.25, 3.6) },
};

// Referenced so the import list stays honest if a glyph above is removed.
void pg;

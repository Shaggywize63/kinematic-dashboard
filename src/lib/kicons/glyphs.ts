import type { Glyph } from './spec';
import { MARKS } from './glyphs-marks';
import { BUSINESS } from './glyphs-business';
import { EXTRA } from './glyphs-extra';
import { OBJECTS } from './glyphs-objects';
import { ci, gear, j, rr } from './shapes';

const C = 11.25; // centre of the live box

const HOUSE = 'M3.6 10.2 11.25 3.8 18.9 10.2V16.8a2.7 2.7 0 0 1-2.7 2.7H6.3a2.7 2.7 0 0 1-2.7-2.7Z';
const TRASH_BODY = 'M6 6.2l.9 11.6a2 2 0 0 0 2 1.8h4.7a2 2 0 0 0 2-1.8l.9-11.6Z';
const PENCIL = 'M15.4 4.4a2.2 2.2 0 0 1 3.1 0l.9.9a2.2 2.2 0 0 1 0 3.1L8.7 19.1 3.6 20.2 4.7 15.1Z';

/** Glyph id → drawing. Ids are kebab-case concepts (not lucide names); `bindings.ts` maps lucide exports onto them. */
/** Glyphs unique to this file (the first, style-defining batch). */
export const CORE: Record<string, Glyph> = {
  // ── marks ───────────────────────────────────────────────────────────────
  plus: { line: 'M11.25 4.8v12.9M4.8 11.25h12.9' },
  x: { line: 'M5.6 5.6l11.3 11.3M16.9 5.6 5.6 16.9' },
  check: { line: 'M4.9 12.1l4.5 4.5 8.4-9.6' },
  'chevron-right': { line: 'M8.8 5.4l5.8 5.85-5.8 5.85' },
  'arrow-right': { line: 'M4.4 11.25h13M12.4 5.9l5.4 5.35-5.4 5.35' },

  // ── objects ─────────────────────────────────────────────────────────────
  home: { line: HOUSE, plate: HOUSE, node: [C, 14.2] },
  users: {
    line: j(ci(8.2, 7.8, 3.2), 'M2.6 19.5v-.7a5.6 5.6 0 0 1 11.2 0v.7', 'M15.2 13.7a5 5 0 0 1 4.6 4.9v.9'),
    plate: j(ci(8.2, 7.8, 3.2), 'M2.6 19.5v-.7a5.6 5.6 0 0 1 11.2 0v.7Z'),
    node: [16.6, 7.2],
  },
  mail: { line: j(rr(3, 5, 16.5, 13, 3), 'M3.9 7.4l7.35 5.2 7.35-5.2'), plate: rr(3, 5, 16.5, 13, 3), node: [C, 12.6] },
  'check-circle': { line: j(ci(C, C, 8), 'M7.5 11.5l2.9 2.9 5.1-5.5'), plate: ci(C, C, 8) },
  search: { line: j(ci(10, 10, 6.4), 'M14.7 14.7l5.3 5.3'), plate: ci(10, 10, 6.4) },
  settings: { line: gear(C, C, 8, 6.3, 8.4, 11, 7), plate: gear(C, C, 8, 6.3, 8.4, 11, 7), node: [C, C] },
  'bar-chart': { line: j(rr(3.7, 11, 3.7, 8.5, 1.3), rr(9.4, 6, 3.7, 13.5, 1.3), rr(15.1, 9.2, 3.7, 10.3, 1.3)), plate: j(rr(3.7, 11, 3.7, 8.5, 1.3), rr(9.4, 6, 3.7, 13.5, 1.3), rr(15.1, 9.2, 3.7, 10.3, 1.3)) },
  target: { line: j(ci(C, C, 8), ci(C, C, 4.1)), plate: ci(C, C, 8), node: [C, C] },
  trash: { line: j('M4.4 6.2h13.7', 'M9 6.2V4.5a1.3 1.3 0 0 1 1.3-1.3h1.9A1.3 1.3 0 0 1 13.5 4.5v1.7', TRASH_BODY, 'M9.4 10.4v5.4M13.1 10.4v5.4'), plate: TRASH_BODY },
  pencil: { line: j(PENCIL, 'M13.4 6.5l3.1 3.1'), plate: PENCIL },
};

/** Every glyph. Ids must be unique across the chunks (e2e/kicons.spec.ts checks) so no definition silently shadows another. */
export const GLYPHS: Record<string, Glyph> = { ...CORE, ...MARKS, ...OBJECTS, ...BUSINESS, ...EXTRA };

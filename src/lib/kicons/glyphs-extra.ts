import type { Glyph } from './spec';
import { ci, j, rr } from './shapes';

/** Everyday marks that round out the family (menus, overflow dots, print, archive…). */
const C = 11.25;
const PADLOCK = rr(4.3, 9.6, 13.9, 9.9, 2.8);
const CAL = rr(3, 5, 16.5, 14.5, 3);
const PRINTER_BODY = 'M5.3 8h12.9a1.9 1.9 0 0 1 1.9 1.9v3.3a1.9 1.9 0 0 1-1.9 1.9H5.3a1.9 1.9 0 0 1-1.9-1.9V9.9A1.9 1.9 0 0 1 5.3 8Z';

export const EXTRA: Record<string, Glyph> = {
  minus: { line: 'M4.8 11.25h12.9' },
  menu: { line: 'M3.8 6h14.9M3.8 11.25h14.9M3.8 16.5h14.9' },
  'more-horizontal': { line: j(ci(4.8, C, 0.9), ci(C, C, 0.9), ci(17.7, C, 0.9)) },
  'more-vertical': { line: j(ci(C, 4.8, 0.9), ci(C, C, 0.9), ci(C, 17.7, 0.9)) },
  'arrow-up-right': { line: 'M6 16.5 16.5 6M8.2 6h8.3v8.3' },
  'list-checks': { line: 'M3.8 6.6l1.4 1.4 2.5-3M3.8 13.4l1.4 1.4 2.5-3M11 6.3h8.2M11 13.1h8.2M11 18.5h5.2' },
  paperclip: { line: 'M18.4 10.4l-7.2 7.2a4.2 4.2 0 0 1-6-6l7.2-7.2a2.8 2.8 0 0 1 4 4l-7.1 7.1a1.4 1.4 0 0 1-2-2l6.4-6.5' },
  circle: { line: ci(C, C, 8), plate: ci(C, C, 8) },
  'alert-circle': { line: j(ci(C, C, 8), 'M11.25 7.1v4.9'), plate: ci(C, C, 8), node: [C, 15.1] },
  unlock: { line: j(PADLOCK, 'M7.4 9.6V7.2a3.85 3.85 0 0 1 7.5-1.2'), plate: PADLOCK, node: [C, 14.4] },
  printer: { line: j('M6.6 8V3.8h9.3V8', PRINTER_BODY, rr(6.6, 12.8, 9.3, 6.6, 1.3)), plate: PRINTER_BODY },
  archive: { line: j(rr(3.4, 3.6, 16.1, 4.8, 1.6), 'M4.7 8.4v8.3a2.6 2.6 0 0 0 2.6 2.6h7.9a2.6 2.6 0 0 0 2.6-2.6V8.4M9 12.2h4.5'), plate: rr(3.4, 3.6, 16.1, 4.8, 1.6) },
  table: { line: j(rr(3.4, 3.6, 16.1, 15.9, 2.6), 'M3.5 9h15.9M3.5 14.2h15.9M9 9v10.4'), plate: rr(3.4, 3.6, 16.1, 15.9, 2.6) },
  'calendar-x': { line: j(CAL, 'M3.2 10.2h16.1M7.6 3.2v3.6M14.9 3.2v3.6M8.6 13.4l5.3 5M13.9 13.4l-5.3 5'), plate: CAL },
};

import type { Glyph } from './spec';
import { ci, dt, gear, j, rr } from './shapes';

/** Documents, communication, people, places and time. */
const C = 11.25;

const DOC = 'M13.1 3H7.3a2.7 2.7 0 0 0-2.7 2.7v11.1a2.7 2.7 0 0 0 2.7 2.7h7.9a2.7 2.7 0 0 0 2.7-2.7V8.8Z';
const DOC_FOLD = 'M13.1 3v3.9a1.9 1.9 0 0 0 1.9 1.9h2.9';
const BOARD = rr(4.6, 4.8, 13.3, 14.7, 2.7);
const CLIP = rr(8.2, 3, 6.1, 3.6, 1.5);
const NOTE = 'M13.1 19.4H6.6a2.7 2.7 0 0 1-2.7-2.7V6.1a2.7 2.7 0 0 1 2.7-2.7h9.3a2.7 2.7 0 0 1 2.7 2.7v7.7Z';
const FOLDER = 'M3.4 16.9V6.2a2.4 2.4 0 0 1 2.4-2.4h3.5l2.1 2.4h5.9a2.4 2.4 0 0 1 2.4 2.4v8.3a2.4 2.4 0 0 1-2.4 2.4H5.8a2.4 2.4 0 0 1-2.4-2.4Z';
const BOOK = 'M11.25 6.2C9.7 4.6 7.2 4 4.4 4v12.3c2.8 0 5.3.6 6.85 2.2 1.55-1.6 4.05-2.2 6.85-2.2V4c-2.8 0-5.3.6-6.85 2.2Z';
const INBOX = 'M3.6 12.6v3.7a2.7 2.7 0 0 0 2.7 2.7h9.9a2.7 2.7 0 0 0 2.7-2.7v-3.7h-4.9a2.1 2.1 0 0 1-2.1 2.1h-2.3a2.1 2.1 0 0 1-2.1-2.1Z';
const PLANE = 'M19.6 3.6 3.6 9.4l6.4 2.5 2.5 6.5Z';
const ENVELOPE = rr(3, 5, 16.5, 13, 3);
const BUBBLE = 'M11.25 3.3a8 8 0 1 1-3.7 15.1L3.6 19.4l1.1-3.9A8 8 0 0 1 11.25 3.3Z';
const SQUARE_BUBBLE = 'M16.7 3.6H5.8a2.5 2.5 0 0 0-2.5 2.5v7.6a2.5 2.5 0 0 0 2.5 2.5h.7v3.3l4-3.3h6.2a2.5 2.5 0 0 0 2.5-2.5V6.1a2.5 2.5 0 0 0-2.5-2.5Z';
const HORN = 'M17.6 4.4v12.2L9.4 13.6H5.4a2.1 2.1 0 0 1-2.1-2.1V9.6a2.1 2.1 0 0 1 2.1-2.1h4Z';
const BELL = 'M5.4 15.8V10a5.85 5.85 0 0 1 11.7 0v5.8l1.5 1.6H3.9Z';
const GIFT_BODY = 'M4.7 11.7V17a2.5 2.5 0 0 0 2.5 2.5h8.1a2.5 2.5 0 0 0 2.5-2.5v-5.3';
const CUP = 'M7 3.6h8.5v5.5a4.25 4.25 0 0 1-8.5 0Z';
const PERSON_BODY = 'M4.6 19.5v-.9a6.65 6.65 0 0 1 13.3 0v.9';
const PERSON_L = 'M2.9 19.5v-.8a6.1 6.1 0 0 1 12.2 0v.8';
const WAREHOUSE = 'M3.4 19.4V9.2L11.25 4l7.85 5.2v10.2Z';
const MAP = 'M3.6 6.1 8.6 4l5.7 2.2 4.9-2.2v13.2L14.3 19.4 8.6 17.2l-5 2.1Z';
const STORE_TOP = 'M4.1 8.2 5.5 4a1.3 1.3 0 0 1 1.2-.9h9.1a1.3 1.3 0 0 1 1.2.9l1.4 4.2v1.1a2.7 2.7 0 0 1-5.1 1.3 2.7 2.7 0 0 1-5.2 0A2.7 2.7 0 0 1 4.1 9.3Z';
const HANDSET = 'M5.4 3.6h3.1l1.6 4-2.1 1.4a10.8 10.8 0 0 0 5.2 5.2l1.4-2.1 4 1.6v3.1a2 2 0 0 1-2.2 2A15.9 15.9 0 0 1 3.4 5.8a2 2 0 0 1 2-2.2Z';
const PIN = 'M11.25 20.2c-4-3.9-6.6-7-6.6-10.2a6.6 6.6 0 0 1 13.2 0c0 3.2-2.6 6.3-6.6 10.2Z';
const CAL = rr(3, 5, 16.5, 14.5, 3);
const CAL_RINGS = 'M7.6 3.2v3.6M14.9 3.2v3.6';
const FLASK = 'M10 9.3 4.9 18a1.3 1.3 0 0 0 1.1 2h10.5a1.3 1.3 0 0 0 1.1-2L12.5 9.3Z';

export const OBJECTS: Record<string, Glyph> = {
  // ── documents ─────────────────────────────────────────────────────────────
  'file-text': { line: j(DOC, DOC_FOLD, 'M8 12.4h6.5M8 15.8h4.4'), plate: DOC },
  'file-spreadsheet': { line: j(DOC, DOC_FOLD, 'M7.8 12.3h6.9M7.8 15.7h6.9M11.25 12.3v6.8'), plate: DOC },
  'file-up': { line: j(DOC, DOC_FOLD, 'M11.25 17.2v-5.4M8.9 14.1l2.35-2.35 2.35 2.35'), plate: DOC },
  'scroll-text': { line: j(DOC, 'M8 8.3h3.6M8 12.1h6.5M8 15.7h6.5'), plate: DOC, node: [15.3, 5.6] },
  'clipboard-list': { line: j(BOARD, CLIP, 'M8.2 11.4h6.9M8.2 14.9h4.4'), plate: BOARD },
  'clipboard-check': { line: j(BOARD, CLIP, 'M8.2 13.2l2.1 2.1 3.9-4.1'), plate: BOARD },
  'sticky-note': { line: j(NOTE, 'M18.6 13.8H15.7a2.7 2.7 0 0 0-2.7 2.7v2.9'), plate: NOTE },
  folder: { line: j(FOLDER, 'M3.5 10.1h15.9'), plate: FOLDER },
  'book-open': { line: j(BOOK, 'M11.25 6.2v12.3'), plate: BOOK },

  // ── communication ─────────────────────────────────────────────────────────
  inbox: { line: j('M3.6 12.6l2.4-7.2A2.4 2.4 0 0 1 8.3 3.8h5.9a2.4 2.4 0 0 1 2.3 1.6l2.4 7.2', INBOX), plate: INBOX },
  send: { line: j(PLANE, 'M10 11.9l9.6-8.3'), plate: PLANE },
  'mail-check': { line: j(ENVELOPE, 'M3.9 7.4l7.35 5.2 7.35-5.2', 'M14.2 16.4l1.9 1.9 3.5-3.8'), plate: ENVELOPE },
  'mail-plus': { line: j(ENVELOPE, 'M3.9 7.4l7.35 5.2 7.35-5.2', 'M17.4 14v5.2M14.8 16.6H20'), plate: ENVELOPE },
  'message-circle': { line: BUBBLE, plate: BUBBLE },
  'message-square': { line: SQUARE_BUBBLE, plate: SQUARE_BUBBLE },
  'message-square-text': { line: j(SQUARE_BUBBLE, 'M7.4 8.1h8.5M7.4 11.5h5.4'), plate: SQUARE_BUBBLE },
  megaphone: { line: j(HORN, 'M7.1 13.6l.9 4.3a1.3 1.3 0 0 0 1.3 1h.4a1.3 1.3 0 0 0 1.3-1.5l-.6-2.8'), plate: HORN, node: [19.4, 10.5] },
  bell: { line: j(BELL, 'M9.2 19.6a2.2 2.2 0 0 0 4.1 0'), plate: BELL },
  'bell-ring': { line: j(BELL, 'M9.2 19.6a2.2 2.2 0 0 0 4.1 0', 'M3.4 6.4A8.2 8.2 0 0 1 6.3 3M19.1 6.4A8.2 8.2 0 0 0 16.2 3'), plate: BELL },
  radio: { line: 'M7.5 7.5a5.3 5.3 0 0 0 0 7.5M15 7.5a5.3 5.3 0 0 1 0 7.5M4.7 4.7a9.3 9.3 0 0 0 0 13.1M17.8 4.7a9.3 9.3 0 0 1 0 13.1', node: [C, C] },
  phone: { line: HANDSET, plate: HANDSET, node: [16.1, 6.2] },
  'phone-call': { line: j(HANDSET, 'M14.4 3.8a5.4 5.4 0 0 1 4.9 4.9M14.2 7a2.4 2.4 0 0 1 2 2'), plate: HANDSET },
  smartphone: { line: j(rr(6.6, 2.8, 9.3, 16.8, 2.6), 'M9.9 5.7h2.7'), plate: rr(6.6, 2.8, 9.3, 16.8, 2.6), node: [C, 16.8] },
  camera: {
    line: j(rr(3.4, 6.6, 16.1, 12.4, 3), 'M7.9 6.6l1-2a1.7 1.7 0 0 1 1.5-.9h1.7a1.7 1.7 0 0 1 1.5.9l1 2', ci(C, 12.8, 3.5)),
    plate: rr(3.4, 6.6, 16.1, 12.4, 3),
    node: [C, 12.8],
  },
  mic: { line: j(rr(8.2, 3.2, 6.1, 10.6, 3.05), 'M5.4 11.25a5.85 5.85 0 0 0 11.7 0M11.25 17.1v2.4'), plate: rr(8.2, 3.2, 6.1, 10.6, 3.05) },

  // ── recognition ───────────────────────────────────────────────────────────
  gift: { line: j(rr(3.4, 7.6, 16.2, 4.1, 1.6), GIFT_BODY, 'M11.25 7.6v11.9', 'M11.25 7.6C9.6 7.6 7.1 7.2 7.1 5.4A1.9 1.9 0 0 1 9 3.5c1.7 0 2.25 2.1 2.25 4.1 0-2 .55-4.1 2.25-4.1a1.9 1.9 0 0 1 1.9 1.9c0 1.8-2.5 2.2-4.15 2.2Z'), plate: j(rr(3.4, 7.6, 16.2, 4.1, 1.6), GIFT_BODY + 'Z') },
  award: { line: j(ci(C, 9.2, 5.6), 'M8 13.8 6.7 20l4.55-2.3 4.55 2.3-1.3-6.2'), plate: ci(C, 9.2, 5.6), node: [C, 9.2] },
  trophy: { line: j(CUP, 'M7 5.4H4.6a1.1 1.1 0 0 0-1.1 1.1v.6A3.6 3.6 0 0 0 7 10.7M15.5 5.4h2.4a1.1 1.1 0 0 1 1.1 1.1v.6a3.6 3.6 0 0 1-3.5 3.6M11.25 13.4v2.9M7.8 19.5h6.9M8.6 19.5l.6-3.2h4.1l.6 3.2'), plate: CUP },

  // ── people ────────────────────────────────────────────────────────────────
  user: { line: j(ci(C, 7.6, 3.4), PERSON_BODY), plate: j(ci(C, 7.6, 3.4), PERSON_BODY + 'Z') },
  'user-check': { line: j(ci(9, 7.6, 3.2), PERSON_L, 'M14.9 12.4l2 2 3.6-3.9'), plate: j(ci(9, 7.6, 3.2), PERSON_L + 'Z') },
  'user-plus': { line: j(ci(9, 7.6, 3.2), PERSON_L, 'M17.7 8.4v5.4M15 11.1h5.4'), plate: j(ci(9, 7.6, 3.2), PERSON_L + 'Z') },
  'user-x': { line: j(ci(9, 7.6, 3.2), PERSON_L, 'M15.4 8.8l4.6 4.6M20 8.8l-4.6 4.6'), plate: j(ci(9, 7.6, 3.2), PERSON_L + 'Z') },
  'user-cog': { line: j(ci(9, 7.6, 3.2), PERSON_L, gear(17.2, 15.9, 6, 2.5, 3.5, 14, 9)), plate: j(ci(9, 7.6, 3.2), PERSON_L + 'Z'), node: [17.2, 15.9] },
  // Two interlocking rings — an agreement. (A literal handshake turns to a dark blob at 14–18px.)
  handshake: { line: j(ci(8.5, C, 5.2), ci(14, C, 5.2)), plate: j(ci(8.5, C, 5.2), ci(14, C, 5.2)), node: [11.25, C] },
  contact: { line: j(rr(3.4, 4.6, 16.1, 14, 2.8), ci(9.4, 10.5, 2.1), 'M5.8 16.4a3.6 3.6 0 0 1 7.2 0M14.4 9.6h2.6M14.4 13h2.6'), plate: rr(3.4, 4.6, 16.1, 14, 2.8) },
  briefcase: {
    line: j(rr(3.4, 7.2, 16.1, 12, 2.8), 'M8.2 7.2V5.6a2.1 2.1 0 0 1 2.1-2.1h1.9a2.1 2.1 0 0 1 2.1 2.1v1.6M3.6 12.6h15.7'),
    plate: rr(3.4, 7.2, 16.1, 12, 2.8),
    node: [C, 12.6],
  },

  // ── places ────────────────────────────────────────────────────────────────
  building: {
    line: j(rr(4.4, 3, 10.2, 16.5, 2.6), 'M14.6 9.6h2.3a2.6 2.6 0 0 1 2.6 2.6v4.7a2.6 2.6 0 0 1-2.6 2.6h-2.3', 'M7.4 7.3h3.6M7.4 11.1h3.6', dt(16.9, 13.7)),
    plate: rr(4.4, 3, 10.2, 16.5, 2.6),
  },
  factory: {
    line: j('M3.4 19.4V10.2l5.1 3.2V10.2l5.1 3.2V6.1a1.6 1.6 0 0 1 1.6-1.6h1.2a1.6 1.6 0 0 1 1.6 1.6v13.3Z', dt(7.1, 16.6), dt(11.25, 16.6), dt(15.5, 16.6)),
    plate: 'M3.4 19.4V10.2l5.1 3.2V10.2l5.1 3.2V6.1a1.6 1.6 0 0 1 1.6-1.6h1.2a1.6 1.6 0 0 1 1.6 1.6v13.3Z',
  },
  store: { line: j(STORE_TOP, 'M5.3 12.9v4a2.5 2.5 0 0 0 2.5 2.5h7a2.5 2.5 0 0 0 2.5-2.5v-4M9.4 19.4v-3.4h3.7v3.4'), plate: STORE_TOP },
  warehouse: { line: j('M3.4 19.4V9.2L11.25 4l7.85 5.2v10.2M7.6 19.4v-6.4h7.3v6.4M7.6 16.2h7.3'), plate: WAREHOUSE },
  landmark: { line: j('M3.4 8.4 11.25 3.6l7.85 4.8Z', 'M5.4 10.9v6M9.3 10.9v6M13.2 10.9v6M17.1 10.9v6M3.6 19.4h15.3'), plate: 'M3.4 8.4 11.25 3.6l7.85 4.8Z' },
  map: { line: j(MAP, 'M8.6 4v13.2M14.3 6.2v13.2'), plate: MAP },
  'map-pin': { line: PIN, plate: PIN, node: [C, 9.9] },
  'map-pinned': {
    line: j('M11.25 14.6c-2.7-2.6-4.5-4.8-4.5-6.9a4.5 4.5 0 0 1 9 0c0 2.1-1.8 4.3-4.5 6.9Z', 'M6.4 15.8 4.3 19.4h13.9l-2.1-3.6'),
    plate: 'M11.25 14.6c-2.7-2.6-4.5-4.8-4.5-6.9a4.5 4.5 0 0 1 9 0c0 2.1-1.8 4.3-4.5 6.9Z',
    node: [C, 7.7],
  },
  'map-pin-off': { line: j(PIN, 'M3.8 3.8l14.9 14.9'), plate: PIN },
  route: { line: j(ci(5.6, 17.4, 2.2), ci(16.9, 5.6, 2.2), 'M7.8 17.4h6.6a3.1 3.1 0 0 0 0-6.2H8a3.1 3.1 0 0 1 0-6.2h6.6') },
  compass: { line: j(ci(C, C, 8), 'M14.9 7.6l-1.7 5.6-5.6 1.7 1.7-5.6Z'), plate: ci(C, C, 8), node: [C, C] },
  locate: { line: j(ci(C, C, 6.2), 'M11.25 2.9v2.4M11.25 17.2v2.4M2.9 11.25h2.4M17.2 11.25h2.4'), plate: ci(C, C, 6.2), node: [C, C] },

  // ── time ──────────────────────────────────────────────────────────────────
  clock: { line: j(ci(C, C, 8), 'M11.25 6.7v4.6l3.2 1.9'), plate: ci(C, C, 8) },
  history: { line: 'M3.7 11.25a7.55 7.55 0 1 1 2.4 5.5L3.6 14.3M3.6 10v4.4H8M11.25 6.9v4.4l2.9 1.7' },
  timer: { line: j(ci(C, 12.6, 6.9), 'M11.25 12.6l2.8-2.8M8.9 3.4h4.7M11.25 3.4v2.3'), plate: ci(C, 12.6, 6.9), node: [C, 12.6] },
  hourglass: { line: 'M6 3.6h10.5M6 19.4h10.5M7.2 3.6c0 4 2.6 5.2 4 7.65-1.4 2.45-4 3.65-4 8.15M15.3 3.6c0 4-2.6 5.2-4 7.65 1.4 2.45 4 3.65 4 8.15', plate: 'M7.2 3.6h8.1c0 4-2.6 5.2-4 7.65C9.8 8.8 7.2 7.6 7.2 3.6Z' },
  'calendar-days': { line: j(CAL, 'M3.2 10.2h16.1', CAL_RINGS), plate: CAL, node: [8.2, 14.4] },
  'calendar-check': { line: j(CAL, 'M3.2 10.2h16.1', CAL_RINGS, 'M8 14.6l2.2 2.2 4.2-4.5'), plate: CAL },
  'calendar-clock': { line: j(CAL, 'M3.2 10.2h16.1', CAL_RINGS, ci(14.8, 15.4, 3.2), 'M14.8 13.7v1.8l1.1.7'), plate: CAL },
  'calendar-off': { line: j(CAL, 'M3.2 10.2h16.1', CAL_RINGS, 'M4 4l14.5 14.5'), plate: CAL },
  'calendar-range': { line: j(CAL, 'M3.2 10.2h16.1', CAL_RINGS, 'M7.4 14.6h8.3'), plate: CAL, node: [7.4, 14.6] },
  'check-square': { line: j(rr(3.6, 3.6, 15.3, 15.3, 3), 'M7.6 11.4l2.6 2.6 4.8-5.1'), plate: rr(3.6, 3.6, 15.3, 15.3, 3) },
  flask: { line: j('M8.9 3.4h4.7M10 3.4v5.9M12.5 9.3V3.4', FLASK, 'M6.9 14.4h8.7'), plate: FLASK },
};

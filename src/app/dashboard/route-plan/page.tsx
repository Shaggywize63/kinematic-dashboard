'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

/* ── COLOURS ─────────────────────────────────────────────── */
const C = {
  bg: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  red: '#E01E2C',    
  redD: 'var(--redD)',    
  redB: 'rgba(224,30,44,0.2)',
  green: '#00D97E',  
  greenD: 'var(--greenD)',  
  greenB: 'rgba(0,217,126,0.2)',
  blue: '#3E9EFF',   
  blueD: 'var(--blueD)',  
  blueB: 'rgba(62,158,255,0.2)',
  yellow: '#FFB800', 
  yellowD: 'var(--yellowD)', 
  yellowB: 'rgba(255,184,0,0.2)',
  purple: '#9B6EFF', 
  purpleD: 'rgba(155,110,255,0.08)',
  teal: '#00C9B1',   
  tealD: 'rgba(0,201,177,0.08)',
  orange: '#FF7A30', 
  orangeD: 'rgba(255,122,48,0.08)',
};

/* ── ICON (pipe-separated paths, safe SVG) ─────────────────── */
const Icon = ({ d, s = 18, c = 'currentColor' }: { d: string; s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {d.split('|').map((p, i) => <path key={i} d={p.trim()} />)}
  </svg>
);

const IC = {
  map:      'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z|M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  users:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 11a4 4 0 100-8 4 4 0 000 8z',
  check:    'M20 6L9 17l-5-5',
  store:    'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z|M9 22V12h6v10',
  target:   'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 18a6 6 0 100-12 6 6 0 000 12z|M12 14a2 2 0 100-4 2 2 0 000 4z',
  refresh:  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  chevron:  'M19 9l-7 7-7-7',
  plus:     'M12 5v14|M5 12h14',
  x:        'M18 6L6 18|M6 6l12 12',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  clock:    'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 6v6l4 2',
  alert:    'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z|M12 9v4|M12 17h.01',
  upload:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
  trash:    'M3 6h18|M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2',
  edit:     'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7|M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  pin:      'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z|M12 10a1 1 0 100-2 1 1 0 000 2z',
  phone:    'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z',
  info:     'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 8h.01|M11 12h1v4h1',
  file:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8',
};

SEE_NEXT_CALL
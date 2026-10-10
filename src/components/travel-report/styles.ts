import type { CSSProperties } from 'react';
import { T } from '../ui';

/** Table cell styles shared by the team table and the timeline (same look as the Attendance monthly summary). */
export const th: CSSProperties = {
  padding: '12px 14px', textAlign: 'left', fontFamily: T.mono, fontSize: 10.5, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: T.mute, fontWeight: 500, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap',
};
export const td: CSSProperties = { padding: '12px 14px', fontSize: 13.5, color: T.text, borderBottom: `1px solid ${T.border}`, verticalAlign: 'top' };
export const tdNum: CSSProperties = { ...td, textAlign: 'right', fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
export const tdTime: CSSProperties = { ...td, fontFamily: T.mono, fontSize: 12.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** The red "could not load" strip every view uses. */
export const alertBox: CSSProperties = { background: T.redWash, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: T.red };

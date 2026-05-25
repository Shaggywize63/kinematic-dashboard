'use client';

/**
 * Activity-type icon renderer.
 *
 * Most activity types map cleanly to a stock emoji (📞 ✉️ ✅ 📝 💬).
 * WhatsApp uses the proper brand mark via <WhatsAppLogo>.
 *
 * For meeting / task / event-style activities, the previous stock 📅
 * emoji always showed "17" (Apple Calendar) or some other fixed day
 * baked into the emoji font, which read as the wrong date at a glance.
 * Instead we now render a small CalendarDateIcon SVG that prints the
 * activity's actual day-of-month so the icon doubles as a date badge.
 * The header strip is red for an open due_at / amber when the date is
 * past due / green when the activity is already completed, so the
 * caller doesn't need any extra status pill next to it.
 *
 * Three exports:
 *   - <ActivityTypeIcon type="meeting" date="2026-07-23" completed /> — JSX.
 *   - <CalendarDateIcon date="2026-07-23" /> — JSX, when you only want the
 *     calendar badge (no type fallback).
 *   - activityTypeEmoji('whatsapp') — string, for places that can ONLY
 *     accept text (e.g. native <option> tags inside <select>).
 */
import WhatsAppLogo from '../../icons/WhatsAppLogo';

const EMOJI_BY_TYPE: Record<string, string> = {
  call:    '📞',
  email:   '✉️',
  meeting: '📅',
  task:    '✅',
  note:    '📝',
  sms:     '💬',
  // WhatsApp falls back to the chat-bubble glyph in text-only contexts
  // (native <option>s can't render SVG). NEVER a heart — that's what
  // sparked this refactor in the first place.
  whatsapp: '💬',
};

const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

const DATE_TYPES = new Set(['meeting', 'task']);

interface CalendarDateProps {
  date: string | Date | null | undefined;
  size?: number;
  /** When true, renders the green "completed" strip. Takes priority over overdue. */
  completed?: boolean;
}

/** A small SVG calendar that prints the actual day-of-month on it. */
export function CalendarDateIcon({ date, size = 18, completed }: CalendarDateProps) {
  const d = date ? new Date(date) : null;
  const day = d && !Number.isNaN(d.getTime()) ? d.getDate() : null;
  const month = d && !Number.isNaN(d.getTime()) ? MONTHS_SHORT[d.getMonth()] : '';
  const now = Date.now();
  const isOverdue = !completed && d && !Number.isNaN(d.getTime()) && d.getTime() < now;
  const strip = completed ? '#10b981' : isOverdue ? '#f59e0b' : '#E01E2C';
  // 24x24 viewbox so the SVG scales cleanly via the `size` prop.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden role="img"
         style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <rect x="2" y="4" width="20" height="18" rx="2.5" fill="#ffffff" stroke="#9CA3AF" strokeWidth="1" />
      <rect x="2" y="4" width="20" height="6" rx="2.5" fill={strip} />
      <rect x="2" y="8" width="20" height="2" fill={strip} />
      {/* Binder rings */}
      <rect x="6.5" y="2.5" width="2" height="4" rx="0.6" fill="#4B5563" />
      <rect x="15.5" y="2.5" width="2" height="4" rx="0.6" fill="#4B5563" />
      {/* Month label */}
      {month && (
        <text x="12" y="9" textAnchor="middle" fontSize="3.6" fontWeight="700" fill="#ffffff"
              fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{month}</text>
      )}
      {/* Day number */}
      {day !== null && (
        <text x="12" y="19" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#111827"
              fontFamily="system-ui, -apple-system, Segoe UI, sans-serif">{day}</text>
      )}
    </svg>
  );
}

/** Text-only emoji fallback. Use inside native <option> elements. */
export function activityTypeEmoji(type: string): string {
  return EMOJI_BY_TYPE[type] || '📌';
}

/** Render the right visual for an activity type. Use this anywhere except
 *  inside a native <option> element. When `date` is supplied for a
 *  date-flavoured type (meeting / task), the dynamic CalendarDateIcon
 *  is used instead of the static 📅 emoji. */
export function ActivityTypeIcon({
  type, size = 18, date, completed,
}: {
  type: string;
  size?: number;
  date?: string | Date | null;
  completed?: boolean;
}) {
  if (type === 'whatsapp') return <WhatsAppLogo size={size} />;
  if (date && DATE_TYPES.has(type)) {
    return <CalendarDateIcon date={date} size={size} completed={completed} />;
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{activityTypeEmoji(type)}</span>;
}

export default ActivityTypeIcon;

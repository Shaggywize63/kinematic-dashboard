'use client';

/**
 * Activity-type icon renderer.
 *
 * Most activity types map cleanly to a stock emoji (📞 ✉️ 📅 ✅ 📝 💬).
 * WhatsApp doesn't have an emoji, and previous fallbacks ("💚" green
 * heart, then "🟢" green circle) didn't read as WhatsApp to anyone — so
 * for WhatsApp we render the proper brand mark via the shared
 * `<WhatsAppLogo>` SVG (the same component the global nav uses).
 *
 * Two exports:
 *   - <ActivityTypeIcon type="whatsapp" /> — JSX, use anywhere SVG can render.
 *   - activityTypeEmoji('whatsapp')       — string, for places that can ONLY
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

/** Text-only emoji fallback. Use inside native <option> elements. */
export function activityTypeEmoji(type: string): string {
  return EMOJI_BY_TYPE[type] || '📌';
}

/** Render the right visual for an activity type. Use this anywhere except
 *  inside a native <option> element. */
export function ActivityTypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'whatsapp') return <WhatsAppLogo size={size} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{activityTypeEmoji(type)}</span>;
}

export default ActivityTypeIcon;

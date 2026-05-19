'use client';

/**
 * Activity-type icon renderer.
 *
 * Most activity types map cleanly to a stock emoji (📞 ✉️ 📅 ✅ 📝 💬).
 * WhatsApp doesn't have an emoji, and the previous fallback (💚 green
 * heart) didn't read as "WhatsApp" to anyone — so this component swaps
 * in the official WhatsApp logo as inline SVG and falls back to emoji
 * for every other type.
 *
 * Two exports:
 *   - <ActivityTypeIcon type="whatsapp" /> — JSX, use anywhere SVG can render.
 *   - activityTypeEmoji('whatsapp')       — string, for places that can ONLY
 *     accept text (e.g. native <option> tags inside <select>).
 */

const EMOJI_BY_TYPE: Record<string, string> = {
  call:    '📞',
  email:   '✉️',
  meeting: '📅',
  task:    '✅',
  note:    '📝',
  sms:     '💬',
  // WhatsApp gets the brand green circle in text-only contexts so it at
  // least colour-signals the brand. JSX contexts get the real logo.
  whatsapp: '🟢',
};

/** Text-only emoji fallback. Use inside native <option> elements. */
export function activityTypeEmoji(type: string): string {
  return EMOJI_BY_TYPE[type] || '📌';
}

/** Tiny inline SVG of the WhatsApp logo. Brand-coloured (#25D366) speech
 *  bubble with the iconic phone handset cut-out. ~1 KB inlined; no asset
 *  request, scales cleanly at any size. */
function WhatsAppLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="WhatsApp"
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
    >
      <path
        fill="#25D366"
        d="M16 0C7.163 0 0 7.163 0 16c0 2.823.742 5.586 2.151 8.019L0 32l8.183-2.143A15.93 15.93 0 0 0 16 32c8.837 0 16-7.163 16-16S24.837 0 16 0Zm0 29.273a13.27 13.27 0 0 1-7.105-2.06l-.509-.302-5.273 1.382 1.405-5.137-.331-.527A13.21 13.21 0 0 1 2.727 16C2.727 8.673 8.673 2.727 16 2.727S29.273 8.673 29.273 16 23.327 29.273 16 29.273Z"
      />
      <path
        fill="#25D366"
        d="M23.549 19.46c-.41-.205-2.448-1.207-2.828-1.345-.379-.138-.654-.205-.93.207-.275.411-1.069 1.345-1.31 1.62-.241.275-.482.31-.892.103-.41-.205-1.738-.64-3.31-2.04-1.224-1.092-2.05-2.44-2.291-2.852-.241-.412-.026-.635.18-.84.185-.184.41-.482.616-.723.205-.241.275-.414.41-.69.137-.275.069-.516-.034-.723-.103-.207-.93-2.241-1.275-3.069-.336-.806-.677-.696-.93-.71-.241-.012-.516-.014-.79-.014-.276 0-.722.103-1.1.516-.378.41-1.448 1.414-1.448 3.448 0 2.034 1.482 4 1.69 4.276.206.275 2.917 4.456 7.067 6.246.99.428 1.762.683 2.366.875.994.317 1.898.272 2.614.165.798-.12 2.448-1 2.793-1.965.346-.965.346-1.793.241-1.965-.103-.172-.378-.275-.79-.482Z"
      />
    </svg>
  );
}

/** Render the right visual for an activity type. Use this anywhere except
 *  inside a native <option> element. */
export function ActivityTypeIcon({ type, size = 18 }: { type: string; size?: number }) {
  if (type === 'whatsapp') return <WhatsAppLogo size={size} />;
  return <span style={{ fontSize: size, lineHeight: 1 }}>{activityTypeEmoji(type)}</span>;
}

export default ActivityTypeIcon;

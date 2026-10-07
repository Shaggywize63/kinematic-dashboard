// Reserved tokens an admin can store in a select field's `options` array.
//
// The custom-field definition has no column for "how should this dropdown
// behave", so — like the image field's `camera_only` / `front` tokens — the
// behaviour rides in the existing `options` string array. That keeps old
// clients working: they would show the token as an option, which is why every
// renderer here strips them with visibleOptions().
//
//   __searchable__        type-ahead list instead of a plain dropdown
//                         (long lists such as crops)
//   __source:products__   the options are the product names from the Products
//                         section (name only, never price); implies searchable
//
// Mirrors the backend's src/lib/customFieldOptions.ts and the same helpers on
// Android / iOS — keep the three in step.

export const OPTION_SEARCHABLE = '__searchable__';
export const OPTION_SOURCE_PRODUCTS = '__source:products__';

/** Any `__token__` — never a value the user should see or pick. */
export const isReservedOption = (o: string): boolean => /^__.+__$/.test(o);

/** The options a user can actually pick (reserved tokens removed). */
export const visibleOptions = (options: readonly string[] | null | undefined): string[] =>
  (Array.isArray(options) ? options : []).filter((o) => typeof o === 'string' && !isReservedOption(o));

export const isProductSourceOptions = (options: readonly string[] | null | undefined): boolean =>
  Array.isArray(options) && options.includes(OPTION_SOURCE_PRODUCTS);

export const isSearchableOptions = (options: readonly string[] | null | undefined): boolean =>
  Array.isArray(options) && (options.includes(OPTION_SEARCHABLE) || options.includes(OPTION_SOURCE_PRODUCTS));

/**
 * Rebuild an `options` array after the admin edits the visible choices and the
 * two behaviour switches, so the reserved tokens survive an edit.
 */
export function composeOptions(visible: string[], opts: { searchable?: boolean; fromProducts?: boolean }): string[] {
  const out = opts.fromProducts ? [] : visible.map((v) => v.trim()).filter(Boolean);
  if (opts.fromProducts) out.push(OPTION_SOURCE_PRODUCTS);
  else if (opts.searchable) out.push(OPTION_SEARCHABLE);
  return out;
}

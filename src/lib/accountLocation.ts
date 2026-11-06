// Account location (address, city, state, PIN, country): pure helpers shared by the New Account page, the Edit
// Account modal and the Account detail page. The columns are crm_accounts.address_line1 / address_line2 / city /
// state / postal_code / country; each one is a built-in field gated by the admin's field overrides
// (`account.<key>`, see crmFieldOverrides.ts).

export const ACCOUNT_LOCATION_KEYS = ['address_line1', 'address_line2', 'city', 'state', 'postal_code', 'country'] as const;
export type AccountLocationKey = (typeof ACCOUNT_LOCATION_KEYS)[number];
export type AccountLocationForm = Record<AccountLocationKey, string>;

export const DEFAULT_COUNTRY = 'India';

type Row = Partial<Record<AccountLocationKey, string | null>> | null | undefined;

/** Blank create form: everything empty, Country defaulting to India. */
export const emptyAccountLocation = (): AccountLocationForm => ({
  address_line1: '', address_line2: '', city: '', state: '', postal_code: '', country: DEFAULT_COUNTRY,
});

/** Form values preloaded from a saved account. A saved account with no country keeps it blank only when it never had one. */
export function seedAccountLocation(a: Row): AccountLocationForm {
  const f = emptyAccountLocation();
  if (!a) return f;
  for (const k of ACCOUNT_LOCATION_KEYS) f[k] = (a[k] ?? '').toString();
  if (!f.country) f.country = DEFAULT_COUNTRY;
  return f;
}

/**
 * The location keys of a create / PATCH body.
 *  - create: blank values are left out.
 *  - patch: blank values are sent as null so the column is cleared.
 * `isHidden(key)` is the admin's override: a hidden field is never sent (the saved value stays untouched).
 */
export function accountLocationPayload(
  f: AccountLocationForm,
  mode: 'create' | 'patch',
  isHidden: (key: string) => boolean = () => false,
): Partial<Record<AccountLocationKey, string | null>> {
  const out: Partial<Record<AccountLocationKey, string | null>> = {};
  for (const k of ACCOUNT_LOCATION_KEYS) {
    if (isHidden(k)) continue;
    const v = (f[k] ?? '').trim();
    if (v) out[k] = v;
    else if (mode === 'patch') out[k] = null;
  }
  return out;
}

/** Detail-page lines: street (line 1 + 2), "City, State – PIN", country. Hidden / blank parts are dropped. */
export function accountLocationLines(a: Row, isHidden: (key: string) => boolean = () => false): { street: string; place: string; country: string } {
  const g = (k: AccountLocationKey) => (isHidden(k) ? '' : (a?.[k] ?? '').toString().trim());
  const street = [g('address_line1'), g('address_line2')].filter(Boolean).join(', ');
  const cityState = [g('city'), g('state')].filter(Boolean).join(', ');
  const place = [cityState, g('postal_code')].filter(Boolean).join(' – ');
  return { street, place, country: g('country') };
}

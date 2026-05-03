// Indian state / UT codes used in GSTIN's first two digits.
// Mirror of backend src/utils/gstin.ts — keep in sync.

export interface StateRow {
  code: string;
  name: string;
  abbr: string;
  is_active: boolean;
}

export const INDIA_STATES: StateRow[] = [
  { code: '01', name: 'Jammu & Kashmir',                 abbr: 'JK', is_active: true },
  { code: '02', name: 'Himachal Pradesh',                abbr: 'HP', is_active: true },
  { code: '03', name: 'Punjab',                          abbr: 'PB', is_active: true },
  { code: '04', name: 'Chandigarh',                      abbr: 'CH', is_active: true },
  { code: '05', name: 'Uttarakhand',                     abbr: 'UT', is_active: true },
  { code: '06', name: 'Haryana',                         abbr: 'HR', is_active: true },
  { code: '07', name: 'Delhi',                           abbr: 'DL', is_active: true },
  { code: '08', name: 'Rajasthan',                       abbr: 'RJ', is_active: true },
  { code: '09', name: 'Uttar Pradesh',                   abbr: 'UP', is_active: true },
  { code: '10', name: 'Bihar',                           abbr: 'BR', is_active: true },
  { code: '11', name: 'Sikkim',                          abbr: 'SK', is_active: true },
  { code: '12', name: 'Arunachal Pradesh',               abbr: 'AR', is_active: true },
  { code: '13', name: 'Nagaland',                        abbr: 'NL', is_active: true },
  { code: '14', name: 'Manipur',                         abbr: 'MN', is_active: true },
  { code: '15', name: 'Mizoram',                         abbr: 'MZ', is_active: true },
  { code: '16', name: 'Tripura',                         abbr: 'TR', is_active: true },
  { code: '17', name: 'Meghalaya',                       abbr: 'ML', is_active: true },
  { code: '18', name: 'Assam',                           abbr: 'AS', is_active: true },
  { code: '19', name: 'West Bengal',                     abbr: 'WB', is_active: true },
  { code: '20', name: 'Jharkhand',                       abbr: 'JH', is_active: true },
  { code: '21', name: 'Odisha',                          abbr: 'OD', is_active: true },
  { code: '22', name: 'Chhattisgarh',                    abbr: 'CG', is_active: true },
  { code: '23', name: 'Madhya Pradesh',                  abbr: 'MP', is_active: true },
  { code: '24', name: 'Gujarat',                         abbr: 'GJ', is_active: true },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu', abbr: 'DN', is_active: true },
  { code: '27', name: 'Maharashtra',                     abbr: 'MH', is_active: true },
  { code: '29', name: 'Karnataka',                       abbr: 'KA', is_active: true },
  { code: '30', name: 'Goa',                             abbr: 'GA', is_active: true },
  { code: '31', name: 'Lakshadweep',                     abbr: 'LD', is_active: true },
  { code: '32', name: 'Kerala',                          abbr: 'KL', is_active: true },
  { code: '33', name: 'Tamil Nadu',                      abbr: 'TN', is_active: true },
  { code: '34', name: 'Puducherry',                      abbr: 'PY', is_active: true },
  { code: '35', name: 'Andaman & Nicobar Islands',       abbr: 'AN', is_active: true },
  { code: '36', name: 'Telangana',                       abbr: 'TS', is_active: true },
  { code: '37', name: 'Andhra Pradesh',                  abbr: 'AP', is_active: true },
  { code: '38', name: 'Ladakh',                          abbr: 'LA', is_active: true },
];

export const stateName = (code?: string | null): string | null =>
  INDIA_STATES.find((s) => s.code === code)?.name ?? null;

// GSTIN format: NNAAAAANNNNAPN[1Z]Z[A0-9]
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export interface GstinClientParse {
  valid: boolean;
  reason?: 'format' | 'unknown_state';
  state_code?: string;
  state_name?: string;
}

/**
 * Client-side GSTIN sanity check. Validates length/shape and extracts the
 * state code so the dropdown can auto-fill. Full checksum validation runs
 * on the server (POST /api/v1/distribution/gstin/verify).
 */
export function parseGstinClient(input: string): GstinClientParse {
  const g = (input || '').trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return { valid: false, reason: 'format' };
  const code = g.slice(0, 2);
  const name = stateName(code);
  if (!name) return { valid: false, reason: 'unknown_state', state_code: code };
  return { valid: true, state_code: code, state_name: name };
}

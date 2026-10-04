// GST state / UT codes (place of supply). Keep in sync with the backend's src/services/finance/gstStates.ts.
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory', '99': 'Other Country',
};

export const GST_STATE_OPTIONS = Object.entries(GST_STATES).map(([code, name]) => ({ code, name, label: `[${code}] - ${name}` }));

export function stateLabel(code?: string | null): string {
  if (!code) return '';
  const c = String(code).trim().padStart(2, '0');
  return GST_STATES[c] ? `${c}-${GST_STATES[c]}` : String(code);
}

/** Resolve a state name (as typed in an address) to its GST code, if it matches. */
export function stateCodeForName(name?: string | null): string | null {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const hit = Object.entries(GST_STATES).find(([, v]) => v.toLowerCase() === n);
  return hit ? hit[0] : null;
}

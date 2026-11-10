// Format validators for Indian statutory identifiers. They check shape (and the Aadhaar checksum), not
// existence: real verification (PAN-Aadhaar link, UAN activation, penny-drop) needs the backend and third parties.

import { looksMaskedAccount, looksMaskedPan } from './live/masking';

export type Check = { ok: true } | { ok: false; message: string };
const ok: Check = { ok: true };
const bad = (message: string): Check => ({ ok: false, message });

const clean = (s: string) => s.replace(/\s+/g, '').toUpperCase();

/** AAAAA9999A; the 4th letter is the holder type (P person, C company, ...). */
export function checkPan(v: string): Check {
  const s = clean(v);
  if (!s) return bad('PAN is required');
  // Live data: the server shows a PAN it holds as a mask (XXXXXX234F). A mask means "a PAN is on file", not "invalid".
  if (looksMaskedPan(s)) return ok;
  return /^[A-Z]{3}[ABCFGHLJPTK][A-Z][0-9]{4}[A-Z]$/.test(s) ? ok : bad('PAN looks like ABCDE1234F');
}

// Verhoeff checksum, which every Aadhaar number carries in its last digit.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
function verhoeff(num: string): boolean {
  let c = 0;
  const rev = num.split('').reverse().map(Number);
  for (let i = 0; i < rev.length; i++) c = D[c]![P[i % 8]![rev[i]!]!]!;
  return c === 0;
}
/** 12 digits, not starting with 0 or 1, valid Verhoeff checksum. */
export function checkAadhaar(v: string): Check {
  const s = v.replace(/\s+/g, '');
  if (!s) return bad('Aadhaar number is required');
  if (!/^[2-9][0-9]{11}$/.test(s)) return bad('Aadhaar is 12 digits and does not start with 0 or 1');
  return verhoeff(s) ? ok : bad('This Aadhaar number fails its checksum');
}
/** Generates a checksum-valid 12 digit number for sample data. */
export function sampleAadhaar(seed: number): string {
  const body = String((seed * 2654435761) % 10000000000).padStart(10, '0');
  const base = String(2 + (seed % 8)) + body; // 11 digits, first digit 2-9
  for (let d = 0; d <= 9; d++) { if (verhoeff(base + d)) return base + d; }
  return base + '0';
}

export function checkUan(v: string): Check {
  const s = v.replace(/\s+/g, '');
  if (!s) return bad('UAN is required');
  return /^[0-9]{12}$/.test(s) ? ok : bad('UAN is 12 digits');
}
/** ESIC insurance number: 10 digits (older 17-digit numbers still exist). */
export function checkEsic(v: string): Check {
  const s = v.replace(/\s+/g, '');
  if (!s) return bad('ESIC number is required');
  return /^([0-9]{10}|[0-9]{17})$/.test(s) ? ok : bad('ESIC number is 10 digits (17 for older numbers)');
}
export function checkIfsc(v: string): Check {
  const s = clean(v);
  if (!s) return bad('IFSC is required');
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(s) ? ok : bad('IFSC looks like HDFC0001234');
}
export function checkAccount(v: string): Check {
  const s = v.replace(/\s+/g, '');
  if (!s) return bad('Account number is required');
  // Live data: an account number the server holds is shown masked (••••••1234); a mask means "on file".
  if (looksMaskedAccount(s)) return ok;
  return /^[0-9]{9,18}$/.test(s) ? ok : bad('Account number is 9 to 18 digits');
}
export function checkMobile(v: string): Check {
  const s = v.replace(/[\s-]/g, '').replace(/^\+?91/, '');
  if (!s) return bad('Mobile number is required');
  return /^[6-9][0-9]{9}$/.test(s) ? ok : bad('Mobile is 10 digits starting 6 to 9');
}
export function checkEmail(v: string): Check {
  if (!v.trim()) return bad('Email is required');
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? ok : bad('Enter a valid email');
}
export function checkPincode(v: string): Check {
  if (!v.trim()) return bad('Pincode is required');
  return /^[1-9][0-9]{5}$/.test(v.trim()) ? ok : bad('Pincode is 6 digits');
}
export function checkTan(v: string): Check {
  const s = clean(v);
  if (!s) return bad('TAN is required');
  return /^[A-Z]{4}[0-9]{5}[A-Z]$/.test(s) ? ok : bad('TAN looks like DELA12345B');
}
export function checkGstin(v: string): Check {
  const s = clean(v);
  if (!s) return ok;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s) ? ok : bad('GSTIN is 15 characters');
}

export const maskAadhaar = (last4?: string): string => (last4 ? `XXXX XXXX ${last4}` : '—');
export const maskAccount = (n?: string): string => (n ? `${'•'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : '—');
export const maskPan = (p?: string): string => (p ? (looksMaskedPan(p) ? p : `${p.slice(0, 2)}•••••${p.slice(-3)}`) : '—');
export const maskMobile = (m?: string): string => (m ? `${m.slice(0, 2)}••••••${m.slice(-2)}` : '—');

/** How much of the statutory file is complete, 0..100, plus what is missing. Drives the completeness bars. */
export function completeness(e: {
  pan?: string; aadhaarLast4?: string; uan?: string; uanStatus: string; pfMember: boolean; esicIp?: string; bank?: { accountNumber: string; ifsc: string };
  documents: { mandatory?: boolean; status: string }[]; annualCtc?: number; structureId?: string;
}, esiApplicable = false): { pct: number; missing: string[] } {
  const missing: string[] = [];
  if (!e.pan || !checkPan(e.pan).ok) missing.push('PAN');
  if (!e.aadhaarLast4) missing.push('Aadhaar');
  if (e.pfMember && (!e.uan || !checkUan(e.uan).ok)) missing.push('UAN');
  if (e.pfMember && e.uanStatus !== 'aadhaar_seeded') missing.push('UAN not Aadhaar-seeded');
  if (esiApplicable && (!e.esicIp || !checkEsic(e.esicIp).ok)) missing.push('ESIC number');
  if (!e.bank || !checkAccount(e.bank.accountNumber).ok || !checkIfsc(e.bank.ifsc).ok) missing.push('Bank account');
  if (e.documents.some((d) => d.mandatory && d.status !== 'verified' && d.status !== 'uploaded')) missing.push('Mandatory documents');
  if (!e.structureId || !e.annualCtc) missing.push('Salary structure');
  const total = 8;
  return { pct: Math.round(((total - missing.length) / total) * 100), missing };
}

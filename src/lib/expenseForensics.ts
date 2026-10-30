/**
 * Expense forensics — a FRONTEND prototype of the forgery/fraud checks a manager
 * sees when an expense claim is submitted. It is deliberately a pure, data-in /
 * findings-out module: no network, no backend. Today the signals it reads come
 * from demo fixtures (demoMocks.ts); wiring a real backend to emit the same
 * `ClaimSignals` is a later, separate job.
 *
 * Each check is listed in FORENSIC_CHECKS (so the settings screen can show every
 * scenario) and implemented in runForensics. Thresholds live in ForensicsConfig
 * so they are manageable (e.g. the halt limit is editable, default 4 h).
 *
 * Findings reuse the existing ExpenseFlag shape (code / severity / detail /
 * item_id) via toExpenseFlag(), so the same FlagBadge / PolicyFindings UI renders
 * them — with extra evidence (which other users / claims a cross-person finding
 * involves) carried alongside for the highlights panel.
 */
import type { ExpenseFlag } from './expensesApi';

// ── signals the engine reads (one per claim) ─────────────────────────────────

export interface GeoPoint { lat: number; lng: number }

/** A stationary stretch in a person's day: they stayed within a small radius from `start` to `end`. */
export interface DwellCluster {
  at: GeoPoint;
  place?: string | null;
  start: string; // ISO
  end: string;   // ISO
  minutes: number;
}

/** A receipt on a claim line, with a content fingerprint — the same image/receipt yields the same fingerprint. */
export interface ReceiptRef {
  item_id: string;
  fingerprint: string;
  merchant: string | null;
  amount: number | null;
  /** The date printed on the receipt (YYYY-MM-DD), when read. */
  txn_date: string | null;
}

/**
 * Everything the forensics engine needs about one claim's day. In production the
 * backend would assemble this from the GPS trail, the receipt store and the shift;
 * in the demo it is handed over as a fixture.
 */
export interface ClaimSignals {
  claim_id: string;
  user_id: string;
  user_name: string | null;
  /** The IST day the claim is for (YYYY-MM-DD) — used to group same-day activity and to deep-link the travel report. */
  date: string;
  shift?: { checkin_at: string | null; checkout_at: string | null } | null;
  dwells: DwellCluster[];
  receipts: ReceiptRef[];
  /** Distance the GPS trail actually measured that day (km), or null if unknown. */
  gps_km: number | null;
  /** Mileage distance the claim asks to be paid for (km), or null. */
  claimed_km: number | null;
  /** Mock-location / spoofed fixes detected that day. */
  mock_fixes: number;
  /** Was this a configured working day for the person. */
  working_day: boolean;
}

// ── configurable thresholds (manageable in settings) ─────────────────────────

export interface ForensicsConfig {
  /** A single halt at or beyond this many hours is highlighted. */
  longHaltHours: number;
  /** Two people within this many metres... */
  coLocationRadiusM: number;
  /** ...for at least this many overlapping minutes are flagged as co-located. */
  coLocationMinutes: number;
  /** Claimed mileage above GPS-measured distance by more than this % is flagged. */
  mileageOverPct: number;
  /** A day whose GPS trail is at or below this many km counts as "no real movement" for a mileage claim. */
  noMovementKm: number;
}

export const DEFAULT_FORENSICS_CONFIG: ForensicsConfig = {
  longHaltHours: 4,
  coLocationRadiusM: 150,
  coLocationMinutes: 30,
  mileageOverPct: 25,
  noMovementKm: 1,
};

/** Editable labels + bounds for each threshold, for the settings UI. */
export const THRESHOLD_META: Record<keyof ForensicsConfig, { label: string; unit: string; min: number; max: number; step: number }> = {
  longHaltHours:     { label: 'Halt length that is flagged', unit: 'hours', min: 1, max: 12, step: 0.5 },
  coLocationRadiusM: { label: 'Reps counted as "together" within', unit: 'metres', min: 20, max: 1000, step: 10 },
  coLocationMinutes: { label: 'for at least', unit: 'minutes', min: 10, max: 240, step: 5 },
  mileageOverPct:    { label: 'Mileage over GPS by more than', unit: '%', min: 5, max: 200, step: 5 },
  noMovementKm:      { label: 'A day with GPS movement at or below', unit: 'km', min: 0, max: 5, step: 0.5 },
};

const CONFIG_KEY = 'kinematic_forensics_config';

/** The manager-set thresholds, from localStorage, merged over the defaults. Safe on the server / private mode. */
export function loadForensicsConfig(): ForensicsConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_FORENSICS_CONFIG };
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return { ...DEFAULT_FORENSICS_CONFIG };
    const saved = JSON.parse(raw) as Partial<ForensicsConfig>;
    const merged = { ...DEFAULT_FORENSICS_CONFIG };
    for (const k of Object.keys(DEFAULT_FORENSICS_CONFIG) as Array<keyof ForensicsConfig>) {
      if (typeof saved[k] === 'number' && Number.isFinite(saved[k])) merged[k] = saved[k] as number;
    }
    return merged;
  } catch { return { ...DEFAULT_FORENSICS_CONFIG }; }
}

export function saveForensicsConfig(cfg: ForensicsConfig): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); } catch { /* private mode — ignore */ }
}

// ── the scenario catalogue (powers the settings list + labels) ───────────────

export type ForensicCode =
  | 'colocation'
  | 'duplicate_receipt'
  | 'long_halt'
  | 'mileage_over_gps'
  | 'no_gps_for_mileage'
  | 'receipt_date_mismatch'
  | 'mock_location'
  | 'non_working_day'
  | 'repeated_amount';

export type Severity = ExpenseFlag['severity']; // 'info' | 'warn' | 'high'

export interface ForensicCheck {
  code: ForensicCode;
  title: string;
  /** Plain description of what the check looks for — shown in the settings list. */
  description: string;
  severity: Severity;
  /** Which config threshold(s) drive it, for the settings UI to render editable controls. */
  thresholds: Array<keyof ForensicsConfig>;
  /** Whether it compares across people/claims (vs. a single claim in isolation). */
  crossClaim: boolean;
}

export const FORENSIC_CHECKS: ForensicCheck[] = [
  { code: 'colocation', title: 'Reps together too long', severity: 'high', crossClaim: true, thresholds: ['coLocationRadiusM', 'coLocationMinutes'],
    description: 'Two or more field reps sit within a small radius of each other for a sustained stretch — a sign of shared or fabricated visits, or one phone carried for another.' },
  { code: 'duplicate_receipt', title: 'Same receipt reused', severity: 'high', crossClaim: true, thresholds: [],
    description: 'The same receipt image is attached to claims by more than one person, or on more than one claim — a receipt submitted twice.' },
  { code: 'long_halt', title: 'Long halt', severity: 'warn', crossClaim: false, thresholds: ['longHaltHours'],
    description: 'The rep was stationary at one place beyond the allowed halt time — idle, or not where the day was claimed to be.' },
  { code: 'mileage_over_gps', title: 'Mileage over GPS', severity: 'high', crossClaim: false, thresholds: ['mileageOverPct'],
    description: 'The distance claimed for mileage is well above the distance the GPS trail actually measured that day.' },
  { code: 'no_gps_for_mileage', title: 'Mileage with no movement', severity: 'warn', crossClaim: false, thresholds: ['noMovementKm'],
    description: 'A mileage or fuel line is claimed on a day the GPS trail shows almost no movement.' },
  { code: 'receipt_date_mismatch', title: 'Receipt date mismatch', severity: 'warn', crossClaim: false, thresholds: [],
    description: 'The date printed on a receipt is not the day the expense is claimed for — an old or borrowed receipt.' },
  { code: 'mock_location', title: 'Fake GPS detected', severity: 'high', crossClaim: false, thresholds: [],
    description: 'Mock-location (spoofed GPS) fixes were recorded during the day — the location trail cannot be trusted.' },
  { code: 'non_working_day', title: 'Non-working day', severity: 'info', crossClaim: false, thresholds: [],
    description: 'The expense is claimed for a day that is not a configured working day (e.g. a weekly off), or has no check-in.' },
  { code: 'repeated_amount', title: 'Repeated identical amount', severity: 'info', crossClaim: false, thresholds: [],
    description: 'The same amount at the same merchant appears more than once on the claim — a possible double-entry.' },
];

export const FORENSIC_CHECK_BY_CODE: Record<ForensicCode, ForensicCheck> =
  Object.fromEntries(FORENSIC_CHECKS.map((c) => [c.code, c])) as Record<ForensicCode, ForensicCheck>;

// ── findings ─────────────────────────────────────────────────────────────────

export interface FindingParty { user_id: string; user_name: string | null; claim_id: string }

export interface ForensicFinding {
  code: ForensicCode;
  severity: Severity;
  /** Short label (the check's title, possibly specialised). */
  title: string;
  /** Human sentence with the specifics for this claim. */
  detail: string;
  /** For a cross-person finding: the OTHER people/claims involved. */
  involved?: FindingParty[];
  /** The claim line this finding points at, when it is line-specific. */
  item_id?: string;
}

/** Render a finding with the existing FlagBadge / PolicyFindings components. */
export function toExpenseFlag(f: ForensicFinding): ExpenseFlag {
  return { code: `forensic_${f.code}`, severity: f.severity, detail: f.detail, item_id: f.item_id, blocking: false };
}

export const SEVERITY_RANK: Record<Severity, number> = { info: 0, warn: 1, high: 2 };

/** The worst severity across a claim's findings (null when there are none). */
export function worstSeverity(findings: ForensicFinding[]): Severity | null {
  if (!findings.length) return null;
  return findings.reduce<Severity>((w, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[w] ? f.severity : w), 'info');
}

// ── geo + time helpers ───────────────────────────────────────────────────────

const EARTH_M = 6_371_000;
function metresBetween(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

const ms = (iso: string): number => Date.parse(iso);

/** Overlapping minutes between two [start,end] windows (0 when they do not overlap). */
function overlapMinutes(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const lo = Math.max(ms(aStart), ms(bStart));
  const hi = Math.min(ms(aEnd), ms(bEnd));
  return hi > lo ? Math.round((hi - lo) / 60_000) : 0;
}

const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

function durationText(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ── the engine ───────────────────────────────────────────────────────────────

/**
 * Run every check over a set of claims' signals and return the findings per claim
 * id. Cross-person checks (co-location, duplicate receipt) compare claims on the
 * same day, so pass in the whole set you want considered together.
 */
export function runForensics(
  signals: ReadonlyArray<ClaimSignals>,
  config: ForensicsConfig = DEFAULT_FORENSICS_CONFIG,
): Map<string, ForensicFinding[]> {
  const out = new Map<string, ForensicFinding[]>();
  const push = (claimId: string, f: ForensicFinding) => {
    const list = out.get(claimId) ?? [];
    list.push(f);
    out.set(claimId, list);
  };

  // ── per-claim checks ──
  for (const s of signals) {
    // long halt
    const longest = s.dwells.reduce<DwellCluster | null>((m, d) => (!m || d.minutes > m.minutes ? d : m), null);
    if (longest && longest.minutes >= config.longHaltHours * 60) {
      push(s.claim_id, {
        code: 'long_halt', severity: 'warn', title: 'Long halt',
        detail: `Stationary ${durationText(longest.minutes)} at ${longest.place || 'one location'} (${hhmm(longest.start)}–${hhmm(longest.end)}) — over the ${config.longHaltHours}h halt limit.`,
      });
    }

    // mileage over GPS / no movement
    const claimed = s.claimed_km;
    const gps = s.gps_km;
    if (claimed != null && claimed > 0) {
      if (gps != null && gps <= config.noMovementKm) {
        push(s.claim_id, {
          code: 'no_gps_for_mileage', severity: 'warn', title: 'Mileage with no movement',
          detail: `${claimed.toFixed(1)} km claimed but the GPS trail shows only ${gps.toFixed(1)} km of movement that day.`,
        });
      } else if (gps != null && gps > config.noMovementKm && claimed > gps * (1 + config.mileageOverPct / 100)) {
        const overPct = Math.round(((claimed - gps) / gps) * 100);
        push(s.claim_id, {
          code: 'mileage_over_gps', severity: 'high', title: 'Mileage over GPS',
          detail: `Claimed ${claimed.toFixed(1)} km but GPS tracked ${gps.toFixed(1)} km (${overPct}% over the measured distance).`,
        });
      }
    }

    // receipt date mismatch
    for (const r of s.receipts) {
      if (r.txn_date && r.txn_date !== s.date) {
        push(s.claim_id, {
          code: 'receipt_date_mismatch', severity: 'warn', title: 'Receipt date mismatch', item_id: r.item_id,
          detail: `Receipt${r.merchant ? ` from ${r.merchant}` : ''} is dated ${r.txn_date} but the expense is claimed for ${s.date}.`,
        });
      }
    }

    // mock location
    if (s.mock_fixes > 0) {
      push(s.claim_id, {
        code: 'mock_location', severity: 'high', title: 'Fake GPS detected',
        detail: `${s.mock_fixes} mock-location (spoofed GPS) ${s.mock_fixes === 1 ? 'fix' : 'fixes'} recorded that day — the trail cannot be trusted.`,
      });
    }

    // non-working day / no shift
    if (!s.working_day || !s.shift?.checkin_at) {
      push(s.claim_id, {
        code: 'non_working_day', severity: 'info', title: 'Non-working day',
        detail: s.shift?.checkin_at ? `Claimed for ${s.date}, which is not a configured working day.` : `No check-in recorded on ${s.date}.`,
      });
    }

    // repeated identical amount+merchant on the same claim
    const seen = new Map<string, number>();
    for (const r of s.receipts) {
      if (r.amount == null) continue;
      const key = `${r.merchant ?? '?'}|${r.amount}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    for (const [key, n] of seen) {
      if (n >= 2) {
        const [merchant, amt] = key.split('|');
        push(s.claim_id, {
          code: 'repeated_amount', severity: 'info', title: 'Repeated identical amount',
          detail: `₹${amt}${merchant !== '?' ? ` at ${merchant}` : ''} appears ${n} times on this claim — possible double-entry.`,
        });
      }
    }
  }

  // ── cross-claim: duplicate receipt ──
  const byFingerprint = new Map<string, Array<{ s: ClaimSignals; r: ReceiptRef }>>();
  for (const s of signals) {
    for (const r of s.receipts) {
      const list = byFingerprint.get(r.fingerprint) ?? [];
      list.push({ s, r });
      byFingerprint.set(r.fingerprint, list);
    }
  }
  for (const [, uses] of byFingerprint) {
    const distinctClaims = new Set(uses.map((u) => u.s.claim_id));
    if (distinctClaims.size < 2) continue; // same receipt, same claim line twice is fine
    for (const { s, r } of uses) {
      const others = uses.filter((u) => u.s.claim_id !== s.claim_id);
      const involved: FindingParty[] = dedupeParties(others.map((u) => ({ user_id: u.s.user_id, user_name: u.s.user_name, claim_id: u.s.claim_id })));
      const who = summariseParties(involved);
      push(s.claim_id, {
        code: 'duplicate_receipt', severity: 'high', title: 'Same receipt reused', item_id: r.item_id, involved,
        detail: `This receipt${r.merchant ? ` (${r.merchant}${r.amount != null ? `, ₹${r.amount}` : ''})` : ''} was also submitted by ${who}.`,
      });
    }
  }

  // ── cross-claim: co-location ──
  const byDate = new Map<string, ClaimSignals[]>();
  for (const s of signals) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  for (const [, day] of byDate) {
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const a = day[i];
        const b = day[j];
        if (a.user_id === b.user_id) continue;
        let best: { minutes: number; metres: number; start: string; end: string } | null = null;
        for (const da of a.dwells) {
          for (const db of b.dwells) {
            const mins = overlapMinutes(da.start, da.end, db.start, db.end);
            if (mins < config.coLocationMinutes) continue;
            const dist = metresBetween(da.at, db.at);
            if (dist > config.coLocationRadiusM) continue;
            if (!best || mins > best.minutes) best = { minutes: mins, metres: Math.round(dist), start: maxStart(da.start, db.start), end: minEnd(da.end, db.end) };
          }
        }
        if (best) {
          const detail = (self: ClaimSignals, other: ClaimSignals) =>
            `${self.user_name || 'This rep'} and ${other.user_name || 'another rep'} were within ${best!.metres} m of each other for ${durationText(best!.minutes)} (${hhmm(best!.start)}–${hhmm(best!.end)}) — possible shared or fabricated visits.`;
          push(a.claim_id, { code: 'colocation', severity: 'high', title: 'Reps together too long', detail: detail(a, b), involved: [{ user_id: b.user_id, user_name: b.user_name, claim_id: b.claim_id }] });
          push(b.claim_id, { code: 'colocation', severity: 'high', title: 'Reps together too long', detail: detail(b, a), involved: [{ user_id: a.user_id, user_name: a.user_name, claim_id: a.claim_id }] });
        }
      }
    }
  }

  // order each claim's findings worst-first
  for (const [k, list] of out) {
    list.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity]);
    out.set(k, list);
  }
  return out;
}

const maxStart = (a: string, b: string): string => (ms(a) >= ms(b) ? a : b);
const minEnd = (a: string, b: string): string => (ms(a) <= ms(b) ? a : b);

function dedupeParties(parties: FindingParty[]): FindingParty[] {
  const seen = new Set<string>();
  return parties.filter((p) => (seen.has(p.claim_id) ? false : (seen.add(p.claim_id), true)));
}

function summariseParties(parties: FindingParty[]): string {
  const names = Array.from(new Set(parties.map((p) => p.user_name || 'another rep')));
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} others`;
}

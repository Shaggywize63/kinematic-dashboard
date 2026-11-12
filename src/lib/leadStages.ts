import { extractLeadStatuses, prettifyStatus, type LeadStatusOption } from './crmLeadStatuses';

// Settings -> Lead Stages (connected-B2B / Spark & Ray): the helpers behind the editor. The stages themselves are the
// per-client setting crm_settings.config.lead_statuses (see crmLeadStatuses.ts for how every screen reads them); this
// module only builds, validates and serialises the list the admin edits. It is pure so it can be tested without a browser.

/** Same rule the backend (parseLeadStatuses) enforces on a stage value. */
export const STAGE_VALUE_RE = /^[a-z][a-z0-9_]{0,63}$/;
export const STAGE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const MAX_STAGE_LABEL = 60;
export const STAGE_FALLBACK_COLOR = '#6B7280';

/**
 * How a stage counts. open = a lead still being worked; won = a deal won; lost = lost / thrown away; closed = the
 * deal is finished but is neither won nor lost (Spark's "Finished").
 */
export type StageKind = 'open' | 'won' | 'lost' | 'closed';

export interface StageDef { value: string; label: string; color: string; kind: StageKind }

export const STAGE_KIND_LABEL: Record<StageKind, string> = { open: 'Open', won: 'Won', lost: 'Lost', closed: 'Closed' };

/** The set a client that never saved its own list is on today (what every screen falls back to). */
export const BUILTIN_STAGES: StageDef[] = [
  { value: 'new', label: 'New', color: '#3B82F6', kind: 'open' },
  { value: 'working', label: 'Working', color: '#F59E0B', kind: 'open' },
  { value: 'qualified', label: 'Qualified', color: '#10B981', kind: 'open' },
  { value: 'unqualified', label: 'Unqualified', color: '#6B7280', kind: 'lost' },
  { value: 'converted', label: 'Converted', color: '#16A34A', kind: 'won' },
  { value: 'lost', label: 'Lost', color: '#EF4444', kind: 'lost' },
];

/** Spark & Ray's combined list of lead stages, in order. */
export const COMBINED_STAGES: StageDef[] = [
  { value: 'universe', label: 'Universe', color: '#94A3B8', kind: 'open' },
  { value: 'above', label: 'Above', color: '#38BDF8', kind: 'open' },
  { value: 'inside', label: 'Inside', color: '#6366F1', kind: 'open' },
  { value: 'defined', label: 'Defined', color: '#8B5CF6', kind: 'open' },
  { value: 'cold_call', label: 'Cold Call', color: '#06B6D4', kind: 'open' },
  { value: 'discussion', label: 'Discussion', color: '#F59E0B', kind: 'open' },
  { value: 'negotiation', label: 'Negotiation', color: '#F97316', kind: 'open' },
  { value: 'won', label: 'Won', color: '#10B981', kind: 'won' },
  { value: 'finished', label: 'Finished', color: '#0D9488', kind: 'closed' },
  { value: 'lost', label: 'Lost', color: '#EF4444', kind: 'lost' },
  { value: 'trash', label: 'Trash', color: '#6B7280', kind: 'lost' },
];

export function kindOf(o: Pick<LeadStatusOption, 'is_won' | 'is_lost' | 'is_open'>): StageKind {
  if (o.is_won) return 'won';
  if (o.is_lost) return 'lost';
  if (o.is_open === false) return 'closed';
  return 'open';
}

const hex = (c?: string): string => (c && STAGE_COLOR_RE.test(c.trim()) ? c.trim().toUpperCase() : STAGE_FALLBACK_COLOR);

/**
 * The stages the client has saved, in order, or null when it has none (it is then on the built-in set).
 * Reads exactly what the rest of the app reads (extractLeadStatuses), so what the admin edits is what screens show.
 */
export function savedStages(settingsData: unknown): StageDef[] | null {
  const list = extractLeadStatuses(settingsData);
  if (!list) return null;
  return list.map((o) => ({ value: o.value, label: o.label, color: hex(o.color), kind: kindOf(o) }));
}

/** What the editor starts from: the saved list, or the built-in set (shown as the current stages) when none is saved. */
export function resolveStages(settingsData: unknown): { stages: StageDef[]; custom: boolean } {
  const saved = savedStages(settingsData);
  return saved ? { stages: saved, custom: true } : { stages: BUILTIN_STAGES.map((s) => ({ ...s })), custom: false };
}

/**
 * "Add the combined stage list": the stages of COMBINED_STAGES whose value is missing, appended in their own order.
 * Everything already there is kept exactly as it is, in its place, and nothing is removed.
 */
export function appendCombined(current: readonly StageDef[]): { stages: StageDef[]; added: StageDef[] } {
  const have = new Set(current.map((s) => s.value));
  const added = COMBINED_STAGES.filter((s) => !have.has(s.value)).map((s) => ({ ...s }));
  return { stages: [...current.map((s) => ({ ...s })), ...added], added };
}

/** Lowercase slug for a stage value from its label: "Cold Call" -> "cold_call". */
export function slugifyStage(label: string): string {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const withLetter = /^[a-z]/.test(s) ? s : (s ? `s_${s}` : '');
  return withLetter.slice(0, 64).replace(/_+$/, '');
}

/** Swap a stage with its neighbour (dir -1 = up, +1 = down); out of range returns the list unchanged. */
export function moveStage<T>(list: readonly T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (index < 0 || index >= list.length || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Problems that stop a save, in the order the rows are listed. Empty = fine. */
export function validateStages(list: readonly StageDef[]): string[] {
  const errs: string[] = [];
  if (list.length === 0) errs.push('Keep at least one stage.');
  const seen = new Set<string>();
  const labels = new Set<string>();
  list.forEach((s, i) => {
    const n = i + 1;
    if (!s.label.trim()) errs.push(`Stage ${n} needs a name.`);
    else if (s.label.trim().length > MAX_STAGE_LABEL) errs.push(`Stage ${n}: the name is longer than ${MAX_STAGE_LABEL} characters.`);
    else {
      const k = s.label.trim().toLowerCase();
      if (labels.has(k)) errs.push(`Two stages are called "${s.label.trim()}".`);
      labels.add(k);
    }
    if (!STAGE_VALUE_RE.test(s.value)) errs.push(`Stage ${n}: the key must be lowercase letters, digits and underscores, starting with a letter (like cold_call).`);
    else if (seen.has(s.value)) errs.push(`The key "${s.value}" is used by more than one stage.`);
    seen.add(s.value);
    if (!STAGE_COLOR_RE.test(s.color.trim())) errs.push(`Stage ${n}: the colour must be a #RRGGBB value.`);
  });
  return errs;
}

/** The exact array saved as crm_settings.config.lead_statuses: positions 0..n-1 in list order, flags explicit. */
export function buildStatusesConfig(list: readonly StageDef[]): Array<{ value: string; label: string; color: string; position: number; is_won: boolean; is_lost: boolean; is_open: boolean }> {
  return list.map((s, i) => ({
    value: s.value,
    label: s.label.trim() || prettifyStatus(s.value),
    color: hex(s.color),
    position: i,
    is_won: s.kind === 'won',
    is_lost: s.kind === 'lost',
    is_open: s.kind === 'open',
  }));
}

/** Stable snapshot for "has anything changed". */
export const stagesSnapshot = (list: readonly StageDef[]): string => JSON.stringify(buildStatusesConfig(list));

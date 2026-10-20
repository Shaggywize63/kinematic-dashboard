import type { Activity } from '../../../types/crm';

const TZ = 'Asia/Kolkata';

/** Optional fields the activities endpoint returns that the shared `Activity` type does not declare. */
export type DetailActivity = Activity & {
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  custom_fields?: unknown;
};

export function fmtIST(iso?: string | null, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { timeZone: TZ, ...opts });
}

export function fmtDate(iso?: string | null): string {
  return fmtIST(iso, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtTime(iso?: string | null): string {
  return fmtIST(iso, { hour: 'numeric', minute: '2-digit' });
}

/** "just now" / "5m ago" / "3h ago" / "4d ago" / "2w ago" / "12 Sep 2026". */
export function relTime(iso?: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${Math.max(min, 1)}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  if (day < 60) return `${Math.floor(day / 7)}w ago`;
  return fmtDate(iso);
}

/** IST calendar day key (YYYY-MM-DD), so a 11pm note and a 1am note land on different days. */
export function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
}

export function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  // Noon UTC keeps the weekday stable whatever zone the browser is in.
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export interface DueInfo {
  /** "Overdue · 2d", "Today · 4:30 PM", "Tomorrow", "in 3 days". */
  label: string;
  overdue: boolean;
  today: boolean;
}

/** Whole IST calendar days from today to `iso` (negative = in the past). */
function dayDiff(iso: string): number {
  const a = new Date(`${dayKey(iso)}T00:00:00Z`).getTime();
  const b = new Date(`${dayKey(new Date().toISOString())}T00:00:00Z`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function dueInfo(iso?: string | null): DueInfo | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = dayDiff(iso);
  if (diff < 0) return { label: `Overdue · ${Math.abs(diff)}d`, overdue: true, today: false };
  if (diff === 0) {
    // Due earlier today is still overdue — the time matters on the day itself.
    return t < Date.now()
      ? { label: `Overdue · ${fmtTime(iso)}`, overdue: true, today: true }
      : { label: `Today · ${fmtTime(iso)}`, overdue: false, today: true };
  }
  if (diff === 1) return { label: `Tomorrow · ${fmtTime(iso)}`, overdue: false, today: false };
  if (diff < 7) return { label: `in ${diff} days`, overdue: false, today: false };
  return { label: fmtDate(iso), overdue: false, today: false };
}

export type ActivityState = 'open' | 'in_progress' | 'done' | 'cancelled';

export function activityState(a: DetailActivity): ActivityState {
  const s = (a.status || '').toLowerCase();
  if (a.completed_at || s === 'completed' || s === 'done') return 'done';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'in_progress') return 'in_progress';
  return 'open';
}

export const isActionable = (a: DetailActivity) => {
  const st = activityState(a);
  return st === 'open' || st === 'in_progress';
};

/** When an activity "happened": completion beats due date beats creation. */
export function activityWhen(a: DetailActivity): string {
  return a.completed_at || a.due_at || a.created_at;
}

/** Each telecaller call belongs to a campaign: its own metadata.campaign, else the lead's tag. */
export function activityCampaign(a: DetailActivity, leadCampaign?: string | null): string | null {
  const m = a.metadata;
  const own = m && typeof m.campaign === 'string' ? m.campaign.trim() : '';
  return own || (leadCampaign ? String(leadCampaign) : null);
}

export const TYPE_LABEL: Record<string, string> = {
  call: 'Call', email: 'Email', meeting: 'Meeting', task: 'Task', note: 'Note', sms: 'SMS', whatsapp: 'WhatsApp',
};

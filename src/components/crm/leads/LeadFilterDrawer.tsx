'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';
import api from '../../../lib/api';
import { useCrmDateRange, type DateRangePreset } from '../../../stores/crmDateRangeStore';
import { Button, IconButton, Input, Select, T, eyebrowStyle } from '../../ui';
import { GRADE_OPTIONS, type LeadFiltersValue } from '../LeadFilters';

// Cascading State → City → District → Block, backed by
// /api/v1/crm/locations/options — values are constrained to whatever
// Settings → Locations has loaded for the active client.
interface LocationRow { state: string; city: string; district: string | null; block: string | null }
type LocationOptionsResponse = { success?: boolean; data?: { rows: LocationRow[] } | LocationRow[] } | { rows: LocationRow[] };

function readRows(r: LocationOptionsResponse): LocationRow[] {
  const payload = (r as { data?: unknown })?.data ?? r;
  if (Array.isArray(payload)) return payload as LocationRow[];
  return (payload as { rows?: LocationRow[] })?.rows ?? [];
}

const DATE_PRESETS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'all', label: 'Any time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={eyebrowStyle}>{title}</div>
      {children}
    </section>
  );
}

function Opt({ on, onClick, children, title }: { on: boolean; onClick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={onClick}
      className="km-chip"
      style={{
        height: 30, padding: '0 12px', borderRadius: T.radius.pill, fontFamily: 'inherit', fontSize: 13, fontWeight: on ? 600 : 500,
        border: `1px solid ${on ? T.info : T.border}`, background: on ? T.infoWash : T.card, color: on ? T.text : T.dim,
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {on && <Check size={13} strokeWidth={2.2} aria-hidden />}
      {children}
    </button>
  );
}

/**
 * The Filters side panel. Edits apply immediately (the list is server-side
 * filtered and already refetches on every change), so the footer button is a
 * live "Show N leads" close — the count updates as the controls change.
 */
export default function LeadFilterDrawer({
  open, onClose, value, onChange, sources, owners, showOwner, statusOptions, total, loading, onReset, onSaveView, savedCount, maxSaved,
}: {
  open: boolean;
  onClose: () => void;
  value: LeadFiltersValue;
  onChange: (next: LeadFiltersValue) => void;
  sources: Array<{ id: string; name: string }>;
  owners: Array<{ id: string; name: string }>;
  /** False hides the Owner control: a client that reserves lead ownership for admins gives everyone else no owner filter. */
  showOwner: boolean;
  statusOptions: Array<{ value: string; label: string }>;
  total: number;
  loading: boolean;
  onReset: () => void;
  onSaveView: (name: string) => void;
  savedCount: number;
  maxSaved: number;
}) {
  const [rows, setRows] = useState<LocationRow[]>([]);
  const [rowsLoaded, setRowsLoaded] = useState(false);
  const [viewName, setViewName] = useState('');
  const datePreset = useCrmDateRange((s) => s.preset);
  const setDatePreset = useCrmDateRange((s) => s.setPreset);

  // Location master is only needed once the panel is opened.
  useEffect(() => {
    if (!open || rowsLoaded) return;
    setRowsLoaded(true);
    api.get<LocationOptionsResponse>('/api/v1/crm/locations/options').then((r) => setRows(readRows(r))).catch(() => {});
  }, [open, rowsLoaded]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const states = useMemo(() => Array.from(new Set(rows.map((r) => r.state))).sort(), [rows]);
  const cities = useMemo(() =>
    Array.from(new Set(rows.filter((r) => !value.state || r.state === value.state).map((r) => r.city))).sort(),
    [rows, value.state]);
  const districts = useMemo(() =>
    Array.from(new Set(rows
      .filter((r) => (!value.state || r.state === value.state) && (!value.city || r.city === value.city))
      .map((r) => r.district).filter((d): d is string => Boolean(d)))).sort(),
    [rows, value.state, value.city]);
  const blocks = useMemo(() =>
    Array.from(new Set(rows
      .filter((r) => (!value.state || r.state === value.state) && (!value.city || r.city === value.city) && (!value.district || r.district === value.district))
      .map((r) => r.block).filter((b): b is string => Boolean(b)))).sort(),
    [rows, value.state, value.city, value.district]);

  if (!open) return null;

  const set = (patch: Partial<LeadFiltersValue>) => onChange({ ...value, ...patch });
  const selStatus = value.status ?? [];
  const toggleStatus = (v: string) => {
    const next = selStatus.includes(v) ? selStatus.filter((s) => s !== v) : [...selStatus, v];
    set({ status: next.length ? next : undefined });
  };
  const canSave = viewName.trim().length > 0 && savedCount < maxSaved;

  return (
    <>
      <div onClick={onClose} aria-hidden style={{ position: 'fixed', inset: 0, background: 'rgba(10,14,26,0.5)', zIndex: 1100 }} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100vw)', zIndex: 1101,
          background: T.card, borderLeft: `1px solid ${T.border}`, boxShadow: 'var(--shadow-pop)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.heading, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: T.text }}>Filters</div>
          <IconButton label="Close filters" onClick={onClose}><X size={18} strokeWidth={1.6} /></IconButton>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Group title="Status">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {statusOptions.map((o) => (
                <Opt key={o.value} on={selStatus.includes(o.value)} onClick={() => toggleStatus(o.value)}>{o.label}</Opt>
              ))}
            </div>
          </Group>

          <Group title="Score grade">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GRADE_OPTIONS.map((g) => (
                <Opt key={g.value} on={value.grade === g.value} onClick={() => set({ grade: value.grade === g.value ? undefined : g.value })} title={g.hint}>
                  {g.label} · {g.hint}
                </Opt>
              ))}
            </div>
          </Group>

          <Group title="Source">
            <Select aria-label="Source" value={value.source || ''} onChange={(e) => set({ source: e.target.value || undefined })}>
              <option value="">All Sources</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Group>

          {showOwner && (
            <Group title="Owner">
              <Select aria-label="Owner" value={value.owner || ''} onChange={(e) => set({ owner: e.target.value || undefined, ...(e.target.value ? { unassigned: undefined } : {}) })}>
                <option value="">All Owners</option>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
              {/* "No owner" is the opposite of picking one, so choosing it drops the owner above. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <Opt on={!!value.unassigned} onClick={() => set({ unassigned: value.unassigned ? undefined : true, owner: undefined })}>Unassigned only</Opt>
              </div>
            </Group>
          )}

          <Group title="Follow-ups">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Opt on={!!value.followupDue} onClick={() => set({ followupDue: value.followupDue ? undefined : true })} title="An open follow-up whose due time has arrived">Due or overdue</Opt>
            </div>
          </Group>

          {states.length > 0 && (
            <Group title="Location">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Select aria-label="State" value={value.state || ''} onChange={(e) => set({ state: e.target.value || undefined, city: undefined, district: undefined, block: undefined })}>
                  <option value="">All States</option>
                  {states.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                {value.state && cities.length > 0 ? (
                  <Select aria-label="City" value={value.city || ''} onChange={(e) => set({ city: e.target.value || undefined, district: undefined, block: undefined })}>
                    <option value="">All Cities</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                ) : <span />}
                {value.city && districts.length > 0 && (
                  <Select aria-label="District" value={value.district || ''} onChange={(e) => set({ district: e.target.value || undefined, block: undefined })}>
                    <option value="">All Districts</option>
                    {districts.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                )}
                {value.district && blocks.length > 0 && (
                  <Select aria-label="Block" value={value.block || ''} onChange={(e) => set({ block: e.target.value || undefined })}>
                    <option value="">All Blocks</option>
                    {blocks.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Select>
                )}
              </div>
            </Group>
          )}

          <Group title="Date added">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DATE_PRESETS.map((d) => (
                <Opt key={d.value} on={datePreset === d.value} onClick={() => setDatePreset(d.value)}>{d.label}</Opt>
              ))}
            </div>
            <div style={{ fontSize: 12, color: T.mute }}>Same range as the date picker at the top of CRM.</div>
          </Group>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 10, border: `1px dashed ${T.borderStrong}`, borderRadius: T.radius.lg, padding: 14 }}>
            <div style={eyebrowStyle}>Save as a view</div>
            <Input
              aria-label="View name"
              placeholder="e.g. Gujarat · hot call-centre leads"
              value={viewName}
              maxLength={40}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) { onSaveView(viewName.trim()); setViewName(''); } }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 12, color: T.mute }}>
                {savedCount >= maxSaved ? `You have ${maxSaved} saved views — remove one first.` : 'Saved on this device for you.'}
              </span>
              <Button size="sm" disabled={!canSave} onClick={() => { onSaveView(viewName.trim()); setViewName(''); }}>Save view</Button>
            </div>
          </section>
        </div>

        <footer style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: `1px solid ${T.border}`, background: T.card }}>
          <Button onClick={onReset} style={{ flex: '0 0 auto' }}>Reset</Button>
          <Button variant="primary" onClick={onClose} style={{ flex: 1, justifyContent: 'center' }}>
            {loading ? 'Updating…' : `Show ${total.toLocaleString()} lead${total === 1 ? '' : 's'}`}
          </Button>
        </footer>
      </aside>
    </>
  );
}

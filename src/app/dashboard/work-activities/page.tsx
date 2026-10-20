'use client';
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { ClipboardList, Clock, Download, Search, Store, Users, X } from 'lucide-react';
import api from '../../../lib/api';
import { useClient } from '../../../context/ClientContext';
import { useAuth } from '../../../hooks/useAuth';
import { isRajkamalActive } from '../../../lib/clientFeatures';
import { extractImageUrls } from '../../../lib/utils';
import { toast } from 'sonner';
import { csvStamp, fmtMinutes, fmtStamp, gpsText, sumMinutes, visitMinutes } from '../../../lib/visitTime';
import SignedImage, { openSignedUrl, resolveSignedUrl } from '../../../components/shared/SignedImage';
import { Badge, Button, Card, EmptyState, Eyebrow, IconButton, Input, PageHeader, Segmented, Select, T, labelStyle, useIsCompact } from '../../../components/ui';
import VisitCard from '../../../components/work-activities/VisitCard';
import { DEFAULT_PRESET, PRESET_LABELS, groupVisits, matchPreset, presetRange, storeName, type RangePreset } from '../../../lib/workActivities';
import dynamic from 'next/dynamic';

// Lazy-load the charts bundle (recharts) so it stays out of the main Work
// Activities bundle — only fetched when the demo account opens the Insights tab.
const FormInsights = dynamic(() => import('../../../components/work-activities/FormInsights'), {
  ssr: false,
  loading: () => <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-dim)' }}>Loading insights…</div>,
});

// Derive a sensible download filename from a stored object URL (last path
// segment with an extension), falling back to a generic name.
function fileNameFromUrl(url: string, fallback: string): string {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return base && /\.[a-z0-9]{2,5}$/i.test(base) ? base : fallback;
  } catch { return fallback; }
}

// Download a form image. The buckets are private, so first exchange the stored
// URL for a signed one, then fetch it as a blob and save via a temporary <a>.
// If the blob fetch fails (e.g. CORS), fall back to opening the signed URL in a
// new tab so the user can still save it manually.
async function downloadImage(storedUrl: string, filename: string): Promise<void> {
  try {
    const signed = await resolveSignedUrl(storedUrl);
    const res = await fetch(signed);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  } catch {
    try {
      const signed = await resolveSignedUrl(storedUrl);
      window.open(signed, '_blank', 'noopener');
    } catch { /* ignore — nothing more we can do */ }
  }
}

interface User { id: string; name: string; employee_id?: string; role: string; city_id?: string; }
interface City { id: string; name: string; }
interface Zone { id: string; name: string; city_id?: string; }

interface FormAnswer {
  question_id?: string;
  label: string;
  qtype: string;
  value: any;
  display?: string;
}

interface FormActivity {
  id: string;
  submitted_at: string;
  outlet_id?: string;
  outlet_name?: string;
  user_id: string;
  users?: { name: string; employee_id?: string; city_id?: string };
  activities?: { name: string };
  builder_forms?: { id: string; title: string };
  // Real check-in / check-out of this form (null when the rep did not record one) and the stored time spent.
  check_in_at?: string | null;
  check_out_at?: string | null;
  check_in_gps?: string | null;
  check_out_gps?: string | null;
  duration_minutes?: number | null;
  address?: string;
  latitude?: number;
  longitude?: number;
  // Builder-form submissions carry the position under these names instead.
  location_lat?: number;
  location_lng?: number;
  answers?: FormAnswer[];
  form_responses?: any[];
}

function fmtTime(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtDate(ts?: string | null) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderAnswerValue(
  answer: FormAnswer,
  onImageClick?: (urls: string[], index: number) => void
) {
  const { qtype, value, display } = answer;

  // Image/signature: always render visually — check qtype BEFORE display,
  // because the edge function sets display to the raw URL string which would
  // otherwise be returned as plain text.
  if (qtype === 'image' || qtype === 'signature' || qtype === 'photo' || qtype === 'camera') {
    // value may be a URL string, array of URLs, or object/array with .url field.
    // Also accept display as a URL fallback when value is missing.
    const src = value ?? display;
    const urls = extractImageUrls(src);
    if (urls.length === 0) return '—';
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
        {urls.map((url, i) => (
          <SignedImage
            key={i}
            src={url}
            alt={`${qtype} ${i + 1}`}
            style={{ height: '90px', width: '110px', borderRadius: '8px', objectFit: 'cover', cursor: 'pointer', border: '2px solid var(--border)', transition: 'transform 0.15s' }}
            onClick={() => onImageClick ? onImageClick(urls, i) : window.open(url, '_blank')}
            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.04)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ))}
      </div>
    );
  }

  if (display && display !== '—') return display;
  if (value === null || value === undefined || value === '') return '—';
  if (qtype === 'file') {
    const url = typeof value === 'string' ? value : (value?.url ?? null);
    return url ? <a href={url} onClick={(e) => openSignedUrl(e, url)} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontSize: '12px' }}>View File</a> : '—';
  }
  if (qtype === 'rating') return `${'★'.repeat(Number(value) || 0)}${'☆'.repeat(Math.max(0, 5 - (Number(value) || 0)))} (${value})`;
  if (qtype === 'checkbox' && Array.isArray(value)) return value.join(', ') || '—';
  if (qtype === 'yes_no' || qtype === 'consent') return value === true || value === 'true' || value === 'Yes' ? '✓ Yes' : '✗ No';
  if (qtype === 'location' && typeof value === 'object') return `${value.lat ?? value.latitude ?? ''},${value.lng ?? value.longitude ?? ''}`;
  if (qtype === 'section_header') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// Backend treats date_to as exclusive; bump it by one day so end-date submissions are included.
function dateToInclusive(iso: string): string {
  if (!iso) return iso;
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/* ── Small building blocks ─────────────────────────────────────── */
function SummaryTile({ icon, label, value, hint, testId }: { icon: ReactNode; label: string; value: string; hint?: string; testId: string }) {
  return (
    <div className="wa-tile" style={{ flex: '1 1 200px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.lg }}>
      <span aria-hidden style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: T.redWash, color: T.red }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <Eyebrow>{label}</Eyebrow>
        <div data-testid={testId} style={{ fontFamily: T.mono, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: T.text, lineHeight: 1.25 }}>{value}</div>
        {hint && <div style={{ fontSize: 11.5, color: T.mute, marginTop: 1 }}>{hint}</div>}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '0 4px 0 10px', borderRadius: T.radius.pill, background: T.raised, color: T.text, fontSize: 12.5, fontWeight: 500 }}>
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove filter: ${label}`} className="wa-x" style={{ width: 20, height: 20, borderRadius: 999, border: 0, background: 'transparent', color: T.dim, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
        <X size={13} aria-hidden />
      </button>
    </span>
  );
}

function InfoTile({ label, children, testId, mono }: { label: string; children: ReactNode; testId?: string; mono?: boolean }) {
  return (
    <div style={{ flex: '1 1 210px', minWidth: 0, padding: '12px 14px', background: T.canvas, border: `1px solid ${T.border}`, borderRadius: T.radius.lg }}>
      <Eyebrow>{label}</Eyebrow>
      <div data-testid={testId} style={{ marginTop: 4, fontSize: 13.5, fontWeight: 600, color: T.text, overflowWrap: 'anywhere', fontFamily: mono ? T.mono : 'inherit' }}>{children}</div>
    </div>
  );
}

/* ── Work Activities ───────────────────────────────────────────── */
export default function WorkActivitiesPage() {
  const { selectedClientId } = useClient();
  const { user } = useAuth();
  const compact = useIsCompact(900);
  // Rajkamal does its field work as GPS-only visits, not timed check-in/out
  // shifts, so the check-in/out stamps, time-spent and the separate
  // check-in/out GPS are noise for them — hide those and show only the captured
  // location (address + GPS). Honours the super-admin client picker.
  const hideVisitTracking = isRajkamalActive(user as never);
  // Insights tab is demo-only for now (served from client-side fixtures). Real
  // tenants keep the submissions-only view until the backend aggregation lands.
  const [tab, setTab] = useState<'submissions' | 'insights'>('submissions');
  const [isDemo, setIsDemo] = useState(false);
  useEffect(() => { setIsDemo(api.isDemoAccount()); }, []);
  // Starts true: the first request waits for the date range, which is set after mount (see below).
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FormActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  // Static Metadata
  const [users, setUsers] = useState<User[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // Filters — `search` is the debounced value that drives the request, `searchInput` what the box shows.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  // "Today" depends on the viewer's clock and time zone, so the range is filled in after mount: computing it while
  // rendering made the server HTML (UTC) and the browser (IST) disagree for hours every day (a hydration mismatch).
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  useEffect(() => { const r = presetRange(DEFAULT_PRESET); setDateFrom(r.from); setDateTo(r.to); }, []);
  const [activityFilter, setActivityFilter] = useState('');

  // UI State
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [detailedSub, setDetailedSub] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  // Initial Data
  useEffect(() => {
    const cid = selectedClientId || '';
    api.getUsers({ limit: '500', client_id: cid, scope: 'field_filter' }).then((r: any) => setUsers(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
    api.getCities({ limit: '200', client_id: cid }).then((r: any) => setCities(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
    api.getActivities({ client_id: cid }).then((r: any) => setActivities(Array.isArray(r) ? r : (r?.data || []))).catch(() => {});
  }, [selectedClientId]);

  // Typing in the search box must not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Main Load. Filters change quickly (presets, typing), so only the newest request may write the list.
  const reqId = useRef(0);
  const loadData = useCallback(async (p = 1) => {
    const mine = ++reqId.current;
    setLoading(true);
    try {
      const params: any = {
        page: String(p),
        limit: String(LIMIT),
        client_id: selectedClientId || 'Kinematic',
        date_from: dateFrom,
        date_to: dateToInclusive(dateTo),
        search,
        user_id: userFilter,
        city_id: cityFilter,
        activity_id: activityFilter
      };
      const res: any = await api.getAdminSubmissions(params);
      if (mine !== reqId.current) return;
      // Backend returns { success: true, data: { data: [], pagination: {} } }
      const rows = res?.data?.data || res?.data || res?.submissions || [];
      setData(Array.isArray(rows) ? rows : []);
      setTotal(res?.data?.pagination?.total || rows.length || 0);
      setPage(p);
      setExpandedKey(null);
    } catch {
      if (mine !== reqId.current) return;
      setData([]);
      setTotal(0);
    } finally {
      if (mine === reqId.current) setLoading(false);
    }
  }, [selectedClientId, dateFrom, dateTo, search, userFilter, cityFilter, activityFilter]);

  useEffect(() => { if (dateFrom && dateTo) loadData(1); }, [loadData, dateFrom, dateTo]);

  // One card per activity + store + rep + day; submissions with no store are split by the form filled in.
  const visits = useMemo(() => groupVisits(data), [data]);
  const sections = useMemo(() => {
    const out: Array<{ activity: string; visits: typeof visits; forms: number }> = [];
    for (const v of visits) {
      const last = out[out.length - 1];
      if (last && last.activity === v.activity) { last.visits.push(v); last.forms += v.items.length; }
      else out.push({ activity: v.activity, visits: [v], forms: v.items.length });
    }
    return out;
  }, [visits]);

  const stats = useMemo(() => {
    const spent = sumMinutes(data);
    return { reps: new Set(data.map((d) => d.user_id)).size, minutes: spent.total, timed: spent.counted };
  }, [data]);

  const preset = matchPreset(dateFrom, dateTo);
  const applyPreset = (p: RangePreset) => { const r = presetRange(p); setDateFrom(r.from); setDateTo(r.to); };
  const filtersActive = !!(search || searchInput || cityFilter || userFilter || activityFilter) || (!!dateFrom && preset !== DEFAULT_PRESET);
  const clearFilters = () => {
    setSearchInput(''); setSearch(''); setCityFilter(''); setUserFilter(''); setActivityFilter('');
    applyPreset(DEFAULT_PRESET);
  };
  const partial = !loading && total > data.length;

  const openDetail = async (f: FormActivity) => {
    // Open immediately with the list row so the modal is responsive; then fetch the joined detail (which the
    // backend builds with supabaseAdmin and includes the full form_responses array) and merge it in. The
    // Next.js enrichment path couldn't read form_responses via RLS because the dashboard's JWT isn't a
    // Supabase Auth token, so the modal always showed "No form responses recorded".
    setDetailedSub(f);
    try {
      const detail: any = await api.getSubmission(f.id);
      const merged = detail?.data ?? detail;
      if (merged && typeof merged === 'object') setDetailedSub({ ...f, ...merged });
    } catch { /* keep the list row */ }
  };

  // Escape closes the dialog (or the lightbox on top of it).
  useEffect(() => {
    if (!detailedSub && !lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null); else setDetailedSub(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailedSub, lightbox]);

  const downloadReport = async () => {
    if (!data.length) return;
    setReportLoading(true);
    try {
        const params: any = {
            client_id: selectedClientId || 'Kinematic',
            date_from: dateFrom,
            date_to: dateToInclusive(dateTo),
            search,
            user_id: userFilter,
            city_id: cityFilter,
            activity_id: activityFilter,
            include_responses: 'true',
            limit: '1000'
        };
        const res: any = await api.getAdminSubmissions(params);
        const fullData = res?.data?.data || res?.data || [];

        // Check-in / Check-out are the REAL stamps of each form (date + time), blank when the rep recorded none —
        // never the submission time. Time spent is whole minutes.
        const headers = ['Date', 'Client', 'Executive', 'Employee ID', 'Outlet', 'Activity', 'Address', 'Check In GPS', 'Check Out GPS', 'Check-in', 'Check-out', 'Time spent (min)', 'Responses'];

        const csvRows = fullData.map((f: any) => {
            const responsesStr = (f.form_responses || []).map((r: any) =>
                `${r.builder_questions?.label || 'Q'}: ${r.value_text || r.value_number || r.value_bool || '—'}`
            ).join(' | ');

            return [
                fmtDate(f.submitted_at),
                selectedClientId || 'Global',
                f.users?.name || 'Unknown',
                f.users?.employee_id || '-',
                f.outlet_name || '-',
                f.activities?.name || 'Form',
                f.address || '-',
                gpsText(f.check_in_gps, f.latitude ?? f.location_lat, f.longitude ?? f.location_lng) || '-',
                gpsText(f.check_out_gps) || '-',
                csvStamp(f.check_in_at),
                csvStamp(f.check_out_at),
                visitMinutes(f) ?? '',
                responsesStr
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
        });

        const csvContent = headers.join(',') + '\n' + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Kinematic_WorkActivities_${dateFrom}_to_${dateTo}.csv`;
        a.click();

        // The server caps one response, so a big window is exported in part: say so instead of looking complete.
        const matching = Number(res?.data?.pagination?.total) || 0;
        if (matching > fullData.length) {
          toast.message(`Exported the first ${fullData.length} of ${matching} records`, { description: 'Narrow the date range or filters to export the rest.' });
        }
    } catch (err) {
        console.error('Report Error:', err);
    } finally {
        setReportLoading(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const activeFilterChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (cityFilter) activeFilterChips.push({ key: 'city', label: `City: ${cities.find((c) => c.id === cityFilter)?.name || 'Selected'}`, clear: () => setCityFilter('') });
  if (userFilter) activeFilterChips.push({ key: 'user', label: `Executive: ${users.find((u) => u.id === userFilter)?.name || 'Selected'}`, clear: () => setUserFilter('') });
  if (activityFilter) activeFilterChips.push({ key: 'activity', label: `Activity: ${activities.find((a) => a.id === activityFilter)?.name || 'Selected'}`, clear: () => setActivityFilter('') });
  if (search) activeFilterChips.push({ key: 'search', label: `Store: ${search}`, clear: () => { setSearchInput(''); setSearch(''); } });

  return (
    <div style={{ padding: compact ? '20px 16px 48px' : '28px 32px 56px', minHeight: '100vh', background: T.canvas, color: T.text, display: 'flex', flexDirection: 'column', gap: 20 }}>

      <PageHeader
        compact
        eyebrow="Field force"
        title="Work Activities"
        description={tab === 'insights'
          ? 'Aggregate what field teams capture — preferred products, sentiment and objections from form responses.'
          : 'Every form your field team submits, grouped into visits — with time spent and where it happened.'}
        actions={tab === 'submissions' ? (
          <Button variant="primary" onClick={downloadReport} disabled={reportLoading || !data.length}>
            <Download size={15} aria-hidden /> {reportLoading ? 'Preparing Report…' : 'Download Report'}
          </Button>
        ) : undefined}
      />

      {/* Tab switcher — Insights is demo-only today */}
      {isDemo && (
        <Segmented
          value={tab}
          onChange={setTab}
          style={{ alignSelf: 'flex-start' }}
          options={[{ value: 'submissions', label: 'Submissions' }, { value: 'insights', label: 'Insights' }]}
        />
      )}

      {tab === 'insights' ? <FormInsights /> : (
      <>
      {/* At a glance */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <SummaryTile testId="wa-sum-submissions" icon={<ClipboardList size={19} />} label="Submissions" value={loading && !data.length ? '—' : String(total)} hint={partial ? `showing the latest ${data.length}` : 'in this window'} />
        <SummaryTile testId="wa-sum-visits" icon={<Store size={19} />} label="Visits" value={loading && !data.length ? '—' : String(visits.length)} hint="store or form, per rep per day" />
        <SummaryTile testId="wa-sum-reps" icon={<Users size={19} />} label="Field reps" value={loading && !data.length ? '—' : String(stats.reps)} hint="active in this window" />
        {!hideVisitTracking && (
          <SummaryTile testId="wa-sum-time" icon={<Clock size={19} />} label="Time on visits" value={loading && !data.length ? '—' : fmtMinutes(stats.minutes)} hint={stats.timed ? `${stats.timed} timed ${stats.timed === 1 ? 'form' : 'forms'}` : 'no check-in / out recorded'} />
        )}
      </div>

      {/* Filters */}
      <Card padding={compact ? 14 : 16} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div role="group" aria-label="Date range" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESET_LABELS.map((p) => {
              const on = preset === p.value;
              return (
                <button key={p.value} type="button" className="wa-preset" aria-pressed={on} onClick={() => applyPreset(p.value)} style={{
                  height: 30, padding: '0 12px', borderRadius: T.radius.pill, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${on ? T.text : T.border}`, background: on ? T.text : T.card, color: on ? T.canvas : T.dim,
                }}>{p.label}</button>
              );
            })}
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Input type="date" aria-label="From date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} style={{ width: 148 }} />
            <span style={{ color: T.mute, fontSize: 13 }}>to</span>
            <Input type="date" aria-label="To date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} style={{ width: 148 }} />
          </div>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={clearFilters} style={{ marginLeft: 'auto' }}>Reset filters</Button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {([
            ['City', cityFilter, setCityFilter, 'All cities', cities.map((c) => ({ id: c.id, name: c.name }))],
            ['Executive', userFilter, setUserFilter, 'All executives', users.filter((u: any) => u.role === 'executive' || u.role === 'field_executive' || u.org_role?.data_scope === 'own').map((u) => ({ id: u.id, name: u.name }))],
            ['Activity type', activityFilter, setActivityFilter, 'All activities', activities.map((a) => ({ id: a.id, name: a.name }))],
          ] as Array<[string, string, (v: string) => void, string, Array<{ id: string; name: string }>]>).map(([label, value, set, all, options]) => (
            <label key={label} style={{ flex: '1 1 170px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={labelStyle}>{label}</span>
              <Select aria-label={label} value={value} onChange={(e) => set(e.target.value)}>
                <option value="">{all}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </label>
          ))}
          <label style={{ flex: '2 1 240px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={labelStyle}>Search store</span>
            <span style={{ position: 'relative', display: 'block' }}>
              <Search size={15} aria-hidden style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.mute, pointerEvents: 'none' }} />
              <Input aria-label="Search store" placeholder="Store or outlet name" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} style={{ paddingLeft: 32 }} />
            </span>
          </label>
        </div>
      </Card>

      {/* Result line + applied filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 26 }}>
        <span style={{ fontSize: 13, color: T.dim }} aria-live="polite">
          {loading && !data.length ? 'Loading visits…' : (
            <><b style={{ color: T.text }}>{visits.length}</b> {visits.length === 1 ? 'visit' : 'visits'} · <b style={{ color: T.text }}>{data.length}</b> {data.length === 1 ? 'submission' : 'submissions'}
            {partial && <> (latest of {total} — page {page} of {pages})</>}
            {' '}· {dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`}</>
          )}
        </span>
        {activeFilterChips.map((c) => <FilterChip key={c.key} label={c.label} onClear={c.clear} />)}
      </div>

      {/* Visits, one section per activity */}
      <div style={{ opacity: loading && data.length ? 0.55 : 1, pointerEvents: loading && data.length ? 'none' : 'auto', transition: 'opacity .15s ease', display: 'flex', flexDirection: 'column', gap: 26 }} aria-busy={loading}>
        {loading && !data.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[0, 1, 2].map((i) => <div key={i} className="km-skel" style={{ height: 84, borderRadius: T.radius.lg }} />)}
          </div>
        ) : !visits.length ? (
          <Card padding={0}>
            <EmptyState
              icon={<ClipboardList size={20} />}
              title="No visits found"
              description={`No submissions match these filters for ${dateFrom === dateTo ? fmtDate(dateFrom) : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`}. Try a wider date range or clear the filters.`}
              action={<Button onClick={clearFilters}>Reset filters</Button>}
            />
          </Card>
        ) : sections.map((sec) => (
          <section key={sec.activity} aria-label={sec.activity} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ margin: 0, fontFamily: T.heading, fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.text }}>{sec.activity}</h2>
              <Badge mono>{sec.visits.length} {sec.visits.length === 1 ? 'visit' : 'visits'} · {sec.forms} {sec.forms === 1 ? 'form' : 'forms'}</Badge>
              <span style={{ flex: 1, height: 1, background: T.border }} />
            </div>
            {sec.visits.map((v) => (
              <VisitCard
                key={v.key}
                group={v}
                expanded={expandedKey === v.key}
                onToggle={() => setExpandedKey(expandedKey === v.key ? null : v.key)}
                onView={openDetail}
                hideVisitTracking={hideVisitTracking}
                compact={compact}
              />
            ))}
          </section>
        ))}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Button disabled={page === 1 || loading} onClick={() => loadData(page - 1)}>Previous</Button>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.dim }}>Page {page} of {pages}</span>
          <Button disabled={page >= pages || loading} onClick={() => loadData(page + 1)}>Next</Button>
        </div>
      )}
      </>
      )}

      {/* detail modal */}
      {detailedSub && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(8,10,16,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: compact ? 12 : 32 }} onClick={() => setDetailedSub(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="wa-detail-title" style={{ background: T.card, width: '100%', maxWidth: 820, maxHeight: '92vh', overflowY: 'auto', borderRadius: 16, border: `1px solid ${T.border}`, boxShadow: '0 24px 80px rgba(0,0,0,.35)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: compact ? '16px 16px 12px' : '20px 24px 14px', background: T.card, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ minWidth: 0 }}>
                <h2 id="wa-detail-title" style={{ margin: 0, fontFamily: T.heading, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em' }}>Submission Details</h2>
                <div style={{ marginTop: 3, fontSize: 13, color: T.dim, overflowWrap: 'anywhere' }}>
                  {detailedSub.builder_forms?.title || detailedSub.activities?.name || 'Form submission'} · {fmtDate(detailedSub.submitted_at)}, {fmtTime(detailedSub.submitted_at)}
                </div>
              </div>
              <IconButton label="Close" onClick={() => setDetailedSub(null)}><X size={18} aria-hidden /></IconButton>
            </div>

            <div style={{ padding: compact ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <InfoTile label="Executive">{detailedSub.users?.name || 'FE'}</InfoTile>
                <InfoTile label="Store">{storeName(detailedSub.outlet_name) || 'No store linked'}</InfoTile>
                <InfoTile label="Address">{detailedSub.address || 'GPS only'}</InfoTile>
                {!hideVisitTracking && (
                  <>
                    <InfoTile label="Check-in" testId="wa-modal-in" mono>{fmtStamp(detailedSub.check_in_at)}</InfoTile>
                    <InfoTile label="Check-out" testId="wa-modal-out" mono>{fmtStamp(detailedSub.check_out_at)}</InfoTile>
                    <InfoTile label="Time spent" testId="wa-modal-spent" mono>{fmtMinutes(visitMinutes(detailedSub))}</InfoTile>
                  </>
                )}
                <InfoTile label={hideVisitTracking ? 'GPS' : 'Check-in GPS'} mono>{gpsText(detailedSub.check_in_gps, detailedSub.latitude ?? detailedSub.location_lat, detailedSub.longitude ?? detailedSub.location_lng) || '—'}</InfoTile>
                {!hideVisitTracking && <InfoTile label="Check-out GPS" mono>{gpsText(detailedSub.check_out_gps) || '—'}</InfoTile>}
              </div>

              <div>
                <Eyebrow style={{ marginBottom: 10 }}>{detailedSub.builder_forms?.title ? `Form: ${detailedSub.builder_forms.title}` : 'Form responses'}</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(detailedSub.answers && detailedSub.answers.length > 0)
                    ? detailedSub.answers
                        .filter((a: FormAnswer) => a.qtype !== 'section_header')
                        .map((a: FormAnswer, idx: number) => {
                          const rendered = renderAnswerValue(a, (urls, i) => setLightbox({ urls, index: i }));
                          if (rendered === null) return null;
                          return (
                            <div key={idx} style={{ padding: '12px 14px', background: T.canvas, borderRadius: T.radius.lg, border: `1px solid ${T.border}` }}>
                              <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 4 }}>{a.label || 'Question'}</div>
                              <div style={{ fontWeight: 600, fontSize: 14.5, overflowWrap: 'anywhere' }}>{rendered}</div>
                            </div>
                          );
                        })
                    : (detailedSub.form_responses && detailedSub.form_responses.length > 0)
                    ? detailedSub.form_responses.map((r: any, idx: number) => {
                        // photo_url first so image/signature fields render their attachments —
                        // value_text is empty for those rows and the renderer needs a URL to
                        // hand to <img>. Without this branch every image field showed "—".
                        const fallbackValue = r.photo_url ?? r.value_text ?? r.value_number ?? r.value_bool ?? null;
                        const answer: FormAnswer = {
                          label: r.builder_questions?.label || 'Question',
                          qtype: r.builder_questions?.qtype || r.qtype || 'text',
                          value: fallbackValue,
                          display: (fallbackValue ?? '—').toString()
                        };
                        const rendered = renderAnswerValue(answer, (urls, i) => setLightbox({ urls, index: i }));
                        if (rendered === null) return null;
                        return (
                          <div key={idx} style={{ padding: '12px 14px', background: T.canvas, borderRadius: T.radius.lg, border: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 12.5, fontWeight: 500, color: T.dim, marginBottom: 4 }}>{answer.label}</div>
                            <div style={{ fontWeight: 600, fontSize: 14.5, overflowWrap: 'anywhere' }}>{rendered}</div>
                          </div>
                        );
                      })
                    : <div style={{ padding: 20, color: T.dim, fontSize: 13, textAlign: 'center' }}>No form responses recorded.</div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setLightbox(null)}
        >
          {/* Download the current image */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const u = lightbox.urls[lightbox.index];
              void downloadImage(u, fileNameFromUrl(u, `work-activity-image-${lightbox.index + 1}.jpg`));
            }}
            title="Download image"
            aria-label="Download image"
            style={{ position: 'absolute', top: '20px', right: '84px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '18px', cursor: 'pointer', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
          >⬇</button>

          {/* Close */}
          <button
            onClick={() => setLightbox(null)}
            aria-label="Close image"
            style={{ position: 'absolute', top: '20px', right: '28px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', borderRadius: '50%', width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
          >×</button>

          {/* Counter */}
          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', top: '24px', left: '50%', transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 600, letterSpacing: '1px' }}>
              {lightbox.index + 1} / {lightbox.urls.length}
            </div>
          )}

          {/* Prev */}
          {lightbox.urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index - 1 + lb.urls.length) % lb.urls.length } : null); }}
              aria-label="Previous image"
              style={{ position: 'absolute', left: '20px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >‹</button>
          )}

          {/* Image */}
          <SignedImage
            src={lightbox.urls[lightbox.index]}
            alt={`Image ${lightbox.index + 1}`}
            style={{ maxWidth: '90vw', maxHeight: '88vh', borderRadius: '12px', objectFit: 'contain', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          />

          {/* Next */}
          {lightbox.urls.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lb => lb ? { ...lb, index: (lb.index + 1) % lb.urls.length } : null); }}
              aria-label="Next image"
              style={{ position: 'absolute', right: '20px', background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: '28px', cursor: 'pointer', borderRadius: '50%', width: '52px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >›</button>
          )}

          {/* Thumbnail strip for multi-image */}
          {lightbox.urls.length > 1 && (
            <div style={{ position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '8px' }} onClick={e => e.stopPropagation()}>
              {lightbox.urls.map((url, i) => (
                <SignedImage
                  key={i}
                  src={url}
                  alt={`thumb ${i + 1}`}
                  onClick={() => setLightbox(lb => lb ? { ...lb, index: i } : null)}
                  style={{ width: '56px', height: '40px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: i === lightbox.index ? '2px solid #fff' : '2px solid rgba(255,255,255,0.25)', opacity: i === lightbox.index ? 1 : 0.55, transition: 'all 0.15s' }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

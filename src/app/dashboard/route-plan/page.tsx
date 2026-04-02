'use client';
import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';

/* ── COLOURS ─────────────────────────────────────────────── */
const C = {
  bg: 'var(--bg)', 
  s2: 'var(--s2)', 
  s3: 'var(--s3)', 
  s4: 'var(--s4)',
  border: 'var(--border)', 
  borderL: 'var(--borderL)',
  white: 'var(--text)', 
  gray: 'var(--textSec)', 
  grayd: 'var(--textTert)', 
  graydd: 'var(--border)',
  red: '#E01E2C',    
  redD: 'var(--redD)',    
  redB: 'rgba(224,30,44,0.2)',
  green: '#00D97E',  
  greenD: 'var(--greenD)',  
  greenB: 'rgba(0,217,126,0.2)',
  blue: '#3E9EFF',   
  blueD: 'var(--blueD)',  
  blueB: 'rgba(62,158,255,0.2)',
  yellow: '#FFB800', 
  yellowD: 'var(--yellowD)', 
  yellowB: 'rgba(255,184,0,0.2)',
  purple: '#9B6EFF', 
  purpleD: 'rgba(155,110,255,0.08)',
  teal: '#00C9B1',   
  tealD: 'rgba(0,201,177,0.08)',
  orange: '#FF7A30', 
  orangeD: 'rgba(255,122,48,0.08)',
};

/* ── ICON (pipe-separated paths, safe SVG) ─────────────────── */
const Icon = ({ d, s = 18, c = 'currentColor' }: { d: string; s?: number; c?: string }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c}
    strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {d.split('|').map((p, i) => <path key={i} d={p.trim()} />)}
  </svg>
);

const IC = {
  map:      'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z|M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  users:    'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 11a4 4 0 100-8 4 4 0 000 8z',
  check:    'M20 6L9 17l-5-5',
  store:    'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z|M9 22V12h6v10',
  target:   'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 18a6 6 0 100-12 6 6 0 000 12z|M12 14a2 2 0 100-4 2 2 0 000 4z',
  refresh:  'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  chevron:  'M19 9l-7 7-7-7',
  plus:     'M12 5v14|M5 12h14',
  x:        'M18 6L6 18|M6 6l12 12',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  clock:    'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 6v6l4 2',
  alert:    'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z|M12 9v4|M12 17h.01',
  upload:   'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4|M17 8l-5-5-5 5|M12 3v12',
  trash:    'M3 6h18|M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2',
  edit:     'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7|M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  pin:      'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z|M12 10a1 1 0 100-2 1 1 0 000 2z',
  phone:    'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z',
  info:     'M12 22a10 10 0 100-20 10 10 0 000 20z|M12 8h.01|M11 12h1v4h1',
  file:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8',
};

/* ── TYPES ─────────────────────────────────────────────────── */
type VisitStatus = 'pending'|'checked_in'|'completed'|'missed'|'skipped';
type PlanStatus  = 'pending'|'in_progress'|'completed'|'partial';

interface OutletStop {
  id: string; visit_order: number; target_type: string;
  target_notes?: string; target_value?: number;
  status: VisitStatus;
  checkin_at?: string; checkout_at?: string;
  photo_url?: string; order_amount?: number; visit_notes?: string;
  rejection_reason?: string;
  actual_duration_min?: number; planned_duration_min?: number;
  store_id: string; store_name: string; store_code?: string;
  store_address?: string; store_type?: string;
  store_lat?: number; store_lng?: number;
  store_phone?: string; store_owner?: string;
  zone_name?: string;
  checkin_distance_m?: number;
}

interface RoutePlan {
  id: string; user_id: string; plan_date: string;
  total_outlets: number; visited_outlets: number;
  missed_outlets: number; completion_pct: number;
  status: PlanStatus; notes?: string;
  frequency?: string; territory_label?: string;
  fe_name: string; fe_employee_id?: string; fe_mobile?: string;
  zone_name?: string; city_name?: string;
  outlets: OutletStop[];
}

interface Summary {
  total_fes: number; total_outlets: number; visited_outlets: number;
  missed_outlets: number; completed_plans: number; partial_plans: number;
  in_progress_plans: number; pending_plans: number; avg_completion: number;
}

interface Store { id: string; name: string; store_code?: string; address?: string; store_type?: string; }
interface FEUser { id: string; name: string; employee_id?: string; }
interface Activity { id: string; name: string; }

interface NewOutlet {
  store_id: string; target_type: string; target_notes: string;
  target_value: string; visit_order: number; planned_duration_min: string;
}

/* ── CONSTANTS ─────────────────────────────────────────────── */
const TARGET_TYPES: Record<string, string> = {
  order_collection:     'Order Collection',
  stock_check:          'Stock Check',
  merchandising:        'Merchandising',
  scheme_communication: 'Scheme Communication',
  data_collection:      'Data Collection',
  display_check:        'Display Check',
  general:              'General Visit',
};

const VISIT_STATUS: Record<VisitStatus, { color: string; label: string }> = {
  pending:    { color: C.gray,   label: 'Pending' },
  checked_in: { color: C.blue,   label: 'In Progress' },
  completed:  { color: C.green,  label: 'Completed' },
  missed:     { color: C.red,    label: 'Missed' },
  skipped:    { color: C.yellow, label: 'Skipped' },
};

const PLAN_STATUS: Record<PlanStatus, { color: string; label: string }> = {
  pending:     { color: C.gray,   label: 'Pending' },
  in_progress: { color: C.blue,   label: 'In Progress' },
  completed:   { color: C.green,  label: 'Completed' },
  partial:     { color: C.yellow, label: 'Partial' },
};

/* ── ATOMS ─────────────────────────────────────────────────── */
const Spinner = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80 }}>
    <div style={{ width: 28, height: 28, border: `3px solid ${C.graydd}`, borderTopColor: C.red, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
  </div>
);

const ProgressBar = ({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) => (
  <div style={{ height, background: C.graydd, borderRadius: height / 2, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color, borderRadius: height / 2, transition: 'width 0.6s ease' }} />
  </div>
);

const Badge = ({ label, color }: { label: string; color: string }) => (
  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}28`, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
    {label}
  </span>
);

function FESelector({ users, value, onChange }: { users: FEUser[], value: string, onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const selected = users.find(u => u.id === value);
  const filtered = users.filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.employee_id?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ position: 'relative' }}>
      <input 
        value={open ? search : (selected?.name || '')}
        onChange={e => setSearch(e.target.value)}
        onFocus={() => { setOpen(true); setSearch(''); }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search FE by name or ID…"
        style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: value || open ? C.white : C.grayd, fontSize: 13, outline: 'none' }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: C.s4, border: `1px solid ${C.borderL}`, borderRadius: 9, maxHeight: 180, overflowY: 'auto', zIndex: 50, marginTop: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 13px', fontSize: 12, color: C.gray }}>No FEs found</div>
          ) : filtered.map(u => (
            <div key={u.id} onMouseDown={(e) => { e.preventDefault(); onChange(u.id); setOpen(false); }}
              style={{ padding: '10px 13px', cursor: 'pointer', fontSize: 13, color: C.white, borderBottom: `1px solid ${C.border}`, background: value === u.id ? C.redD : 'transparent' }}>
              <span style={{ fontWeight: value === u.id ? 700 : 400 }}>{u.name}</span>
              {u.employee_id && <span style={{ color: C.gray, marginLeft: 6, fontSize: 11 }}>({u.employee_id})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── MAIN PAGE ─────────────────────────────────────────────── */
export default function RoutePlanPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <RoutePlanContent />
    </Suspense>
  );
}

function RoutePlanContent() {
  const todayStr = new Date().toISOString().split('T')[0];

  const [date, setDate]         = useState(todayStr);
  const [plans, setPlans]       = useState<RoutePlan[]>([]);
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PlanStatus>('all');
  const [zoneFilter, setZoneFilter]     = useState('all');
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = searchParams.get('tab') === 'mapping' ? 'mapping' : 'plans';
  const initialActivity = searchParams.get('activity_id') || '';

  const [tab, setTab]                   = useState<'plans' | 'mapping'>(initialTab);

  // Modal state
  const [modal, setModal]   = useState<'create' | 'import' | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state for create
  const [form, setForm] = useState({
    user_id: '', activity_ids: [] as string[], plan_date: todayStr, notes: '', frequency: 'daily', territory_label: '',
    outlets: [{ store_id: '', target_type: 'general', target_notes: '', target_value: '', visit_order: 1, planned_duration_min: '' }] as NewOutlet[],
  });

  // Import state
  const [importDate, setImportDate]   = useState(todayStr);
  const [importRows, setImportRows]   = useState<any[]>([]);
  const [importResult, setImportResult] = useState<any>(null);
  const [importing, setImporting]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Store/user lists for form
  const [stores, setStores] = useState<Store[]>([]);
  const [users,  setUsers]  = useState<FEUser[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityUsers, setActivityUsers] = useState<Record<string, string[]>>({}); // activityId -> [userIds]

  /* ── DATA FETCH ─────────────────────────────────────────── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, summRes] = await Promise.allSettled([
        api.get(`/api/v1/route-plans?date=${date}`) as Promise<any>,
        api.get(`/api/v1/route-plans/summary?date=${date}`) as Promise<any>,
      ]);

      if (plansRes.status === 'fulfilled') {
        const r = plansRes.value;
        setPlans(Array.isArray(r) ? r : (r?.data ?? []));
      } else {
        setError((plansRes.reason as any)?.message || 'Failed to load route plans');
      }

      if (summRes.status === 'fulfilled') {
        const r = summRes.value;
        setSummary(r?.data ?? r ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [date]);

  const fetchFormData = useCallback(async () => {
    const [storesRes, usersRes, actRes, mapsRes] = await Promise.allSettled([
      api.get('/api/v1/stores') as Promise<any>,
      api.get('/api/v1/users?limit=500') as Promise<any>,
      api.get('/api/v1/activities') as Promise<any>,
      api.get('/api/v1/activity-mappings') as Promise<any>,
    ]);
    if (storesRes.status === 'fulfilled') {
      const r = storesRes.value;
      setStores(Array.isArray(r) ? r : (r?.data ?? []));
    }
    if (usersRes.status === 'fulfilled') {
      const r = usersRes.value;
      const allUsers = Array.isArray(r) ? r : (r?.data ?? []);
      setUsers(allUsers.filter((u: any) => u.role === 'executive' || u.role === 'field_executive'));
    }
    if (actRes.status === 'fulfilled') {
      const r = actRes.value;
      const acts = Array.isArray(r) ? r : (r?.data ?? []);
      setActivities(acts);
    }
    if (mapsRes.status === 'fulfilled') {
      const r = mapsRes.value;
      const allMaps = Array.isArray(r) ? r : (r?.data ?? []);
      const grouped: Record<string, string[]> = {};
      allMaps.forEach((m: any) => {
        if (!grouped[m.activity_id]) grouped[m.activity_id] = [];
        grouped[m.activity_id].push(m.user_id);
      });
      setActivityUsers(grouped);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchFormData(); }, [fetchFormData]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'mapping') setTab('mapping');
    else if (t === 'plans') setTab('plans');
  }, [searchParams]);

  /* ── DERIVED ─────────────────────────────────────────────── */
  const zones = ['all', ...Array.from(new Set(plans.map(p => p.zone_name).filter(Boolean))) as string[]];

  const filtered = plans.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      (p.fe_name?.toLowerCase() || '').includes(q) ||
      (p.fe_employee_id?.toLowerCase() || '').includes(q) ||
      (p.territory_label?.toLowerCase() || '').includes(q);
    const matchStatus = statusFilter === 'all' || p.status === statusFilter;
    const matchZone   = zoneFilter === 'all' || p.zone_name === zoneFilter;
    return matchSearch && matchStatus && matchZone;
  });

  /* ── CREATE FORM HELPERS ────────────────────────────────── */
  const addOutlet = () => setForm(f => ({
    ...f,
    outlets: [...f.outlets, { store_id: '', target_type: 'general', target_notes: '', target_value: '', visit_order: f.outlets.length + 1, planned_duration_min: '' }],
  }));

  const removeOutlet = (i: number) => setForm(f => ({
    ...f,
    outlets: f.outlets.filter((_, idx) => idx !== i).map((o, idx) => ({ ...o, visit_order: idx + 1 })),
  }));

  const setOutlet = (i: number, k: string, v: string) =>
    setForm(f => ({ ...f, outlets: f.outlets.map((o, idx) => idx === i ? { ...o, [k]: v } : o) }));

  const resetForm = () => setForm({
    user_id: '', activity_ids: [], plan_date: todayStr, notes: '', frequency: 'daily', territory_label: '',
    outlets: [{ store_id: '', target_type: 'general', target_notes: '', target_value: '', visit_order: 1, planned_duration_min: '' }],
  });

  /* ── ACTIONS ─────────────────────────────────────────────── */
  const handleCreate = async () => {
    if (!form.user_id || !form.activity_ids.length || !form.plan_date) { setError('Select FE, Activities and Date'); return; }
    if (form.outlets.some(o => !o.store_id)) { setError('Select a store for every outlet stop'); return; }
    setCreating(true);
    setError(null);
    try {
      await api.post('/api/v1/route-plans', {
        user_id:        form.user_id,
        activity_ids:   form.activity_ids,
        plan_date:      form.plan_date,
        notes:          form.notes || null,
        frequency:      form.frequency,
        territory_label:form.territory_label || null,
        outlets: form.outlets.map(o => ({
          store_id:             o.store_id,
          target_type:          o.target_type,
          target_notes:         o.target_notes || null,
          target_value:         o.target_value ? parseFloat(o.target_value) : null,
          visit_order:          o.visit_order,
          planned_duration_min: o.planned_duration_min ? parseInt(o.planned_duration_min) : null,
        })),
      });
      setModal(null);
      resetForm();
      fetchData();
    } catch (e: any) {
      setError(e.message || 'Failed to create route plan');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, feName: string) => {
    if (!confirm(`Delete route plan for ${feName}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/v1/route-plans/${id}`);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    }
  };

  /* ── CSV PARSE ─────────────────────────────────────────── */
  const parseCSV = (text: string) => {
    const lines = text.trim().split("\n");
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/^#/, ""));
    return lines.slice(1)
      .filter(line => line.trim() && !line.trim().startsWith("#"))
      .map(line => {
        const vals = line.split(",");
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""); });
        return obj;
      })
      .filter(r => r.fe_employee_id || r.store_code);
  };

  const downloadTemplate = async () => {
    const [fesRes, storesRes] = await Promise.allSettled([
      api.get('/api/v1/users?limit=500') as Promise<any>,
      api.get('/api/v1/stores') as Promise<any>,
    ]);
    const allFes: any[]    = fesRes.status === 'fulfilled'    ? (Array.isArray(fesRes.value) ? fesRes.value : (fesRes.value?.data ?? [])) : [];
    const fes: any[]       = allFes.filter((u: any) => u.role === 'executive' || u.role === 'field_executive');
    const storeList: any[] = storesRes.status === 'fulfilled' ? (Array.isArray(storesRes.value) ? storesRes.value : (storesRes.value?.data ?? [])) : [];

    const lines: string[] = [
      'activity_name,fe_employee_id,store_code,target_type,target_notes,target_value,visit_order,planned_duration_min',
      '# ---- EXAMPLE ROWS (delete these before uploading) ----',
      `${activities[0]?.name ?? 'Sales'},${fes[0]?.employee_id ?? 'FE-001'},${storeList[0]?.store_code ?? 'ST-001'},order_collection,"Take full order",5000,1,30`,
      `${activities[0]?.name ?? 'Sales'},${fes[0]?.employee_id ?? 'FE-001'},${storeList[1]?.store_code ?? 'ST-002'},stock_check,,0,2,20`,
      `${activities[1]?.name || activities[0]?.name || 'Audit'},${fes[1]?.employee_id ?? 'FE-002'},${storeList[0]?.store_code ?? 'ST-001'},merchandising,"Display products",0,1,25`,
      '',
      '',
      '# ---- YOUR ACTIVITIES (activity_name column) ----',
      ...activities.map(a => `# ${a.name}`),
      '',
      '# ---- YOUR FIELD EXECUTIVES (fe_employee_id column) ----',
      ...fes.map((f: any) => `# ${f.employee_id ?? '(no ID)'}  →  ${f.name ?? ''}`),
      '',
      '# ---- YOUR STORES (store_code column) ----',
      ...(storeList.length > 0
        ? storeList.map((s: any) => `# ${s.store_code ?? '(no code)'}  →  ${s.name ?? ''} (${s.store_type ?? ''})`)
        : ['# No stores yet — add stores first in Other Management > Stores']),
      '',
      '# ---- VALID TARGET TYPES ----',
      '# order_collection | stock_check | merchandising | scheme_communication | data_collection | display_check | general',
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `route_plan_template_${importDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const rows = parseCSV(ev.target?.result as string);
        setImportRows(rows);
        setImportResult(null);
      } catch (_) {
        setError('Could not parse CSV. Ensure it uses comma separation with headers.');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importRows.length) return;
    setImporting(true);
    setError(null);
    try {
      const mappedRows = importRows.map((row: any) => ({
        ...row,
        activity_id: getActivityId(row.activity_name || '')
      }));

      const r = await api.post('/api/v1/route-plans/bulk-import', {
        plan_date: importDate,
        filename:  fileRef.current?.files?.[0]?.name || 'import.csv',
        rows:      mappedRows,
      }) as any;
      setImportResult(r?.data ?? r);
      fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const getActivityId = (name: string) => {
    const a = activities.find((act: Activity) => act.name.toLowerCase() === name.toLowerCase());
    return a?.id || '';
  };

  /* ── RENDER ─────────────────────────────────────────────── */
  if (loading) return <Spinner />;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* ── TABS ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 2, background: C.s2, padding: 4, borderRadius: 12, marginBottom: 24, width: 'fit-content', border: `1px solid ${C.border}` }}>
        <button onClick={() => setTab('plans')} style={{ padding: '8px 20px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: tab === 'plans' ? C.red : 'transparent', color: tab === 'plans' ? '#fff' : C.gray, transition: 'all 0.2s', fontFamily: "'Syne', sans-serif" }}>Route Plans</button>
        <button onClick={() => setTab('mapping')} style={{ padding: '8px 20px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: tab === 'mapping' ? C.red : 'transparent', color: tab === 'mapping' ? '#fff' : C.gray, transition: 'all 0.2s', fontFamily: "'Syne', sans-serif" }}>Activity-FE Mapping</button>
      </div>

      {tab === 'mapping' ? <MappingView users={users} activities={activities} mapping={activityUsers} onRefresh={fetchFormData} /> : (
      <>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, margin: 0, color: C.white }}>
            {tab === 'plans' ? 'Route Plan' : 'Activity-FE Mapping'}
          </h2>
          <p style={{ fontSize: 13, color: C.gray, marginTop: 4, marginBottom: 0 }}>
            {tab === 'plans' 
              ? 'Manage daily outlet assignments — track visits, targets and completion in real-time'
              : 'Assign Field Executives to specific activities to enable route planning.'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 12px', color: C.white, fontSize: 13, outline: 'none', cursor: 'pointer' }} />
          <button onClick={() => fetchData()}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon d={IC.refresh} s={15} c={C.gray} /> Refresh
          </button>
          <button onClick={() => { setModal('import'); setImportResult(null); setImportRows([]); }}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '9px 14px', color: C.white, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon d={IC.upload} s={15} c={C.blue} /> Bulk Import
          </button>
          <button onClick={() => { resetForm(); setModal('create'); }}
            style={{ background: C.red, border: 'none', borderRadius: 10, padding: '9px 18px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: "'Syne',sans-serif" }}>
            <Icon d={IC.plus} s={15} c="#fff" /> New Plan
          </button>
        </div>
      </div>

      {/* ── ERROR ──────────────────────────────────────────── */}
      {error && (
        <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon d={IC.alert} s={16} c={C.red} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.red, cursor: 'pointer', display: 'flex' }}>
            <Icon d={IC.x} s={14} c={C.red} />
          </button>
        </div>
      )}

      {/* ── SUMMARY CARDS ──────────────────────────────────── */}
      {summary && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 14 }}>
            {[
              { label: 'FEs Deployed',    value: summary.total_fes,        color: C.blue,   bg: C.blueD,   icon: IC.users  },
              { label: 'Total Outlets',   value: summary.total_outlets,    color: C.purple, bg: C.purpleD, icon: IC.store  },
              { label: 'Outlets Visited', value: summary.visited_outlets,  color: C.green,  bg: C.greenD,  icon: IC.check  },
              { label: 'Avg Completion',  value: `${summary.avg_completion}%`, color: C.yellow, bg: C.yellowD, icon: IC.target },
            ].map(s => (
              <div key={s.label} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon d={s.icon} s={20} c={s.color} />
                </div>
                <div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Status breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 24 }}>
            {[
              { label: 'Completed',   value: summary.completed_plans,   color: C.green  },
              { label: 'In Progress', value: summary.in_progress_plans, color: C.blue   },
              { label: 'Partial',     value: summary.partial_plans,     color: C.yellow },
              { label: 'Pending',     value: summary.pending_plans,     color: C.gray   },
            ].map(s => (
              <div key={s.label} style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: C.gray }}>{s.label}</div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── FILTERS ────────────────────────────────────────── */}
      <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input placeholder="Search FE name, ID or territory…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', color: C.white, fontSize: 13, outline: 'none' }} />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {(['all', 'pending', 'in_progress', 'partial', 'completed'] as const).map(f => (
            <button key={f} onClick={() => setStatusFilter(f as any)}
              style={{ padding: '7px 13px', borderRadius: 9, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: statusFilter === f ? C.red : C.s3, color: statusFilter === f ? '#fff' : C.gray, transition: 'all 0.15s' }}>
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        {zones.length > 1 && (
          <select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '8px 12px', color: C.white, fontSize: 12, outline: 'none', cursor: 'pointer' }}>
            {zones.map(z => <option key={z} value={z}>{z === 'all' ? 'All Zones' : z}</option>)}
          </select>
        )}
      </div>

      {/* ── PLAN LIST ──────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 64, textAlign: 'center' }}>
          <Icon d={IC.map} s={44} c={C.grayd} />
          <div style={{ fontSize: 16, color: C.grayd, marginTop: 16, fontWeight: 700, fontFamily: "'Syne',sans-serif" }}>
            {plans.length === 0 ? `No route plans for ${date}` : 'No plans match your filters'}
          </div>
          <div style={{ fontSize: 13, color: C.graydd, marginTop: 6 }}>
            {plans.length === 0 ? 'Create plans manually or use Bulk Import to upload via CSV' : 'Try adjusting your search or filter'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(plan => {
            const isExpanded = expanded === plan.id;
            const sm = PLAN_STATUS[plan.status] ?? PLAN_STATUS.pending;
            const initial = plan.fe_name?.[0]?.toUpperCase() ?? '?';
            const completedCount = plan.outlets.filter(o => o.status === 'completed').length;
            const missedCount    = plan.outlets.filter(o => o.status === 'missed').length;
            const inProgressCount = plan.outlets.filter(o => o.status === 'checked_in').length;

            return (
              <div key={plan.id} style={{ background: C.s2, border: `1px solid ${isExpanded ? C.borderL : C.border}`, borderRadius: 16, overflow: 'hidden', transition: 'border-color 0.2s' }}>

                {/* ── Plan header ── */}
                <div
                  style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', transition: 'background 0.15s' }}
                  onClick={() => setExpanded(isExpanded ? null : plan.id)}
                  onMouseEnter={e => (e.currentTarget.style.background = C.s3)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Avatar */}
                  <div style={{ width: 44, height: 44, borderRadius: 13, background: C.redD, border: `1px solid ${C.redB}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 18, color: C.red, flexShrink: 0 }}>
                    {initial}
                  </div>

                  {/* FE info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: C.white }}>{plan.fe_name}</div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {plan.fe_employee_id && <span>{plan.fe_employee_id}</span>}
                      {plan.zone_name && <span>· {plan.zone_name}</span>}
                      {plan.territory_label && <span>· {plan.territory_label}</span>}
                    </div>
                  </div>

                  {/* Progress */}
                  <div style={{ minWidth: 160 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.gray, marginBottom: 5 }}>
                      <span>{plan.visited_outlets}/{plan.total_outlets} outlets</span>
                      <span style={{ color: sm.color, fontWeight: 700 }}>{Math.round(Number(plan.completion_pct))}%</span>
                    </div>
                    <ProgressBar pct={Number(plan.completion_pct)} color={sm.color} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {completedCount > 0  && <span style={{ fontSize: 10, color: C.green  }}>✓ {completedCount} done</span>}
                      {inProgressCount > 0 && <span style={{ fontSize: 10, color: C.blue   }}>● {inProgressCount} active</span>}
                      {missedCount > 0     && <span style={{ fontSize: 10, color: C.red    }}>✗ {missedCount} missed</span>}
                    </div>
                  </div>

                  {/* Plan status badge */}
                  <Badge label={sm.label} color={sm.color} />

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 7, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleDelete(plan.id, plan.fe_name)}
                      style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 8, padding: '6px 9px', color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      title="Delete plan">
                      <Icon d={IC.trash} s={13} c={C.red} />
                    </button>
                  </div>

                  {/* Chevron */}
                  <div style={{ color: C.grayd, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                    <Icon d={IC.chevron} s={16} c={C.grayd} />
                  </div>
                </div>

                {/* ── Expanded outlets ── */}
                {isExpanded && (
                  <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg }}>
                    {/* Plan meta strip */}
                    <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      {plan.notes && <span style={{ fontSize: 12, color: C.gray, fontStyle: 'italic' }}>📝 {plan.notes}</span>}
                      {plan.frequency && plan.frequency !== 'daily' && <Badge label={plan.frequency} color={C.teal} />}
                      {plan.fe_mobile && (
                        <a href={`tel:${plan.fe_mobile}`} style={{ fontSize: 12, color: C.blue, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
                          <Icon d={IC.phone} s={12} c={C.blue} /> {plan.fe_mobile}
                        </a>
                      )}
                    </div>

                    {/* Outlet stops */}
                    <div style={{ padding: '16px 20px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.grayd, letterSpacing: '0.9px', textTransform: 'uppercase', marginBottom: 12 }}>
                        Outlet Visits ({plan.outlets.length})
                      </div>

                      {plan.outlets.length === 0 ? (
                        <div style={{ fontSize: 13, color: C.grayd }}>No outlets assigned</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {[...plan.outlets].sort((a, b) => a.visit_order - b.visit_order).map(outlet => {
                            const vm = VISIT_STATUS[outlet.status] ?? VISIT_STATUS.pending;
                            return (
                              <div key={outlet.id} style={{ background: C.s2, border: `1px solid ${outlet.status === 'completed' ? `${C.green}30` : outlet.status === 'missed' ? `${C.red}30` : C.border}`, borderRadius: 12, padding: '13px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                                  {/* Visit order */}
                                  <div style={{ width: 30, height: 30, borderRadius: 9, background: `${vm.color}15`, border: `1px solid ${vm.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, color: vm.color, flexShrink: 0 }}>
                                    {outlet.visit_order}
                                  </div>

                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Store name + code */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                                      <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, color: C.white }}>{outlet.store_name}</span>
                                      {outlet.store_code && <span style={{ fontSize: 11, color: C.grayd, background: C.s3, padding: '2px 7px', borderRadius: 5 }}>{outlet.store_code}</span>}
                                      {outlet.store_type && <span style={{ fontSize: 11, color: C.gray }}>{outlet.store_type}</span>}
                                    </div>

                                    {/* Address */}
                                    {outlet.store_address && (
                                      <div style={{ fontSize: 12, color: C.gray, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                                        <Icon d={IC.pin} s={11} c={C.gray} /> {outlet.store_address}
                                      </div>
                                    )}

                                    {/* Tags row */}
                                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: outlet.checkin_at || outlet.order_amount || outlet.visit_notes ? 8 : 0 }}>
                                      <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: C.blueD, color: C.blue }}>
                                        {TARGET_TYPES[outlet.target_type] || outlet.target_type}
                                      </span>
                                      {outlet.target_value != null && (
                                        <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: C.tealD, color: C.teal }}>
                                          Target ₹{Number(outlet.target_value).toLocaleString('en-IN')}
                                        </span>
                                      )}
                                      {outlet.order_amount != null && (
                                        <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: C.greenD, color: C.green }}>
                                          Order ₹{Number(outlet.order_amount).toLocaleString('en-IN')}
                                        </span>
                                      )}
                                      {outlet.planned_duration_min != null && (
                                        <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, color: C.gray, background: C.s3 }}>
                                          ~{outlet.planned_duration_min}min
                                        </span>
                                      )}
                                      {outlet.actual_duration_min != null && (
                                        <span style={{ padding: '2px 9px', borderRadius: 6, fontSize: 11, color: C.yellow, background: C.yellowD }}>
                                          Actual {outlet.actual_duration_min}min
                                        </span>
                                      )}
                                    </div>

                                    {/* Visit detail */}
                                    {outlet.target_notes && <div style={{ fontSize: 11, color: C.grayd, marginBottom: 4 }}>📋 {outlet.target_notes}</div>}
                                    {outlet.visit_notes  && <div style={{ fontSize: 11, color: C.gray,  marginBottom: 4 }}>💬 {outlet.visit_notes}</div>}
                                    {outlet.rejection_reason && <div style={{ fontSize: 11, color: C.red }}>⚠ {outlet.rejection_reason}</div>}

                                    {/* Timing */}
                                    {outlet.checkin_at && (
                                      <div style={{ fontSize: 11, color: C.gray, marginTop: 4, display: 'flex', gap: 10 }}>
                                        <span>
                                          <Icon d={IC.clock} s={11} c={C.gray} />
                                          {' '}In: {new Date(outlet.checkin_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {outlet.checkout_at && (
                                          <span>Out: {new Date(outlet.checkout_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                                        )}
                                        {outlet.checkin_distance_m != null && (
                                          <span style={{ color: outlet.checkin_distance_m > 100 ? C.yellow : C.green }}>
                                            {outlet.checkin_distance_m}m from store
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Store owner + phone */}
                                    {(outlet.store_owner || outlet.store_phone) && (
                                      <div style={{ fontSize: 11, color: C.grayd, marginTop: 4, display: 'flex', gap: 10 }}>
                                        {outlet.store_owner && <span>👤 {outlet.store_owner}</span>}
                                        {outlet.store_phone && (
                                          <a href={`tel:${outlet.store_phone}`} style={{ color: C.blue, textDecoration: 'none' }}>
                                            {outlet.store_phone}
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Status badge */}
                                  <Badge label={vm.label} color={vm.color} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* ══════════════════════════════════════════════════════
          CREATE PLAN MODAL
      ══════════════════════════════════════════════════════ */}
      {modal === 'create' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 20, width: '100%', maxWidth: 660, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: C.white }}>New Route Plan</div>
              <button onClick={() => setModal(null)} style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
                <Icon d={IC.x} s={16} c={C.gray} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

              {/* Error display inside modal */}
              {error && (
                <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon d={IC.alert} s={16} c={C.red} /> {error}
                  <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.red, cursor: 'pointer', display: 'flex' }}>
                    <Icon d={IC.x} s={14} c={C.red} />
                  </button>
                </div>
              )}

              {/* FE + Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Activities <span style={{ color: C.red }}>*</span></div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: 8, minHeight: 40 }}>
                    {activities.length === 0 && <div style={{ fontSize: 12, color: C.grayd, padding: 4 }}>No activities found</div>}
                    {activities.map(a => {
                      const isSel = form.activity_ids.includes(a.id);
                      return (
                        <div key={a.id} onClick={() => setForm(f => ({ ...f, activity_ids: isSel ? f.activity_ids.filter(id => id !== a.id) : [...f.activity_ids, a.id] }))}
                          style={{ padding: '6px 10px', background: isSel ? C.redD : 'transparent', border: `1px solid ${isSel ? C.red : C.borderL}`, borderRadius: 8, fontSize: 12, color: isSel ? C.red : C.gray, cursor: 'pointer', transition: 'all 0.2s', fontWeight: isSel ? 700 : 500 }}>
                          {a.name}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Field Executive <span style={{ color: C.red }}>*</span></div>
                  <FESelector users={users} value={form.user_id} onChange={id => setForm(f => ({ ...f, user_id: id }))} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Plan Date <span style={{ color: C.red }}>*</span></div>
                <input type="date" value={form.plan_date} onChange={e => setForm(f => ({ ...f, plan_date: e.target.value }))}
                  style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.white, fontSize: 13, outline: 'none' }} />
              </div>

              {/* Frequency + Territory */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Frequency</div>
                  <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                    style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.white, fontSize: 13, outline: 'none' }}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Territory Label</div>
                  <input value={form.territory_label} onChange={e => setForm(f => ({ ...f, territory_label: e.target.value }))} placeholder="e.g. North Zone Cluster A"
                    style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.white, fontSize: 13, outline: 'none' }} />
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Notes for FE</div>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional instructions…"
                  style={{ width: '100%', background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.white, fontSize: 13, outline: 'none' }} />
              </div>

              {/* Outlet stops */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                  Outlet Stops ({form.outlets.length})
                </div>
                <button onClick={addOutlet}
                  style={{ background: C.blueD, border: `1px solid ${C.blueB}`, borderRadius: 8, padding: '6px 13px', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon d={IC.plus} s={13} c={C.blue} /> Add Stop
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {form.outlets.map((outlet, idx) => (
                  <div key={idx} style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 12, fontWeight: 800, color: C.gray }}>Stop #{outlet.visit_order}</div>
                      {form.outlets.length > 1 && (
                        <button onClick={() => removeOutlet(idx)}
                          style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 7, padding: '4px 8px', cursor: 'pointer', display: 'flex' }}>
                          <Icon d={IC.x} s={12} c={C.red} />
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        { label: 'Store', key: 'store_id', type: 'store-select', required: true },
                        { label: 'Target Type', key: 'target_type', type: 'target-select' },
                        { label: 'Target Amount (₹)', key: 'target_value', type: 'number', placeholder: 'e.g. 5000' },
                        { label: 'Expected Duration (min)', key: 'planned_duration_min', type: 'number', placeholder: 'e.g. 30' },
                      ].map(field => (
                        <div key={field.key}>
                          <div style={{ fontSize: 11, color: C.gray, marginBottom: 5 }}>{field.label}{field.required && <span style={{ color: C.red }}> *</span>}</div>
                          {field.type === 'store-select' ? (
                            <select value={outlet.store_id} onChange={e => setOutlet(idx, 'store_id', e.target.value)}
                              style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 11px', color: outlet.store_id ? C.white : C.grayd, fontSize: 12, outline: 'none' }}>
                              <option value="">Select store…</option>
                              {stores.map(s => <option key={s.id} value={s.id}>{s.name}{s.store_code ? ` · ${s.store_code}` : ''}</option>)}
                            </select>
                          ) : field.type === 'target-select' ? (
                            <select value={outlet.target_type} onChange={e => setOutlet(idx, 'target_type', e.target.value)}
                              style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 11px', color: C.white, fontSize: 12, outline: 'none' }}>
                              {Object.entries(TARGET_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          ) : (
                            <input type="number" value={(outlet as any)[field.key]} onChange={e => setOutlet(idx, field.key, e.target.value)} placeholder={field.placeholder}
                              style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 11px', color: C.white, fontSize: 12, outline: 'none' }} />
                          )}
                        </div>
                      ))}
                      {/* Target notes spans full width */}
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 11, color: C.gray, marginBottom: 5 }}>Visit Instructions</div>
                        <input value={outlet.target_notes} onChange={e => setOutlet(idx, 'target_notes', e.target.value)} placeholder="e.g. Ensure product display on shelf 2"
                          style={{ width: '100%', background: C.s4, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 11px', color: C.white, fontSize: 12, outline: 'none' }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => { setModal(null); resetForm(); }}
                style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 20px', color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={creating}
                style={{ background: creating ? C.grayd : C.red, border: 'none', borderRadius: 10, padding: '10px 26px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Syne',sans-serif" }}>
                {creating
                  ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Creating…</>
                  : <><Icon d={IC.check} s={15} c="#fff" /> Create Plan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BULK IMPORT MODAL
      ══════════════════════════════════════════════════════ */}
      {modal === 'import' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 20, width: '100%', maxWidth: 580, maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: C.white }}>Bulk Import via CSV</div>
              <button onClick={() => setModal(null)} style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '6px 10px', cursor: 'pointer', display: 'flex' }}>
                <Icon d={IC.x} s={16} c={C.gray} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

              {/* Error display inside modal */}
              {error && !importResult && (
                <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: C.red, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon d={IC.alert} s={16} c={C.red} /> {error}
                  <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.red, cursor: 'pointer', display: 'flex' }}>
                    <Icon d={IC.x} s={14} c={C.red} />
                  </button>
                </div>
              )}

              {/* Date */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Plan Date</div>
                <input type="date" value={importDate} onChange={e => setImportDate(e.target.value)}
                  style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.white, fontSize: 13, outline: 'none' }} />
              </div>

              {/* CSV format guide */}
              <div style={{ background: C.blueD, border: `1px solid ${C.blueB}`, borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.blue, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Icon d={IC.info} s={14} c={C.blue} /> Required CSV Format
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: C.gray, lineHeight: 1.7 }}>
                  fe_employee_id, store_code, activity_name, target_type, target_notes, target_value, visit_order<br />
                  FE-001, ST-101, Merchandising, order_collection, &quot;Take full order&quot;, 5000, 1<br />
                  FE-001, ST-102, Stock Check, stock_check, , , 2<br />
                  FE-002, ST-201, Merchandising, merchandising, &quot;Shelf display&quot;, , 1
                </div>
              </div>

              {/* Download template */}
              <div style={{ background: C.greenD, border: `1px solid ${C.greenB}`, borderRadius: 12, padding: '14px 16px', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 3 }}>📥 Download Template</div>
                  <div style={{ fontSize: 12, color: C.gray }}>Pre-filled CSV with your live FE IDs and store codes</div>
                </div>
                <button onClick={downloadTemplate}
                  style={{ background: C.green, border: 'none', borderRadius: 9, padding: '9px 18px', color: C.bg, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'Syne',sans-serif", flexShrink: 0 }}>
                  ↓ Download CSV
                </button>
              </div>

              {/* File input */}
              <div>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 7 }}>Upload CSV File</div>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFileSelect}
                  style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '10px 13px', color: C.white, fontSize: 13, width: '100%', cursor: 'pointer' }} />
              </div>

              {/* Preview */}
              {importRows.length > 0 && !importResult && (
                <div style={{ marginTop: 16, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 12, color: C.gray, marginBottom: 8 }}>Preview — {importRows.length} rows</div>
                  <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                    {importRows.slice(0, 8).map((row, i) => (
                      <div key={i} style={{ fontSize: 11, color: C.gray, padding: '4px 0', borderBottom: i < 7 ? `1px solid ${C.border}` : 'none', display: 'flex', gap: 10 }}>
                        <span style={{ color: C.white, minWidth: 60 }}>{row.fe_employee_id}</span>
                        <span style={{ color: C.blue, minWidth: 60 }}>{row.store_code}</span>
                        <span>{row.target_type || 'general'}</span>
                        {row.target_value && <span style={{ color: C.green }}>₹{row.target_value}</span>}
                      </div>
                    ))}
                    {importRows.length > 8 && <div style={{ fontSize: 11, color: C.grayd, paddingTop: 6 }}>+{importRows.length - 8} more rows</div>}
                  </div>
                </div>
              )}

              {/* Import result */}
              {importResult && (
                <div style={{ marginTop: 16, background: importResult.failed === 0 ? C.greenD : C.yellowD, border: `1px solid ${importResult.failed === 0 ? C.greenB : C.yellowB}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: importResult.failed === 0 ? C.green : C.yellow, marginBottom: 10 }}>
                    {importResult.failed === 0 ? '✓ Import Complete' : '⚠ Import Partial'}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
                    {[
                      { label: 'Total',   value: importResult.total,   color: C.white  },
                      { label: 'Success', value: importResult.success, color: C.green  },
                      { label: 'Failed',  value: importResult.failed,  color: C.red    },
                    ].map(s => (
                      <div key={s.label} style={{ background: C.s3, borderRadius: 9, padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 11, color: C.gray }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {importResult.errors?.length > 0 && (
                    <div style={{ fontSize: 11, color: C.red }}>
                      {importResult.errors.slice(0, 5).map((e: any, i: number) => (
                        <div key={i} style={{ marginBottom: 2 }}>Row {e.row}: {e.error}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setModal(null)}
                style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 20px', color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Close
              </button>
              {!importResult && (
                <button onClick={handleImport} disabled={importing || importRows.length === 0}
                  style={{ background: importing || importRows.length === 0 ? C.grayd : C.blue, border: 'none', borderRadius: 10, padding: '10px 24px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: importing || importRows.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: "'Syne',sans-serif" }}>
                  {importing
                    ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Importing…</>
                    : <><Icon d={IC.upload} s={15} c="#fff" /> Import {importRows.length} rows</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingView({ users, activities, mapping, onRefresh }: { users: FEUser[], activities: Activity[], mapping: Record<string, string[]>, onRefresh: () => void }) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<string>(searchParams.get('activity_id') || '');
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    const aid = searchParams.get('activity_id');
    if (aid) setSelectedActivity(aid);
  }, [searchParams]);

  const toggleMap = async (userId: string, active: boolean) => {
    if (!selectedActivity) return;
    setLoading(true);
    try {
      const current = mapping[selectedActivity] ?? [];
      const user_ids = active
        ? [...current.filter(id => id !== userId), userId]
        : current.filter(id => id !== userId);
      await api.post('/api/v1/activity-mappings', {
        activity_id: selectedActivity,
        user_ids,
      });
      onRefresh();
    } catch (e: any) {
      alert(e.message || 'Failed to update mapping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, margin: 0, color: C.white }}>Activity-FE Mapping</h3>
          <p style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>Assign Field Executives to specific activities to enable route planning.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={() => setShowBulk(true)}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon d={IC.upload} s={14} c={C.blue} /> Bulk Assign
          </button>
          <select 
            value={selectedActivity} 
            onChange={e => setSelectedActivity(e.target.value)}
            style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px', color: C.white, fontSize: 13, outline: 'none', minWidth: 200 }}
          >
            <option value="">Select Activity to Map…</option>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      {showBulk && (
        <MappingBulkUpload 
          onClose={() => setShowBulk(false)} 
          onRefresh={onRefresh} 
          users={users} 
          activities={activities} 
          mapping={mapping} 
        />
      )}

      {!selectedActivity ? (
        <div style={{ padding: 60, textAlign: 'center', background: C.s3, borderRadius: 12, border: `1px dashed ${C.border}` }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 14, color: C.gray, fontWeight: 700 }}>Select an activity above to view and manage FE assignments.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {users.map((u: FEUser) => {
            const isMapped = mapping[selectedActivity]?.includes(u.id);
            return (
              <div 
                key={u.id} 
                onClick={() => !loading && toggleMap(u.id, !isMapped)}
                style={{ 
                  background: isMapped ? C.blueD : C.s3, 
                  border: `1.5px solid ${isMapped ? C.blue : C.border}`, 
                  borderRadius: 12, padding: '12px 16px', cursor: loading ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.15s'
                }}
              >
                <div style={{ 
                  width: 18, height: 18, borderRadius: 4, 
                  border: `2px solid ${isMapped ? C.blue : C.grayd}`,
                  background: isMapped ? C.blue : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  {isMapped && <div style={{ width: 8, height: 8, background: '#fff', borderRadius: 1 }} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isMapped ? C.white : C.gray }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: C.grayd }}>{u.employee_id || 'No ID'}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MappingBulkUpload({ onClose, onRefresh, users, activities, mapping }: { onClose: () => void, onRefresh: () => void, users: FEUser[], activities: Activity[], mapping: Record<string, string[]> }) {
  const [rows, setRows]     = useState<any[]>([]);
  const [err, setErr]       = useState<string|null>(null);
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const lines = [
      'activity_name,fe_employee_id',
      '# Example:',
      `${activities[0]?.name || 'Sales'},${users[0]?.employee_id || 'FE-001'}`,
      `${activities[0]?.name || 'Sales'},${users[1]?.employee_id || 'FE-002'}`,
      `${activities[1]?.name || 'Audit'},${users[0]?.employee_id || 'FE-001'}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'activity_mapping_template.csv'; a.click();
  };

  const onFile = (e: any) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const text = ev.target?.result as string;
        const lines = text.trim().split("\n");
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        const data = lines.slice(1).filter(l => l.trim() && !l.trim().startsWith("#")).map(l => {
          const vals = l.split(",");
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""); });
          return obj;
        });
        setRows(data); setErr(null);
      } catch { setErr('Failed to parse CSV'); }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setBusy(true); setErr(null);
    try {
      const grouped: Record<string, Set<string>> = {};
      
      // Group by activity_id
      rows.forEach(r => {
        const activity = activities.find(a => a.name.toLowerCase() === (r.activity_name || '').toLowerCase());
        const user = users.find(u => u.employee_id === r.fe_employee_id);
        if (activity && user) {
          if (!grouped[activity.id]) grouped[activity.id] = new Set(mapping[activity.id] || []);
          grouped[activity.id].add(user.id);
        }
      });

      // Send requests
      for (const aid of Object.keys(grouped)) {
        await api.post('/api/v1/activity-mappings', {
          activity_id: aid,
          user_ids: Array.from(grouped[aid]),
        });
      }
      setDone(true);
      setTimeout(() => { onRefresh(); onClose(); }, 1500);
    } catch (e: any) {
      setErr(e.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, backdropFilter: 'blur(5px)' };
  const mbox: React.CSSProperties = { background: C.s2, border: `1px solid ${C.borderL}`, borderRadius: 20, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 24px 64px rgba(0,0,0,0.7)', color: C.white };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={mbox}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, margin: 0 }}>Bulk Activity Mapping</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.gray, fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {err && <div style={{ background: C.redD, border: `1px solid ${C.redB}`, color: C.red, padding: '10px 14px', borderRadius: 9, fontSize: 13, marginBottom: 16 }}>{err}</div>}
        {done && <div style={{ background: C.greenD, border: `1px solid ${C.greenB}`, color: C.green, padding: '10px 14px', borderRadius: 9, fontSize: 13, marginBottom: 16 }}>✓ Bulk mapping completed!</div>}

        {!rows.length ? (
          <div style={{ border: `2px dashed ${C.border}`, borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>Upload a CSV with <b>activity_name</b> and <b>fe_employee_id</b> columns.</div>
            <input type="file" accept=".csv" onChange={onFile} style={{ display: 'none' }} id="bulk-map-file" />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <label htmlFor="bulk-map-file" style={{ background: C.red, color: '#fff', padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Choose CSV</label>
              <button onClick={downloadTemplate} style={{ background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Template</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ background: C.s3, padding: 14, borderRadius: 12, marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: C.white, fontWeight: 700 }}>{rows.length} rows detected</div>
              <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>Example: {rows[0].activity_name} → {rows[0].fe_employee_id}</div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRows([])} style={{ flex: 1, background: C.s3, border: `1px solid ${C.border}`, color: C.gray, padding: '11px', borderRadius: 11, fontSize: 13, fontWeight: 600 }}>Reset</button>
              <button onClick={handleImport} disabled={busy || done} 
                style={{ flex: 1, background: C.blue, color: '#fff', border: 'none', padding: '11px', borderRadius: 11, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1 }}>
                {busy ? <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : 'Apply Mapping'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

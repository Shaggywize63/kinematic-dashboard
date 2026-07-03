'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import api from '../../../../../lib/api';
import { rolesApi, type OrgRole } from '../../../../../lib/rolesApi';

// CRM-scoped user management. Module permissions live on the role hierarchy
// (org_roles.permissions / .permissions_write) — not redefined per-user — so
// this form just picks a Hierarchy Role and the user inherits that role's
// access. The legacy preset role (sub_admin / city_manager / etc.) used to
// drive route-tier RBAC; we still need to send something the backend
// requireRole() middleware accepts, so every CRM-created user is stamped as
// 'sub_admin' under the hood. Tier checks fall through to the hierarchy.
const DEFAULT_PRESET_ROLE = 'sub_admin';

// Password policy mirrored from backend `validatePassword` in
// src/middleware/security.ts (commit 508ff5b). Keep the bulk template and
// client-side checks in sync with the server so users don't have to
// round-trip a rejected POST to find out their CSV is invalid:
//   - minimum 10 characters
//   - not in the COMMON_PASSWORDS denylist (changeme123, password, qwerty…)
//   - no obvious sequences (123456, abcdef, qwerty rows)
//   - no 4+ identical characters in a row (aaaa, 1111)
const PASSWORD_POLICY_HINT =
  'Passwords must be ≥10 characters, not common (no "password", "qwerty", "admin"…), and contain no obvious sequences ("123456", "abcdef") or 4+ repeated chars in a row.';

interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  role: string | null;
  org_role_id?: string | null;
  client_id?: string | null;
  is_active?: boolean;
  permissions?: string[] | null;
  // Backend (getUsers in misc.controller.ts) returns BOTH the id list
  // (used by the edit form) and the resolved name list (used by the
  // table column). Older responses without the join still work — the
  // table column falls back to "—".
  assigned_cities?: string[] | null;
  assigned_city_names?: string[] | null;
  // KINI AI usage — backend (getUsers) joins kini_usage for the current
  // month and stamps these two fields. `kini_used_this_month` is summed
  // across platforms; `kini_monthly_cap` is the env/policy cap (default
  // 20). Both are optional so older API responses don't break the column.
  kini_used_this_month?: number | null;
  kini_monthly_cap?: number | null;
}

// Shape returned by /api/v1/cities. Backend management.controller.ts
// already scopes by tenant (cd57c3f), so this list reflects the currently
// picked client.
interface CityRow { id: string; name: string }

// Tiny CSV parser — purpose-built. Splits on newlines (LF or CRLF),
// fields on commas, supports double-quoted fields with embedded commas
// and escaped quotes. Sufficient for the simple template we ship.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQ = false; continue; }
      cur += c;
    } else {
      if (c === '"') { inQ = true; continue; }
      if (c === ',') { row.push(cur); cur = ''; continue; }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if (row.some((v) => v.trim() !== '')) rows.push(row);
        row = [];
        continue;
      }
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((v) => v.trim() !== '')) rows.push(row); }
  return rows;
}

// Strip non-digits, spaces, and the +91 country code from mobile values
// pulled from CSV. Backend requires exactly 10 digits — a row with
// "+91 98123 45601" or "98123-45601" would otherwise be rejected as
// invalid even though the digits are fine.
function sanitiseMobile(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  // Drop a leading 91 if the resulting number is 12 digits (Indian
  // country code + 10-digit mobile). Don't strip otherwise — we don't
  // want to accidentally cut off the first 2 digits of a valid number.
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

// Sample passwords below comply with the backend policy (10+ chars, not in
// COMMON_PASSWORDS, no sequences, no 4+ repeats). DO NOT replace with
// short/common values — every row in the template would be rejected.
const TEMPLATE_HEADER = 'name,mobile,email,hierarchy_role,password';
const TEMPLATE_SAMPLE = `${TEMPLATE_HEADER}
Rahul Sharma,9812345601,rahul@example.com,Regional Sales Lead,Welcome@2026!
Priya Iyer,9812345602,,Field Manager,KinematicCrm9!`;

// Field definitions for the bulk-upload column matcher. Order matters —
// rendered top-down in the mapping UI. `synonyms` powers auto-detect so
// admins rarely have to map by hand. Keep entries lowercase / no spaces.
type FieldKey = 'name' | 'mobile' | 'email' | 'hierarchy_role' | 'password';
interface FieldDef { key: FieldKey; label: string; required: boolean; synonyms: string[]; hint?: string }
const BULK_FIELDS: FieldDef[] = [
  { key: 'name',     label: 'Full Name',      required: true,
    synonyms: ['name', 'full_name', 'fullname', 'employee_name', 'contact_name', 'username', 'user_name'] },
  { key: 'mobile',   label: 'Mobile',         required: true,
    synonyms: ['mobile', 'phone', 'mobile_number', 'phone_number', 'contact_number', 'contact', 'mob', 'cell', 'cellphone', 'whatsapp'],
    hint: 'Will be auto-sanitised: +91, spaces and dashes are stripped.' },
  { key: 'email',    label: 'Email',          required: false,
    synonyms: ['email', 'email_address', 'mail', 'e_mail', 'emailid', 'email_id'],
    hint: 'Auto-generated from mobile if missing.' },
  { key: 'hierarchy_role', label: 'Hierarchy Role', required: false,
    synonyms: ['hierarchy_role', 'role', 'designation', 'position', 'title', 'job_title', 'level'],
    hint: 'Matches a Role Hierarchy name (e.g. "Field Manager"). Case-insensitive.' },
  { key: 'password', label: 'Password',       required: true,
    synonyms: ['password', 'pwd', 'pass', 'login_password'],
    hint: 'Must satisfy the policy below. Leave blank to auto-generate per row.' },
];

// Normalise a CSV header cell for synonym matching. Lower, trim, then
// collapse any non-alphanumerics so "Full Name", "Full-Name", "Full_Name"
// all match the same synonym.
function normaliseHeader(s: string): string {
  return (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Auto-detect the best CSV column for each required/optional field. Returns
// a column-index map; -1 means "no match found" → admin must pick manually.
function autoMapHeader(header: string[]): Record<FieldKey, number> {
  const normalised = header.map(normaliseHeader);
  const out: Record<FieldKey, number> = { name: -1, mobile: -1, email: -1, hierarchy_role: -1, password: -1 };
  for (const f of BULK_FIELDS) {
    const idx = normalised.findIndex((h) => f.synonyms.includes(h));
    out[f.key] = idx;
  }
  return out;
}

// Helper: lift the picker's client id from localStorage. Used as a query
// param fallback if a proxy ever strips the X-Client-Id header.
function pickedClientId(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem('kinematic_selected_client'); } catch { return null; }
}

export default function CrmUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [cities, setCities] = useState<CityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: Array<{ name: string; error: string }> } | null>(null);
  // Bulk-upload column-matcher state — the file flows through three stages:
  //   pick → map → import. Stored separately so the user can adjust column
  //   mapping without re-uploading, and so errors don't blow away progress.
  const [bulkHeader, setBulkHeader] = useState<string[] | null>(null);
  const [bulkRows, setBulkRows] = useState<string[][] | null>(null);
  const [bulkFileName, setBulkFileName] = useState<string>('');
  const [bulkMap, setBulkMap] = useState<Record<FieldKey, number>>({ name: -1, mobile: -1, email: -1, hierarchy_role: -1, password: -1 });
  const fileRef = useRef<HTMLInputElement>(null);
  // Scrolled-into-view when the edit/create panel opens so the admin sees
  // the form fields rather than landing somewhere mid-page (especially
  // common when the table is long and the Edit click happens far below
  // the panel).
  const formRef = useRef<HTMLDivElement>(null);

  const blank = {
    name: '', email: '', mobile: '',
    org_role_id: '' as string,
    password: '',
    assigned_cities: [] as string[],
  };
  const [form, setForm] = useState(blank);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      // Pin the request to the picker's client_id as a query param in
      // addition to the X-Client-Id header that api.ts already attaches.
      // Defense in depth — if a proxy strips custom headers, the explicit
      // ?client_id= still scopes the result to the active tenant on the
      // backend. Mirrors the localStorage key used by api.ts.
      const sel = pickedClientId();
      const suffix = sel ? `&client_id=${encodeURIComponent(sel)}` : '';
      const usersPath  = `/api/v1/users?limit=500${suffix}`;
      // `own_only=true` excludes the 868 global India seed rows so the
      // assignment picker shows only cities the tenant has explicitly added
      // — admins scope team members to their own beat, not all of India.
      // (Backend management.controller.ts honours this flag; default is
      // shared+own, which still powers Other Management → Cities.)
      const citiesPath = `/api/v1/cities?limit=500&own_only=true${suffix}`;

      const [u, r, c] = await Promise.allSettled([
        api.get<any>(usersPath),
        rolesApi.list(),
        api.get<any>(citiesPath),
      ]);
      if (u.status === 'fulfilled') {
        const list = (u.value.data?.data || u.value.data?.users || u.value.data || []) as UserRow[];
        setUsers(Array.isArray(list) ? list : []);
      }
      if (r.status === 'fulfilled') setRoles(((r.value as any) ?? []) as OrgRole[]);
      if (c.status === 'fulfilled') {
        // Cities controller returns { data: [...] }; accept either wrapped
        // or bare arrays so this survives the inevitable response shape
        // drift.
        const raw = (c.value as any)?.data ?? c.value ?? [];
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
        setCities(list.filter((x: any) => x?.id && x?.name) as CityRow[]);
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to load users');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // When the edit/create panel opens, scroll it into view so the admin
  // doesn't have to chase the form up the page. Smooth scroll, top-aligned
  // with a small offset so the panel header stays clear of any sticky nav.
  useEffect(() => {
    if (!showAdd) return;
    const id = window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50); // brief delay so the panel is in the DOM before we measure
    return () => window.clearTimeout(id);
  }, [showAdd, editId]);

  const filtered = users.filter((u) => {
    const active = u.is_active !== false;
    if (statusFilter === 'active' && !active) return false;
    if (statusFilter === 'inactive' && active) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [u.name, u.email, u.mobile].some((v) => (v || '').toLowerCase().includes(q));
  });

  const startCreate = () => { setEditId(null); setForm(blank); setShowAdd(true); };
  const startEdit = (u: UserRow) => {
    setEditId(u.id);
    setForm({
      name: u.name || '',
      email: u.email || '',
      mobile: u.mobile || '',
      org_role_id: u.org_role_id || '',
      password: '',
      // Backend may return either an array of UUIDs (preferred) or an
      // array of city assignment objects {city_id}; coerce defensively.
      assigned_cities: Array.isArray(u.assigned_cities)
        ? (u.assigned_cities as any[]).map((x) => typeof x === 'string' ? x : x?.city_id).filter(Boolean) as string[]
        : [],
    });
    setShowAdd(true);
  };

  // Look up the picked hierarchy role's permissions so the user inherits its
  // module access without the form having to redefine it. Falls back to an
  // empty list if no hierarchy role is picked — the preset role still drives
  // route-level RBAC via canAccess().
  const permissionsForRole = (orgRoleId: string): string[] => {
    if (!orgRoleId) return [];
    const r = roles.find((x) => x.id === orgRoleId);
    return r?.permissions ?? [];
  };

  const toggleCity = (id: string) => {
    setForm((f) => ({
      ...f,
      assigned_cities: f.assigned_cities.includes(id)
        ? f.assigned_cities.filter((x) => x !== id)
        : [...f.assigned_cities, id],
    }));
  };

  const save = async () => {
    if (!form.name.trim() || !form.mobile.trim()) {
      toast.error('Name and mobile are required'); return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        email: form.email || `${form.mobile.trim()}@kinematic.app`,
        // Always stamp the default preset role so backend route-tier RBAC
        // (requireRole, canAccess) keeps working. Real access comes from
        // the hierarchy role's permissions, copied below.
        role: DEFAULT_PRESET_ROLE,
        mobile: form.mobile.trim(),
        permissions: permissionsForRole(form.org_role_id),
        org_role_id: form.org_role_id || null,
        // Backend createUser/updateUser writes these to user_city_assignments;
        // empty array clears any existing assignments on update.
        assigned_cities: form.assigned_cities,
        is_active: true,
      };
      if (editId) {
        if (form.password) payload.app_password = form.password;
        await api.patch(`/api/v1/users/${editId}`, payload);
        toast.success('User updated');
      } else {
        if (form.password) payload.password = form.password;
        await api.post('/api/v1/users', payload);
        toast.success('User created');
      }
      setShowAdd(false); setEditId(null); setForm(blank);
      reload();
    } catch (e: any) {
      toast.error(e.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const toggleActive = async (u: UserRow) => {
    try {
      await api.patch(`/api/v1/users/${u.id}`, { is_active: !(u.is_active !== false) });
      reload();
    } catch (e: any) { toast.error(e.message || 'Update failed'); }
  };

  // Bulk upload — accepts the template above. Each data row becomes a
  // sequential POST to /api/v1/users (we don't fan out so failures keep
  // their per-row context for the result table). Hierarchy role is
  // resolved by name (case-insensitive).
  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_SAMPLE + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'users-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Stage 1 — file picked. Parse, then move to the column-mapping panel.
  // Auto-detect column matches by synonym; the admin can correct any wrong
  // guesses before importing. Keeps the original rows around so re-mapping
  // doesn't require re-uploading the file.
  const onBulkFile = async (file: File) => {
    setBulkBusy(true);
    setBulkResult(null);
    setBulkHeader(null);
    setBulkRows(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) { toast.error('CSV is empty (header + at least one data row required)'); return; }
      const header = rows[0];
      const data = rows.slice(1);
      setBulkHeader(header);
      setBulkRows(data);
      setBulkFileName(file.name);
      setBulkMap(autoMapHeader(header));
    } catch (e: any) {
      toast.error(e.message || 'Failed to read CSV');
    } finally {
      setBulkBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Stage 2 — admin confirmed column mapping. Validate every row client-side,
  // then POST the valid ones sequentially so per-row errors keep their
  // context for the result table.
  const runBulkImport = async () => {
    if (!bulkHeader || !bulkRows) return;
    // Required-field mapping check first — the import button is also
    // disabled when these are -1, but be defensive anyway.
    const missing = BULK_FIELDS.filter((f) => f.required && bulkMap[f.key] < 0);
    if (missing.length) {
      toast.error(`Please map: ${missing.map((m) => m.label).join(', ')}`);
      return;
    }
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const roleByName = new Map(roles.map((r) => [r.name.toLowerCase(), r]));
      let okCount = 0;
      const failed: Array<{ name: string; error: string }> = [];

      const iName = bulkMap.name;
      const iMobile = bulkMap.mobile;
      const iEmail = bulkMap.email;
      const iHRole = bulkMap.hierarchy_role;
      const iPwd = bulkMap.password;

      for (const row of bulkRows) {
        const name = (row[iName] || '').trim();
        const mobileRaw = (row[iMobile] || '').trim();
        const mobile = sanitiseMobile(mobileRaw);
        const email = iEmail >= 0 ? (row[iEmail] || '').trim() : '';
        const hierarchyName = iHRole >= 0 ? (row[iHRole] || '').trim().toLowerCase() : '';
        const password = iPwd >= 0 ? (row[iPwd] || '').trim() : '';
        const hRole = hierarchyName ? roleByName.get(hierarchyName) : undefined;

        // Client-side validation pass — surface the same errors the
        // backend would return, but without burning a network round-trip
        // (and a rate-limit slot) on rows we already know will fail.
        if (!name) { failed.push({ name: '<no name>', error: 'name is required' }); continue; }
        if (!mobile) { failed.push({ name, error: `mobile is required (got "${mobileRaw}")` }); continue; }
        if (!/^\d{10}$/.test(mobile)) {
          failed.push({ name, error: `mobile must be 10 digits after stripping +91/spaces (got "${mobile}")` });
          continue;
        }
        if (!password) { failed.push({ name, error: 'password is required' }); continue; }
        if (password.length < 10) {
          failed.push({ name, error: `password too short (${password.length} chars, need ≥10)` });
          continue;
        }

        const payload: Record<string, unknown> = {
          name, mobile,
          email: email || `${mobile}@kinematic.app`,
          // Preset role kept fixed; access is fully driven by the picked
          // hierarchy role's permissions array. Match the form behaviour.
          role: DEFAULT_PRESET_ROLE,
          permissions: hRole?.permissions ?? [],
          org_role_id: hRole?.id ?? null,
          is_active: true,
          password,
        };

        try {
          await api.post('/api/v1/users', payload);
          okCount += 1;
        } catch (err: any) {
          // Surface the backend's specific reason (e.g.
          // "WEAK_PASSWORD: This password is too common.") instead of a
          // generic "Create failed" so admins can see what to fix.
          failed.push({ name, error: err?.message || 'Create failed' });
        }
      }
      setBulkResult({ ok: okCount, failed });
      if (okCount > 0) reload();
      toast.success(`Imported ${okCount} of ${bulkRows.length} users${failed.length ? ` · ${failed.length} failed` : ''}`);
    } catch (e: any) {
      toast.error(e.message || 'Bulk import failed');
    } finally {
      setBulkBusy(false);
    }
  };

  // Reset the bulk-upload state so the admin can start over without
  // re-opening the panel. Called from the "Start over" link in the
  // mapping panel and after a successful import.
  const resetBulk = () => {
    setBulkHeader(null);
    setBulkRows(null);
    setBulkFileName('');
    setBulkMap({ name: -1, mobile: -1, email: -1, hierarchy_role: -1, password: -1 });
    setBulkResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Group failed-row errors by reason so the result panel can show a
  // summary line ("3 rows: WEAK_PASSWORD…") above the per-row list.
  // Helpful when the same systemic problem (e.g. policy-violating template
  // password) breaks every row.
  const failureSummary = (() => {
    if (!bulkResult || !bulkResult.failed.length) return [] as Array<{ reason: string; count: number }>;
    const map = new Map<string, number>();
    for (const f of bulkResult.failed) map.set(f.error, (map.get(f.error) ?? 0) + 1);
    return Array.from(map.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  })();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>Team Members</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-dim)', maxWidth: 720 }}>
            Add team members. Module access is inherited from the <Link href="/dashboard/settings/roles" style={{ color: 'var(--primary)' }}>Hierarchy Role</Link> you assign — define permissions once on the role, not per user.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/dashboard/crm/settings" style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>← Back</Link>
          <button onClick={() => { setShowBulk((s) => !s); resetBulk(); }} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Bulk Upload</button>
          <button onClick={startCreate} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add User</button>
        </div>
      </div>

      {showBulk && (
        <div style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Bulk Upload Users</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, maxWidth: 640 }}>
                Drop any CSV — we&apos;ll detect your columns and let you map them. Required: <strong style={{ color: 'var(--text)' }}>Name</strong>, <strong style={{ color: 'var(--text)' }}>Mobile</strong>, <strong style={{ color: 'var(--text)' }}>Password</strong>. Optional: <strong style={{ color: 'var(--text)' }}>Email</strong>, <strong style={{ color: 'var(--text)' }}>Hierarchy Role</strong>.
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, maxWidth: 640, padding: 8, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 6 }}>
                <strong style={{ color: 'var(--text)' }}>Password policy:</strong> {PASSWORD_POLICY_HINT}
                {' '}Mobiles can include <code>+91</code> or spaces — they&apos;re stripped before upload.
              </div>
            </div>
            <button onClick={() => { setShowBulk(false); resetBulk(); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>

          {/* STAGE 1 — pick a file. Hidden once a CSV has been parsed; the
              admin can still hit "Start over" to come back here. */}
          {!bulkHeader && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button type="button" onClick={downloadTemplate} style={btnGhost}>Download template</button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                disabled={bulkBusy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onBulkFile(f); }}
                style={{ ...input, padding: 6, width: 'auto' }}
              />
              {bulkBusy && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>Parsing…</span>}
            </div>
          )}

          {/* STAGE 2 — column mapper. Shown once a CSV is parsed and not yet
              imported. Each required/optional field is paired with a
              dropdown of the CSV's actual columns, auto-detected by
              synonym. Required fields with no match get a red border. */}
          {bulkHeader && bulkRows && !bulkResult && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  <strong style={{ color: 'var(--text)' }}>{bulkFileName}</strong> · {bulkRows.length} data row{bulkRows.length === 1 ? '' : 's'} · {bulkHeader.length} column{bulkHeader.length === 1 ? '' : 's'} detected
                </div>
                <button type="button" onClick={resetBulk} style={btnTiny}>Start over</button>
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, padding: 8, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 6 }}>
                Match each Kinematic field to a column in your CSV. We&apos;ve auto-detected the obvious ones — adjust any that look wrong. Fields with <strong style={{ color: '#E01E2C' }}>*</strong> are required.
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, marginBottom: 12 }}>
                {BULK_FIELDS.map((f) => {
                  const sel = bulkMap[f.key];
                  const missing = f.required && sel < 0;
                  return (
                    <div key={f.key} style={{ background: 'var(--s4)', border: `1px solid ${missing ? '#E01E2C' : 'var(--border)'}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                          {f.label}{f.required && <span style={{ color: '#E01E2C' }}> *</span>}
                        </div>
                        <span style={{ fontSize: 10, color: missing ? '#E01E2C' : sel >= 0 ? '#10b981' : 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {missing ? 'Required' : sel >= 0 ? 'Mapped' : 'Skipped'}
                        </span>
                      </div>
                      <select
                        value={sel}
                        onChange={(e) => setBulkMap({ ...bulkMap, [f.key]: parseInt(e.target.value, 10) })}
                        style={input}
                      >
                        <option value={-1}>{f.required ? '— Pick a column —' : '— Skip this field —'}</option>
                        {bulkHeader.map((h, i) => (
                          <option key={i} value={i}>{h || `(column ${i + 1})`}</option>
                        ))}
                      </select>
                      {f.hint && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>{f.hint}</div>}
                      {/* Preview the first non-empty value the picked column
                          would yield. Helps catch off-by-one mistakes
                          ("oh, I mapped name → mobile by accident"). */}
                      {sel >= 0 && (() => {
                        const sample = bulkRows.find((r) => (r[sel] || '').trim() !== '')?.[sel]?.trim();
                        if (!sample) return null;
                        return (
                          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            Preview: <span style={{ color: 'var(--text)' }}>{sample.length > 32 ? sample.slice(0, 32) + '…' : sample}</span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>

              {/* First-3-rows preview table — sanity-check the mapping
                  before kicking off the import. */}
              <div style={{ background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 12, overflowX: 'auto' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Preview (first 3 rows after mapping)</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {BULK_FIELDS.map((f) => (
                        <th key={f.key} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.4 }}>{f.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bulkRows.slice(0, 3).map((row, ri) => (
                      <tr key={ri}>
                        {BULK_FIELDS.map((f) => {
                          const idx = bulkMap[f.key];
                          const val = idx >= 0 ? (row[idx] || '') : '';
                          return (
                            <td key={f.key} style={{ padding: '4px 8px', color: val ? 'var(--text)' : 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
                              {val || <em style={{ opacity: 0.5 }}>—</em>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' }}>
                {BULK_FIELDS.filter((f) => f.required && bulkMap[f.key] < 0).length > 0 && (
                  <span style={{ fontSize: 11, color: '#E01E2C', marginRight: 'auto' }}>
                    Map the required fields above to enable import.
                  </span>
                )}
                <button type="button" onClick={resetBulk} disabled={bulkBusy} style={btnGhost}>Cancel</button>
                <button
                  type="button"
                  onClick={runBulkImport}
                  disabled={bulkBusy || BULK_FIELDS.some((f) => f.required && bulkMap[f.key] < 0)}
                  style={{ ...btnPrimary, opacity: (bulkBusy || BULK_FIELDS.some((f) => f.required && bulkMap[f.key] < 0)) ? 0.5 : 1 }}
                >
                  {bulkBusy ? 'Importing…' : `Import ${bulkRows.length} row${bulkRows.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          )}

          {/* STAGE 3 — result summary. Shown after an import attempt. */}
          {bulkResult && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: bulkResult.failed.length ? 8 : 0, gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  <strong style={{ color: '#10b981' }}>{bulkResult.ok} imported</strong>
                  {bulkResult.failed.length > 0 && <> · <strong style={{ color: '#E01E2C' }}>{bulkResult.failed.length} failed</strong></>}
                </div>
                <button type="button" onClick={resetBulk} style={btnTiny}>Upload another file</button>
              </div>
              {/* Summary by reason — surfaced above the per-row list so a
                  systemic problem (every row failing the same check) is
                  obvious at a glance. */}
              {failureSummary.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, padding: 8, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Failures by reason:</div>
                  {failureSummary.map((s, i) => (
                    <div key={i}>• <strong style={{ color: 'var(--text)' }}>{s.count}×</strong> {s.reason}</div>
                  ))}
                </div>
              )}
              {bulkResult.failed.length > 0 && (
                <div style={{ maxHeight: 140, overflowY: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>
                  {bulkResult.failed.map((f, i) => (
                    <div key={i} style={{ padding: '2px 0' }}><strong style={{ color: 'var(--text)' }}>{f.name}</strong> — {f.error}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div ref={formRef} style={{ background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16, scrollMarginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{editId ? 'Edit User' : 'New User'}</div>
            <button onClick={() => { setShowAdd(false); setEditId(null); setForm(blank); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <Field label="Full Name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Rahul Sharma" style={input} /></Field>
            <Field label="Mobile (primary) *"><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} placeholder="10-digit mobile" maxLength={15} style={input} /></Field>
            <Field label="Email"><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="auto-generated if blank" style={input} /></Field>
            <Field label="Hierarchy Role">
              <select value={form.org_role_id} onChange={(e) => setForm({ ...form, org_role_id: e.target.value })} style={input}>
                <option value="">— None —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({(r.permissions || []).length} modules)</option>)}
              </select>
            </Field>
            <Field label={editId ? 'New Password (optional)' : 'Password'}>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ? 'Leave blank to keep' : 'Minimum 10 characters'} style={input} />
            </Field>
          </div>

          {/* Assigned Cities — backend createUser/updateUser writes these to
              user_city_assignments. Cities list is auto-scoped to the picked
              tenant (the X-Client-Id fix in management.controller.ts cd57c3f)
              so admins only see cities for the client they're browsing. */}
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>Assigned Cities (multi-select)</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setForm((p) => ({ ...p, assigned_cities: cities.map((c) => c.id) }))} style={btnTiny}>Select all</button>
                <button type="button" onClick={() => setForm((p) => ({ ...p, assigned_cities: [] }))} style={btnTiny}>Clear</button>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8 }}>
              The user will only see data for these cities. Leave empty to grant org-wide access.
              {' '}
              <strong style={{ color: 'var(--text)' }}>{form.assigned_cities.length}</strong> of {cities.length} selected.
            </div>
            {cities.length === 0 ? (
              <div style={{ background: 'var(--s4)', border: '1px dashed var(--border)', borderRadius: 8, padding: 14, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
                No cities configured for this tenant. Add them under <Link href="/dashboard/other-management/cities" style={{ color: 'var(--primary)' }}>Cities</Link> first.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6, maxHeight: 220, overflowY: 'auto', padding: 4 }}>
                {cities.map((c) => {
                  const checked = form.assigned_cities.includes(c.id);
                  return (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--s4)', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${checked ? 'var(--primary)' : 'var(--border)'}` }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCity(c.id)} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: checked ? 'var(--text)' : 'var(--text-dim)' }}>{c.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Show what the user is inheriting from the picked hierarchy role
              so admins can spot-check before saving. */}
          {form.org_role_id && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              Inheriting <strong style={{ color: 'var(--text)' }}>{permissionsForRole(form.org_role_id).length} module{permissionsForRole(form.org_role_id).length === 1 ? '' : 's'}</strong> from the selected hierarchy role. Edit per-module access under <Link href="/dashboard/settings/roles" style={{ color: 'var(--primary)' }}>Role Hierarchy</Link>.
            </div>
          )}
          {!form.org_role_id && (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--s4)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-dim)' }}>
              No hierarchy role picked — user will have no module access until you assign one. The preset role above only governs role-based middleware checks (e.g. "is this person at sub-admin level?").
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button onClick={() => { setShowAdd(false); setEditId(null); setForm(blank); }} disabled={saving} style={btnGhost}>Cancel</button>
            <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : (editId ? 'Save Changes' : 'Create User')}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, mobile, role…" style={{ ...input, minWidth: 280 }} />
        <div style={{ display: 'flex', gap: 4, background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {(['all', 'active', 'inactive'] as const).map((k) => (
            <button key={k} onClick={() => setStatusFilter(k)}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                background: statusFilter === k ? 'var(--accent, #3E9EFF)' : 'transparent',
                color: statusFilter === k ? '#fff' : 'var(--text-dim)' }}>
              {k}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{filtered.length} of {users.length} users</span>
      </div>

      <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Name</th>
              <th style={th}>Email</th>
              <th style={th}>Mobile</th>
              <th style={th}>Hierarchy</th>
              <th style={th}>Cities</th>
              <th style={th}>Kini AI</th>
              <th style={th}>Status</th>
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>Loading users…</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-dim)' }}>No users yet — click <strong style={{ color: 'var(--text)' }}>+ Add User</strong> or <strong style={{ color: 'var(--text)' }}>Bulk Upload</strong>.</td></tr>}
            {filtered.map((u) => {
              // Prefer the server-joined role name (getUsers in
              // misc.controller.ts now returns org_role.name alongside
              // each row). Fall back to looking up the locally-loaded
              // roles list, then to "—" only when the user truly has no
              // hierarchy role assigned. Never shows "Team Member" as a
              // catch-all — admins want to see the real designation.
              const joinedName = (u as any)?.org_role?.name as string | undefined;
              const hRoleName = joinedName
                || (u.org_role_id ? roles.find((r) => r.id === u.org_role_id)?.name : undefined)
                || '—';
              // Resolve city names: prefer the server-joined names; fall
              // back to looking up assigned_cities ids against the
              // tenant-scoped cities list we already loaded for the form.
              const cityNames: string[] = u.assigned_city_names && u.assigned_city_names.length
                ? u.assigned_city_names
                : (u.assigned_cities || []).map((cid) => cities.find((c) => c.id === cid)?.name).filter(Boolean) as string[];
              return (
                <tr key={u.id}>
                  <td style={td}><strong style={{ color: 'var(--text)' }}>{u.name || '—'}</strong></td>
                  <td style={td}>{u.email || '—'}</td>
                  <td style={td}>{u.mobile || '—'}</td>
                  <td style={td}><span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hRoleName}</span></td>
                  <td style={td}>
                    {cityNames.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>
                    ) : cityNames.length <= 2 ? (
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{cityNames.join(', ')}</span>
                    ) : (
                      // 3+ cities — show count + full list on hover so the
                      // column stays readable on smaller screens.
                      <span title={cityNames.join(', ')} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: 'var(--s4)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>
                        {cityNames.length} cities
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {(() => {
                      // Kini AI credits — used / cap for the current month.
                      // Backend stamps both fields on the user row. Capped
                      // bar caps at 100% width even if the user somehow
                      // exceeds (shouldn't happen — the gate blocks 21+).
                      const used = Math.max(0, u.kini_used_this_month ?? 0);
                      const cap = Math.max(1, u.kini_monthly_cap ?? 20);
                      const pct = Math.min(100, Math.round((used / cap) * 100));
                      const tone = used >= cap ? '#E01E2C' : used >= cap * 0.8 ? '#f59e0b' : '#10b981';
                      return (
                        <div style={{ minWidth: 96 }}>
                          <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>
                            {used} <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>/ {cap}</span>
                          </div>
                          <div style={{ marginTop: 4, height: 4, background: 'var(--s4)', borderRadius: 2, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: tone, transition: 'width 0.2s' }} />
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={td}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: u.is_active === false ? 'rgba(224,30,44,0.15)' : 'rgba(0,217,126,0.15)', color: u.is_active === false ? '#E01E2C' : '#10b981', fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
                      {u.is_active === false ? 'INACTIVE' : 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(u)} style={btnSmall}>Edit</button>{' '}
                    <button onClick={() => toggleActive(u)} style={btnSmall}>{u.is_active === false ? 'Reactivate' : 'Deactivate'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</span>
      {children}
    </label>
  );
}

const input: React.CSSProperties = { background: 'var(--s4)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', width: '100%' };
const td: React.CSSProperties = { padding: '12px 14px', fontSize: 13, color: 'var(--text)', borderBottom: '1px solid var(--border)' };
const th: React.CSSProperties = { padding: '10px 14px', fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--s2)', fontWeight: 700 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnSmall: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' };
const btnTiny: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: 'pointer' };

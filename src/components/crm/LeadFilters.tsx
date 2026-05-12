'use client';
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';

// Cascading State → City → District → Block filter backed by
// /api/v1/crm/locations/options. Replaces the old free-text state/city
// filters; values are constrained to whatever Settings → Locations has
// loaded for the active client.
//
// Other CRM list pages can reuse this component by passing in/out a
// LeadFiltersValue.

export interface LeadFiltersValue {
  q?: string;
  status?: string;
  source?: string;
  owner?: string;
  grade?: string;
  state?: string;
  city?: string;
  district?: string;
  block?: string;
}

interface LocationRow {
  state: string;
  city: string;
  district: string | null;
  block: string | null;
}

type LocationOptionsResponse = {
  success?: boolean;
  data?: { rows: LocationRow[] } | LocationRow[];
} | { rows: LocationRow[] };

function readRows(r: LocationOptionsResponse): LocationRow[] {
  const payload = (r as any)?.data ?? r;
  if (Array.isArray(payload)) return payload as LocationRow[];
  return payload?.rows ?? [];
}

export default function LeadFilters({ value, onChange, sources = [], owners = [] }: {
  value: LeadFiltersValue;
  onChange: (next: LeadFiltersValue) => void;
  sources?: Array<{ id: string; name: string }>;
  owners?: Array<{ id: string; name: string }>;
}) {
  const [rows, setRows] = useState<LocationRow[]>([]);

  useEffect(() => {
    api.get<LocationOptionsResponse>('/api/v1/crm/locations/options').then(r => setRows(readRows(r))).catch(() => {});
  }, []);

  // Derive cascading option sets from the master list. Each level filters
  // by the levels above it.
  const states = useMemo(() => Array.from(new Set(rows.map(r => r.state))).sort(), [rows]);
  const cities = useMemo(() =>
    Array.from(new Set(rows.filter(r => !value.state || r.state === value.state).map(r => r.city))).sort(),
    [rows, value.state]);
  const districts = useMemo(() =>
    Array.from(new Set(rows
      .filter(r => (!value.state || r.state === value.state) && (!value.city || r.city === value.city))
      .map(r => r.district).filter((d): d is string => Boolean(d)))).sort(),
    [rows, value.state, value.city]);
  const blocks = useMemo(() =>
    Array.from(new Set(rows
      .filter(r => (!value.state || r.state === value.state)
                && (!value.city || r.city === value.city)
                && (!value.district || r.district === value.district))
      .map(r => r.block).filter((b): b is string => Boolean(b)))).sort(),
    [rows, value.state, value.city, value.district]);

  // Clear downstream levels when an upstream changes (so stale district
  // doesn't outlive a state switch).
  const set = (patch: Partial<LeadFiltersValue>) => onChange({ ...value, ...patch });
  const setState    = (s: string) => set({ state:    s || undefined, city: undefined, district: undefined, block: undefined });
  const setCity     = (c: string) => set({ city:     c || undefined, district: undefined, block: undefined });
  const setDistrict = (d: string) => set({ district: d || undefined, block: undefined });
  const setBlock    = (b: string) => set({ block:    b || undefined });

  const inputStyle: React.CSSProperties = {
    background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 130,
  };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <input
        style={{ ...inputStyle, flex: '1 1 240px', minWidth: 200 }}
        placeholder="Search name, email, company..."
        value={value.q || ''}
        onChange={(e) => set({ q: e.target.value || undefined })}
      />
      <select style={inputStyle} value={value.status || ''} onChange={(e) => set({ status: e.target.value || undefined })}>
        <option value="">All Statuses</option>
        <option value="new">New</option>
        <option value="working">Working</option>
        <option value="qualified">Qualified</option>
        <option value="unqualified">Unqualified</option>
        <option value="converted">Converted</option>
      </select>
      <select style={inputStyle} value={value.grade || ''} onChange={(e) => set({ grade: e.target.value || undefined })}>
        <option value="">All Grades</option>
        <option value="A">A (Hot)</option>
        <option value="B">B (Warm)</option>
        <option value="C">C (Lukewarm)</option>
        <option value="D">D (Cold)</option>
      </select>
      <select style={inputStyle} value={value.source || ''} onChange={(e) => set({ source: e.target.value || undefined })}>
        <option value="">All Sources</option>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select style={inputStyle} value={value.owner || ''} onChange={(e) => set({ owner: e.target.value || undefined })}>
        <option value="">All Owners</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>

      {/* Location hierarchy — cascades, hidden once Locations master is empty */}
      {states.length > 0 && (
        <select style={inputStyle} value={value.state || ''} onChange={(e) => setState(e.target.value)}>
          <option value="">All States</option>
          {states.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {value.state && cities.length > 0 && (
        <select style={inputStyle} value={value.city || ''} onChange={(e) => setCity(e.target.value)}>
          <option value="">All Cities</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {value.city && districts.length > 0 && (
        <select style={inputStyle} value={value.district || ''} onChange={(e) => setDistrict(e.target.value)}>
          <option value="">All Districts</option>
          {districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
      {value.district && blocks.length > 0 && (
        <select style={inputStyle} value={value.block || ''} onChange={(e) => setBlock(e.target.value)}>
          <option value="">All Blocks</option>
          {blocks.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
    </div>
  );
}

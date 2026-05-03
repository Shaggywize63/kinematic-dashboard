'use client';
import React from 'react';

export interface LeadFiltersValue {
  q?: string;
  status?: string;
  source?: string;
  owner?: string;
  grade?: string;
}

export default function LeadFilters({ value, onChange, sources = [], owners = [] }: {
  value: LeadFiltersValue;
  onChange: (next: LeadFiltersValue) => void;
  sources?: Array<{ id: string; name: string }>;
  owners?: Array<{ id: string; name: string }>;
}) {
  const set = (patch: Partial<LeadFiltersValue>) => onChange({ ...value, ...patch });
  const inputStyle: React.CSSProperties = {
    background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
    padding: '8px 12px', borderRadius: 8, fontSize: 13, minWidth: 130,
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <input style={{ ...inputStyle, flex: '1 1 240px', minWidth: 200 }} placeholder="Search name, email, company..." value={value.q || ''} onChange={(e) => set({ q: e.target.value })} />
      <select style={inputStyle} value={value.status || ''} onChange={(e) => set({ status: e.target.value })}>
        <option value="">All Statuses</option>
        <option value="new">New</option>
        <option value="working">Working</option>
        <option value="qualified">Qualified</option>
        <option value="unqualified">Unqualified</option>
        <option value="converted">Converted</option>
      </select>
      <select style={inputStyle} value={value.grade || ''} onChange={(e) => set({ grade: e.target.value })}>
        <option value="">All Grades</option>
        <option value="A">A (Hot)</option>
        <option value="B">B (Warm)</option>
        <option value="C">C (Lukewarm)</option>
        <option value="D">D (Cold)</option>
      </select>
      <select style={inputStyle} value={value.source || ''} onChange={(e) => set({ source: e.target.value })}>
        <option value="">All Sources</option>
        {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select style={inputStyle} value={value.owner || ''} onChange={(e) => set({ owner: e.target.value })}>
        <option value="">All Owners</option>
        {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

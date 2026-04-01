'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const C = {
  bg: 'var(--bg)', s1: 'var(--s1)', s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', borderL: 'var(--border-l)',
  white: 'var(--text)', gray: 'var(--text-dim)', grayd: 'var(--text-dim)', graydd: 'var(--text-dim)',
  red: 'var(--primary)', redD: 'rgba(224,30,44,0.08)', redB: 'rgba(224,30,44,0.20)',
  green: 'var(--green)', greenD: 'rgba(0,217,126,0.08)',
  blue: 'var(--accent)', blueD: 'rgba(62,158,255,0.10)',
  yellow: '#FFB800', yellowD: 'rgba(255,184,0,0.08)',
  purple: '#9B6EFF', purpleD: 'rgba(155,110,255,0.08)',
};

const inp: React.CSSProperties = {
  width: '100%', background: C.s3, border: `1.5px solid ${C.border}`,
  color: C.white, borderRadius: 10, padding: '10px 13px',
  fontSize: 13, outline: 'none', fontFamily: "'DM Sans', sans-serif",
};

interface Zone { id: string; name: string; city: string; }
interface City { id: string; name: string; }

interface BroadcastResponse {
  user_name: string;
  employee_id: string;
  selected_label: string;
  selected_index: number;
  is_correct: boolean | null;
  answered_at: string;
}

interface BroadcastQuestion {
  id: string;
  question: string;
  options: { label: string; value: string }[];
  correct_option: number | null;
  is_urgent: boolean;
  deadline_at: string | null;
  status: string;
  target_roles: string[];
  target_zone_ids: string[];
  target_cities: string[];
  created_at: string;
  response_count: number;
  tally: { label: string; index: number; count: number }[];
  responses: BroadcastResponse[];
}

interface FormState {
  question: string;
  opts: string[];
  correct: number;
  urgent: boolean;
  deadline: string;
  target_roles: string[];
  target_zone_ids: string[];
  target_cities: string[];
}

const defaultForm = (): FormState => ({
  question: '',
  opts: ['', '', '', ''],
  correct: 0,
  urgent: false,
  deadline: '',
  target_roles: ['executive'],
  target_zone_ids: [],
  target_cities: [],
});

// ── Audience Chip ──────────────────────────────────────────
function TargetSummary({ q }: { q: BroadcastQuestion }) {
  const roles = q.target_roles.map(r =>
    r === 'executive' ? 'FEs' : r === 'supervisor' ? 'Supervisors' : r
  ).join(' + ');
  const zones = q.target_zone_ids.length
    ? `${q.target_zone_ids.length} zone(s)` : null;
  const cities = q.target_cities.length
    ? q.target_cities.join(', ') : null;
  const geo = [zones, cities].filter(Boolean).join(' · ');
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.purpleD, color: C.purple }}>
        → {roles}
      </span>
      {geo && (
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: C.blueD, color: C.blue }}>
          {geo}
        </span>
      )}
    </div>
  );
}

// ── Toggle pill ───────────────────────────────────────────
function TogglePill({
  label, active, onClick, color = C.purple,
}: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
        fontWeight: 700, border: `1.5px solid ${active ? color : C.border}`,
        background: active ? `${color}18` : C.s3,
        color: active ? color : C.gray,
        transition: 'all 0.15s', userSelect: 'none',
      }}
    >
      {active ? '✓ ' : ''}{label}
    </div>
  );
}

export default function BroadcastPage() {
  const { user } = useAuth();
  const isPlatformAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  const [questions, setQuestions] = useState<BroadcastQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [allCities, setAllCities] = useState<City[]>([]);
  const [allZones, setAllZones] = useState<Zone[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [bRes, cRes, zRes] = await Promise.all([
        api.get('/api/v1/broadcast/admin'),
        api.get('/api/v1/cities'),
        api.get('/api/v1/zones')
      ]);
      setQuestions(Array.isArray(bRes) ? bRes : (bRes as any)?.data ?? []);
      const citiesArr = Array.isArray(cRes) ? cRes : (cRes as any)?.data ?? [];
      setAllCities(citiesArr);
      const zonesArr = Array.isArray(zRes) ? zRes : (zRes as any)?.data ?? [];
      setAllZones(zonesArr);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.question.trim() || form.opts.filter(o => o.trim()).length < 2) return;
    setSubmitting(true);
    try {
      const options = form.opts
        .filter(o => o.trim())
        .map(o => ({ label: o.trim(), value: o.trim().toLowerCase().replace(/\s+/g, '_') }));
      await api.post('/api/v1/broadcast', {
        question: form.question.trim(),
        options,
        correct_option: form.correct < options.length ? form.correct : null,
        is_urgent: form.urgent,
        deadline_at: form.deadline ? new Date(form.deadline).toISOString() : null,
        target_roles: form.target_roles,
        target_zone_ids: form.target_zone_ids,
        target_cities: form.target_cities,
      });
      setShowCreate(false);
      setForm(defaultForm());
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/v1/broadcast/${id}`);
      setDeleteId(null);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleToggleStatus = async (q: BroadcastQuestion) => {
    setClosingId(q.id);
    try {
      const newStatus = q.status === 'active' ? 'closed' : 'active';
      await api.patch(`/api/v1/broadcast/${q.id}/status`, { status: newStatus });
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setClosingId(null);
    }
  };

  const toggleRole = (role: string) => {
    setForm(p => ({
      ...p,
      target_roles: p.target_roles.includes(role)
        ? p.target_roles.filter(r => r !== role)
        : [...p.target_roles, role],
    }));
  };

  const toggleZone = (zoneId: string) => {
    setForm(p => ({
      ...p,
      target_zone_ids: p.target_zone_ids.includes(zoneId)
        ? p.target_zone_ids.filter(z => z !== zoneId)
        : [...p.target_zone_ids, zoneId],
    }));
  };

  const toggleCity = (cityName: string) => {
    setForm(p => {
      const next = p.target_cities.includes(cityName)
        ? p.target_cities.filter(c => c !== cityName)
        : [...p.target_cities, cityName];
      return { ...p, target_cities: next, target_zone_ids: [] }; // Reset zones when city changes
    });
  };

  const active = questions.filter(q => q.status === 'active');
  const closed = questions.filter(q => q.status !== 'active');
  const totalResp = questions.reduce((a, q) => a + (q.response_count || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 20, fontWeight: 800 }}>Broadcast Questions</div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 3 }}>Send questions to field executives & supervisors</div>
        </div>
        {isPlatformAdmin && (
          <button
            onClick={() => { setForm(defaultForm()); setShowCreate(true); }}
            style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 12, padding: '11px 20px', fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif", cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px var(--primary-shadow)', whiteSpace: 'nowrap' }}
          >
            + New Question
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {[
          { l: 'Total Questions', v: String(questions.length), c: C.blue },
          { l: 'Active', v: String(active.length), c: C.green },
          { l: 'Total Responses', v: String(totalResp), c: C.yellow },
          { l: 'Closed', v: String(closed.length), c: C.gray },
        ].map(s => (
          <div key={s.l} style={{ flex: 1, minWidth: 120, background: C.s2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 28, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 12, padding: '12px 16px', color: C.red, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={load} style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTopColor: C.red, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && questions.length === 0 && (
        <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No questions yet</div>
          <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>Create your first broadcast question to engage your field team.</div>
          <button onClick={() => { setForm(defaultForm()); setShowCreate(true); }} style={{ background: C.red, color: '#fff', border: 'none', borderRadius: 11, padding: '11px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne',sans-serif" }}>
            + Create Question
          </button>
        </div>
      )}

      {/* Active questions */}
      {!loading && active.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: C.grayd, textTransform: 'uppercase', marginBottom: 12 }}>
            ACTIVE ({active.length})
          </div>
          {active.map((q, qi) => <QuestionCard key={q.id} q={q} qi={qi} expanded={expandedId === q.id} onExpand={() => setExpandedId(expandedId === q.id ? null : q.id)} onDelete={() => setDeleteId(q.id)} onToggleStatus={() => handleToggleStatus(q)} closingId={closingId} isPlatformAdmin={isPlatformAdmin} />)}
        </div>
      )}

      {/* Closed questions */}
      {!loading && closed.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: C.grayd, textTransform: 'uppercase', marginBottom: 12 }}>
            CLOSED ({closed.length})
          </div>
          {closed.map((q, qi) => <QuestionCard key={q.id} q={q} qi={active.length + qi} expanded={expandedId === q.id} onExpand={() => setExpandedId(expandedId === q.id ? null : q.id)} onDelete={() => setDeleteId(q.id)} onToggleStatus={() => handleToggleStatus(q)} closingId={closingId} isPlatformAdmin={isPlatformAdmin} />)}
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 20, width: '100%', maxWidth: 400, padding: 28 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 17, fontWeight: 800, marginBottom: 8 }}>Delete Question?</div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 24, lineHeight: 1.6 }}>This will permanently delete the question and all its responses. This cannot be undone.</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 11, padding: 12, color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteId)} style={{ flex: 1, background: C.red, border: 'none', borderRadius: 11, padding: 12, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowCreate(false); } }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div style={{ background: C.s2, border: `1px solid ${C.border}`, borderRadius: 22, width: '100%', maxWidth: 560, padding: 28, maxHeight: '92vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800 }}>Create Broadcast Question</div>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: C.gray, cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            {/* Question */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Question *</label>
              <textarea
                value={form.question}
                onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
                placeholder="Type your question..."
                rows={3}
                style={{ ...inp, resize: 'none' }}
              />
            </div>

            {/* Options */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Options <span style={{ color: C.grayd, textTransform: 'none', letterSpacing: 0 }}>(select correct answer)</span>
              </label>
              {form.opts.map((opt, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <div
                    onClick={() => setForm(p => ({ ...p, correct: i }))}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${form.correct === i ? C.green : C.border}`,
                      background: form.correct === i ? C.green : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                  >
                    {form.correct === i && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <input
                    value={opt}
                    onChange={e => setForm(p => { const o = [...p.opts]; o[i] = e.target.value; return { ...p, opts: o }; })}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    style={{ ...inp, flex: 1 }}
                  />
                </div>
              ))}
            </div>

            {/* Audience — Roles */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Publish To — Roles *
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <TogglePill label="Field Executives" active={form.target_roles.includes('executive')} onClick={() => toggleRole('executive')} color={C.purple} />
                <TogglePill label="Supervisors" active={form.target_roles.includes('supervisor')} onClick={() => toggleRole('supervisor')} color={C.blue} />
              </div>
              {form.target_roles.length === 0 && (
                <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>⚠ Select at least one role</div>
              )}
            </div>

            {/* Audience — Cities */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Filter by City <span style={{ color: C.grayd, textTransform: 'none', letterSpacing: 0 }}>(leave blank = all cities)</span>
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allCities.map(city => (
                  <TogglePill key={city.id} label={city.name} active={form.target_cities.includes(city.name)} onClick={() => toggleCity(city.name)} color={C.yellow} />
                ))}
                {allCities.length === 0 && <div style={{ fontSize:12, color:C.gray }}>No cities found</div>}
              </div>
            </div>

            {/* Audience — Zones */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Filter by Zone <span style={{ color: C.grayd, textTransform: 'none', letterSpacing: 0 }}>(leave blank = all zones)</span>
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allZones
                  .filter(z => form.target_cities.length === 0 || form.target_cities.includes(z.city))
                  .map(z => (
                    <TogglePill key={z.id} label={z.name} active={form.target_zone_ids.includes(z.id)} onClick={() => toggleZone(z.id)} color={C.blue} />
                  ))}
                {allZones.length > 0 && form.target_cities.length > 0 && allZones.filter(z => form.target_cities.includes(z.city)).length === 0 && (
                  <div style={{ fontSize:12, color:C.gray }}>No zones in selected cities</div>
                )}
                {allZones.length === 0 && <div style={{ fontSize:12, color:C.gray }}>No zones found</div>}
              </div>
            </div>

            {/* Urgency + Deadline */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Urgency</label>
                <div
                  onClick={() => setForm(p => ({ ...p, urgent: !p.urgent }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: form.urgent ? C.redD : C.s3, border: `1.5px solid ${form.urgent ? C.red : C.border}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.15s' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${form.urgent ? C.red : C.border}`, background: form.urgent ? C.red : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                    {form.urgent && <div style={{ color: '#fff', fontSize: 11, fontWeight: 800, lineHeight: 1 }}>✓</div>}
                  </div>
                  <span style={{ fontSize: 13, color: form.urgent ? C.red : C.gray, fontWeight: form.urgent ? 700 : 400 }}>Mark as urgent</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 140 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Deadline (optional)</label>
                <input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))}
                  style={{ ...inp }}
                />
              </div>
            </div>

            {/* Audience preview */}
            <div style={{ background: C.s3, border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.gray, marginBottom: 5 }}>AUDIENCE PREVIEW</div>
              <div style={{ fontSize: 12, color: C.white, lineHeight: 1.7 }}>
                <span style={{ color: C.purple, fontWeight: 700 }}>
                  {form.target_roles.map(r => r === 'executive' ? 'Field Executives' : r === 'supervisor' ? 'Supervisors' : r).join(' + ') || 'No roles selected'}
                </span>
                {form.target_cities.length > 0 && <span style={{ color: C.gray }}> · Cities: <span style={{ color: C.yellow }}>{form.target_cities.join(', ')}</span></span>}
                {form.target_zone_ids.length > 0 && <span style={{ color: C.gray }}> · Zones: <span style={{ color: C.green }}>{form.target_zone_ids.length} selected</span></span>}
                {form.target_cities.length === 0 && form.target_zone_ids.length === 0 && <span style={{ color: C.gray }}> · All locations</span>}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCreate(false)} style={{ flex: 1, background: C.s3, border: `1px solid ${C.border}`, borderRadius: 12, padding: 13, color: C.gray, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !form.question.trim() || form.opts.filter(o => o.trim()).length < 2 || form.target_roles.length === 0}
                style={{ flex: 2, background: form.target_roles.length === 0 ? C.grayd : C.purple, border: 'none', borderRadius: 12, padding: 13, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne',sans-serif", boxShadow: '0 8px 24px rgba(155,110,255,0.28)', opacity: submitting ? 0.7 : 1, transition: 'all 0.15s' }}
              >
                {submitting ? 'Sending...' : '📡 Broadcast Question'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Question Card ──────────────────────────────────────────
function downloadCSV(q: BroadcastQuestion) {
  const rows = [
    ['Employee ID', 'Name', 'Answer', 'Correct?', 'Answered At'],
    ...(q.responses || []).map(r => [
      r.employee_id || '',
      r.user_name || '',
      r.selected_label || '',
      q.correct_option !== null ? (r.is_correct ? 'Yes' : 'No') : 'N/A',
      r.answered_at ? new Date(r.answered_at).toLocaleString('en-IN') : '',
    ]),
  ];
  const csv = rows.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `broadcast_${q.id.slice(0, 8)}_responses.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function QuestionCard({
  q, qi, expanded, onExpand, onDelete, onToggleStatus, closingId, isPlatformAdmin,
}: {
  q: BroadcastQuestion; qi: number; expanded: boolean;
  onExpand: () => void; onDelete: () => void;
  onToggleStatus: () => void; closingId: string | null;
  isPlatformAdmin: boolean;
}) {
  const total = q.tally?.reduce((a, t) => a + t.count, 0) || 0;
  const maxCount = q.tally ? Math.max(...q.tally.map(t => t.count), 1) : 1;
  const isClosed = q.status !== 'active';

  return (
    <div style={{ background: C.s2, border: `1px solid ${q.is_urgent && !isClosed ? C.red + '35' : C.border}`, borderRadius: 16, marginBottom: 12, overflow: 'hidden', opacity: isClosed ? 0.7 : 1 }}>
      {/* Card header */}
      <div style={{ padding: '18px 20px', cursor: 'pointer' }} onClick={onExpand}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: C.purple, fontWeight: 700 }}>Q{qi + 1} · {new Date(q.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
              {q.is_urgent && !isClosed && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(224,30,44,0.12)', color: C.red }}>URGENT</span>}
              {isClosed && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(122,138,160,0.12)', color: C.gray }}>CLOSED</span>}
              {q.deadline_at && !isClosed && <span style={{ fontSize: 10, color: C.yellow }}>Due {new Date(q.deadline_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 700, lineHeight: 1.4, marginBottom: 8 }}>{q.question}</div>
            <TargetSummary q={q} />
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: C.green }}>{q.response_count || 0}</div>
            <div style={{ fontSize: 10, color: C.gray }}>responses</div>
          </div>
        </div>
      </div>

      {/* Expanded — tally + responders */}
      {expanded && (
        <div style={{ padding: '0 20px 18px', borderTop: `1px solid ${C.border}` }}>
          {/* Tally bars */}
          <div style={{ paddingTop: 14, marginBottom: 14 }}>
            {q.tally && q.tally.length > 0 ? q.tally.map((t, i) => {
              const pct = total > 0 ? Math.round((t.count / total) * 100) : 0;
              const isCorrect = q.correct_option === t.index;
              return (
                <div key={i} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                    <span style={{ color: isCorrect ? C.green : C.gray, fontWeight: isCorrect ? 700 : 400 }}>
                      {isCorrect ? '✓ ' : ''}{t.label || `Option ${i + 1}`}
                    </span>
                    <span style={{ color: C.white, fontWeight: 700 }}>{t.count} ({pct}%)</span>
                  </div>
                  <div style={{ height: 7, background: C.s3, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${total > 0 ? (t.count / maxCount) * 100 : 0}%`, background: isCorrect ? C.green : C.blue, borderRadius: 4, transition: 'width 0.7s ease' }} />
                  </div>
                </div>
              );
            }) : (
              <div style={{ fontSize: 12, color: C.gray, textAlign: 'center', padding: '12px 0' }}>No responses yet</div>
            )}
          </div>

          {/* Responder list */}
          {q.responses && q.responses.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.grayd, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 8 }}>
                RESPONDENTS ({q.responses.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                {q.responses.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.s3, borderRadius: 9, padding: '8px 12px', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: C.blueD, border: `1px solid ${C.blue}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.blue }}>{(r.user_name || 'U').charAt(0).toUpperCase()}</span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.white, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.user_name || 'Unknown'}</div>
                        {r.employee_id && <div style={{ fontSize: 10, color: C.gray }}>{r.employee_id}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: q.correct_option !== null ? (r.is_correct ? 'rgba(0,217,126,0.1)' : 'rgba(224,30,44,0.08)') : C.blueD, color: q.correct_option !== null ? (r.is_correct ? C.green : C.red) : C.blue, fontWeight: 600 }}>
                        {r.selected_label}
                      </span>
                      {r.answered_at && <span style={{ fontSize: 10, color: C.grayd }}>{new Date(r.answered_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Options row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {q.options.map((opt, i) => (
              <div key={i} style={{ padding: '6px 12px', borderRadius: 9, border: `1px solid ${i === q.correct_option ? C.green + '40' : C.border}`, background: i === q.correct_option ? 'rgba(0,217,126,0.07)' : C.s3, fontSize: 12, color: i === q.correct_option ? C.green : C.gray }}>
                {i === q.correct_option ? '✓ ' : ''}{opt.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions footer */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '11px 16px', display: 'flex', gap: 8, background: C.s3 }}>
        <button
          onClick={onExpand}
          style={{ flex: 1, background: 'none', border: `1px solid ${C.border}`, borderRadius: 9, padding: '7px 12px', color: C.gray, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}
        >
          {expanded ? 'Hide Results' : 'View Results'}
        </button>
        {q.response_count > 0 && (
          <button
            onClick={() => downloadCSV(q)}
            style={{ background: 'rgba(62,158,255,0.08)', border: `1px solid ${C.blue}30`, borderRadius: 9, padding: '7px 12px', color: C.blue, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            ↓ CSV
          </button>
        )}
        {isPlatformAdmin && (
          <>
            <button
              onClick={onToggleStatus}
              disabled={closingId === q.id}
              style={{ flex: 1, background: isClosed ? 'rgba(0,217,126,0.08)' : 'rgba(255,184,0,0.08)', border: `1px solid ${isClosed ? C.green + '30' : C.yellow + '30'}`, borderRadius: 9, padding: '7px 12px', color: isClosed ? C.green : C.yellow, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}
            >
              {closingId === q.id ? '...' : isClosed ? 'Reopen' : 'Close'}
            </button>
            <button
              onClick={onDelete}
              style={{ background: C.redD, border: `1px solid ${C.redB}`, borderRadius: 9, padding: '7px 12px', color: C.red, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}

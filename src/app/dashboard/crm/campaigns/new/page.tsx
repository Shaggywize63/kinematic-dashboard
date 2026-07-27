'use client';
/**
 * CRM → Campaigns → New — WhatsApp broadcast create wizard (Phase 1).
 *
 * Pick an approved template → segment leads → map template variables to lead
 * fields → set pacing/schedule → preview the consent-gated audience → create the
 * campaign (as a draft, or create and start sending immediately).
 *
 * Wired to /api/v1/crm/broadcasts (+ /preview) and /api/v1/crm/whatsapp-templates.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  crmBroadcasts, crmWhatsappTemplates,
  type BroadcastAudience, type BroadcastVariableMap, type BroadcastPreview, type BroadcastSegment,
} from '../../../../../lib/crmApi';
import type { WhatsappTemplate } from '../../../../../types/crm';

const C = {
  s2: 'var(--s2)', s3: 'var(--s3)', s4: 'var(--s4)',
  border: 'var(--border)', white: 'var(--text)', gray: 'var(--textSec)', grayd: 'var(--textTert)',
  red: '#E01E2C', green: '#00D97E', blue: '#3E9EFF', amber: '#F5A623',
};
const card: React.CSSProperties = { background: C.s2, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 16 };
const input: React.CSSProperties = { width: '100%', background: 'var(--s4)', border: `1px solid ${C.border}`, padding: '9px 12px', borderRadius: 8, color: C.white, outline: 'none', fontSize: 13, boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 };
const btnPrimary: React.CSSProperties = { background: C.red, border: 'none', color: '#fff', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { background: C.s3, border: `1px solid ${C.border}`, color: C.white, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' };

const LEAD_FIELDS = ['full_name', 'first_name', 'last_name', 'company', 'city', 'state', 'country', 'phone', 'status', 'industry'];

// Split "a, b ,c" → ['a','b','c']; empty → undefined so we don't send empty arrays.
const splitList = (s: string): string[] | undefined => {
  const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
};
const detectVars = (body: string): string[] =>
  Array.from(new Set([...(body || '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1]))).sort((a, b) => Number(a) - Number(b));

export default function NewCampaignPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WhatsappTemplate[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(true);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [throttle, setThrottle] = useState(30);
  const [scheduleAt, setScheduleAt] = useState('');

  const [aud, setAud] = useState({ statuses: '', cities: '', states: '', tags: '', industries: '', min_score: '', search: '' });
  const [varMap, setVarMap] = useState<BroadcastVariableMap>({});
  const [segments, setSegments] = useState<BroadcastSegment[]>([]);

  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await crmWhatsappTemplates.list({ limit: 200 });
        setTemplates(r.data ?? []);
      } catch { /* none / no access */ }
      finally { setLoadingTpl(false); }
    })();
    crmBroadcasts.listSegments().then((r) => setSegments(r.data ?? [])).catch(() => {});
  }, []);

  // Populate the audience form from a saved segment.
  const applySegment = (seg: BroadcastSegment) => {
    const a = seg.audience || {};
    setAud({
      statuses: (a.statuses || []).join(', '), cities: (a.cities || []).join(', '), states: (a.states || []).join(', '),
      tags: (a.tags || []).join(', '), industries: (a.industries || []).join(', '),
      min_score: a.min_score != null ? String(a.min_score) : '', search: a.search || '',
    });
    setPreview(null);
  };
  const saveSegment = async () => {
    const segName = window.prompt('Save this audience as a segment. Name:');
    if (!segName?.trim()) return;
    try {
      await crmBroadcasts.createSegment({ name: segName.trim(), audience: buildAudience() });
      const r = await crmBroadcasts.listSegments(); setSegments(r.data ?? []);
      setMsg({ ok: true, text: `Saved segment "${segName.trim()}".` });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not save segment' }); }
  };

  const template = useMemo(() => templates.find((t) => t.id === templateId) || null, [templates, templateId]);
  const vars = useMemo(() => detectVars(template?.body_text || ''), [template]);

  // Seed variable defaults when the template changes: {{1}} → full name, rest literal.
  useEffect(() => {
    if (!template) { setVarMap({}); return; }
    setVarMap((prev) => {
      const next: BroadcastVariableMap = {};
      for (const k of detectVars(template.body_text || '')) {
        next[k] = prev[k] || (k === '1' ? { type: 'field', key: 'full_name' } : { type: 'literal', value: '' });
      }
      return next;
    });
  }, [template]);

  const buildAudience = useCallback((): BroadcastAudience => ({
    statuses: splitList(aud.statuses),
    cities: splitList(aud.cities),
    states: splitList(aud.states),
    tags: splitList(aud.tags),
    industries: splitList(aud.industries),
    min_score: aud.min_score.trim() ? Number(aud.min_score) : undefined,
    search: aud.search.trim() || undefined,
  }), [aud]);

  const runPreview = async () => {
    setPreviewing(true); setMsg(null);
    try {
      const r = await crmBroadcasts.preview({ audience: buildAudience(), variable_map: varMap, template_id: templateId || undefined });
      setPreview(r.data);
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Preview failed' }); }
    finally { setPreviewing(false); }
  };

  const create = async (launch: boolean) => {
    if (!name.trim()) { setMsg({ ok: false, text: 'Give the campaign a name.' }); return; }
    if (!templateId) { setMsg({ ok: false, text: 'Pick a template.' }); return; }
    setSaving(true); setMsg(null);
    try {
      const r = await crmBroadcasts.create({
        name: name.trim(),
        template_id: templateId,
        audience: buildAudience(),
        variable_map: varMap,
        throttle_per_min: throttle,
        scheduled_at: scheduleAt ? new Date(scheduleAt).toISOString() : null,
      });
      const id = r.data.id;
      if (launch) await crmBroadcasts.launch(id);
      router.push(`/dashboard/crm/campaigns/${id}`);
    } catch (e: any) { setMsg({ ok: false, text: e?.message || 'Could not create campaign' }); setSaving(false); }
  };

  const setVar = (k: string, patch: Partial<{ type: 'field' | 'literal'; key: string; value: string }>) =>
    setVarMap((m) => ({ ...m, [k]: { ...(m[k] || { type: 'literal' }), ...patch } }));

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.white, paddingBottom: 60, maxWidth: 820 }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/dashboard/crm/campaigns" style={{ color: C.gray, fontSize: 12, textDecoration: 'none' }}>← Campaigns</Link>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 800, margin: '6px 0 0' }}>New campaign</h1>
      </div>

      {/* 1 — Basics + template */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: C.blue }}>1 · Template</div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Campaign name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Diwali offer — Bihar leads" style={input} />
        </div>
        <span style={label}>WhatsApp template</span>
        {loadingTpl ? (
          <div style={{ color: C.gray, fontSize: 13 }}>Loading templates…</div>
        ) : templates.length === 0 ? (
          <div style={{ fontSize: 13, color: C.gray }}>
            No templates found. <Link href="/dashboard/settings/whatsapp" style={{ color: C.blue }}>Sync approved templates from Meta →</Link>
          </div>
        ) : (
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={input}>
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.meta_template_name} · {t.language} · {t.category}{t.status && t.status !== 'approved' ? ` (${t.status})` : ''}</option>
            ))}
          </select>
        )}
        {template && (
          <div style={{ marginTop: 14, background: 'var(--s4)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            {template.header_text && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{template.header_text}</div>}
            <div style={{ fontSize: 13, color: C.white, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{template.body_text}</div>
            {template.footer_text && <div style={{ fontSize: 11, color: C.grayd, marginTop: 8 }}>{template.footer_text}</div>}
            {template.buttons && template.buttons.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {template.buttons.map((b, i) => (
                  <span key={i} style={{ fontSize: 12, fontWeight: 700, color: C.blue, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 12px' }}>{b.text}</span>
                ))}
              </div>
            )}
            {template.status && template.status !== 'approved' && (
              <div style={{ fontSize: 11, color: C.amber, marginTop: 8 }}>⚠ This template is {template.status}. WhatsApp only delivers approved templates.</div>
            )}
          </div>
        )}
      </div>

      {/* 2 — Variables */}
      {template && vars.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: C.blue }}>2 · Personalisation</div>
          <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>Map each template variable to a lead field or a fixed value.</div>
          {vars.map((k) => {
            const v = varMap[k] || { type: 'literal' as const };
            return (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, minWidth: 44 }}>{`{{${k}}}`}</span>
                <select value={v.type} onChange={(e) => setVar(k, { type: e.target.value as 'field' | 'literal' })} style={{ ...input, width: 130 }}>
                  <option value="field">Lead field</option>
                  <option value="literal">Fixed text</option>
                </select>
                {v.type === 'field' ? (
                  <select value={v.key || 'full_name'} onChange={(e) => setVar(k, { key: e.target.value })} style={{ ...input, flex: 1, minWidth: 160 }}>
                    {LEAD_FIELDS.map((f) => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
                  </select>
                ) : (
                  <input value={v.value || ''} onChange={(e) => setVar(k, { value: e.target.value })} placeholder="Fixed value" style={{ ...input, flex: 1, minWidth: 160 }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 3 — Audience */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6, color: C.blue }}>3 · Audience</div>
        <div style={{ fontSize: 12, color: C.gray, marginBottom: 14 }}>
          Filter your leads. Leave everything blank to target every lead in scope. Only opted-in leads with a phone number are messaged — the rest are suppressed and shown below.
        </div>
        {segments.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <span style={label}>Load a saved segment</span>
            <select value="" onChange={(e) => { const s = segments.find((x) => x.id === e.target.value); if (s) applySegment(s); }} style={input}>
              <option value="">Select a segment…</option>
              {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div><span style={label}>Statuses <span style={{ color: C.grayd, textTransform: 'none' }}>(comma-sep)</span></span><input value={aud.statuses} onChange={(e) => setAud({ ...aud, statuses: e.target.value })} placeholder="new, qualified" style={input} /></div>
          <div><span style={label}>Tags <span style={{ color: C.grayd, textTransform: 'none' }}>(any of)</span></span><input value={aud.tags} onChange={(e) => setAud({ ...aud, tags: e.target.value })} placeholder="vip, retail" style={input} /></div>
          <div><span style={label}>Cities</span><input value={aud.cities} onChange={(e) => setAud({ ...aud, cities: e.target.value })} placeholder="Patna, Gaya" style={input} /></div>
          <div><span style={label}>States</span><input value={aud.states} onChange={(e) => setAud({ ...aud, states: e.target.value })} placeholder="Bihar" style={input} /></div>
          <div><span style={label}>Industries</span><input value={aud.industries} onChange={(e) => setAud({ ...aud, industries: e.target.value })} style={input} /></div>
          <div><span style={label}>Min score</span><input value={aud.min_score} onChange={(e) => setAud({ ...aud, min_score: e.target.value.replace(/[^0-9]/g, '') })} placeholder="0" style={input} /></div>
          <div style={{ gridColumn: '1 / -1' }}><span style={label}>Search <span style={{ color: C.grayd, textTransform: 'none' }}>(name / company / phone)</span></span><input value={aud.search} onChange={(e) => setAud({ ...aud, search: e.target.value })} style={input} /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={runPreview} disabled={previewing} style={{ ...btnGhost, cursor: previewing ? 'not-allowed' : 'pointer' }}>{previewing ? 'Checking…' : 'Preview audience'}</button>
          <button onClick={saveSegment} style={{ ...btnGhost, background: 'transparent' }}>Save as segment</button>
          {preview && (
            <span style={{ fontSize: 13, color: C.white }}>
              <b style={{ color: C.green }}>{preview.counts.eligible}</b> will receive
              <span style={{ color: C.grayd }}> · {preview.counts.candidates} matched · {preview.counts.not_opted_in} not opted-in · {preview.counts.opted_out} opted-out · {preview.counts.no_phone} no phone · {preview.counts.duplicate} duplicate{preview.counts.frequency_capped ? ` · ${preview.counts.frequency_capped} freq-capped` : ''}{preview.counts.suppressed ? ` · ${preview.counts.suppressed} suppressed` : ''}</span>
              {preview.est_cost != null && <span style={{ marginLeft: 6, color: C.amber, fontWeight: 700 }}>· est. {preview.cost_currency} {preview.est_cost.toFixed(2)}</span>}
            </span>
          )}
        </div>
        {preview && preview.sample.length > 0 && (
          <div style={{ marginTop: 12, background: 'var(--s4)', border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 11, color: C.gray, marginBottom: 6, fontWeight: 700 }}>SAMPLE RECIPIENTS</div>
            {preview.sample.slice(0, 8).map((s) => (
              <div key={s.lead_id} style={{ fontSize: 12, color: C.gray, display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                <span>{s.name}</span><span style={{ color: C.grayd }}>{s.phone}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4 — Pacing */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: C.blue }}>4 · Pacing & schedule</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <span style={label}>Messages per minute</span>
            <input value={throttle} onChange={(e) => setThrottle(Math.max(1, Math.min(600, Number(e.target.value.replace(/[^0-9]/g, '') || 1))))} style={input} />
            <div style={{ fontSize: 11, color: C.grayd, marginTop: 4 }}>Lower is safer for a new number&apos;s quality rating.</div>
          </div>
          <div>
            <span style={label}>Schedule <span style={{ color: C.grayd, textTransform: 'none' }}>(optional)</span></span>
            <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} style={input} />
            <div style={{ fontSize: 11, color: C.grayd, marginTop: 4 }}>Leave blank to send as soon as you launch.</div>
          </div>
        </div>
      </div>

      {msg && <div style={{ ...card, padding: '12px 16px', background: msg.ok ? 'rgba(0,217,126,0.10)' : 'rgba(224,30,44,0.10)', borderColor: msg.ok ? 'rgba(0,217,126,0.3)' : 'rgba(224,30,44,0.3)', color: msg.ok ? C.green : C.red, fontSize: 13 }}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={() => create(true)} disabled={saving} style={{ ...btnPrimary, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Working…' : (scheduleAt ? 'Create & schedule' : 'Create & send now')}</button>
        <button onClick={() => create(false)} disabled={saving} style={{ ...btnGhost, cursor: saving ? 'not-allowed' : 'pointer' }}>Save as draft</button>
      </div>
      <div style={{ fontSize: 12, color: C.gray, marginTop: 14, lineHeight: 1.6 }}>
        Messages only leave the building once <Link href="/dashboard/settings/whatsapp" style={{ color: C.blue }}>Settings → WhatsApp</Link> has an active connection. A draft can be launched later from its detail page.
      </div>
    </div>
  );
}

'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { crmLeadFormAI, type KiniClarifyingQuestion, type KiniProposedField } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';

// The field types KINI proposes and the admin can switch between in the
// preview editor — the directly-inputtable subset (no lookup / formula /
// image / file, which need extra config the wizard doesn't collect).
const EDITABLE_TYPES: Array<{ value: CustomField['field_type']; label: string }> = [
  { value: 'text',        label: 'Text (single line)' },
  { value: 'longtext',    label: 'Long text (paragraph)' },
  { value: 'number',      label: 'Number' },
  { value: 'currency',    label: 'Currency (₹)' },
  { value: 'boolean',     label: 'Checkbox (yes / no)' },
  { value: 'date',        label: 'Date' },
  { value: 'datetime',    label: 'Date & time' },
  { value: 'select',      label: 'Dropdown (single)' },
  { value: 'multiselect', label: 'Multi-select chips' },
  { value: 'radio',       label: 'Radio buttons' },
  { value: 'url',         label: 'URL' },
  { value: 'email',       label: 'Email' },
  { value: 'phone',       label: 'Phone' },
];
const OPTION_TYPES = new Set<CustomField['field_type']>(['select', 'multiselect', 'radio']);

type EditableField = {
  uid: string;
  field_key: string;
  label: string;
  field_type: CustomField['field_type'];
  required: boolean;
  optionsRaw: string;
  help?: string;
};

function normaliseKey(raw: string): string {
  let k = raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (k && !/^[a-z]/.test(k)) k = `f_${k}`;
  return k.slice(0, 80).replace(/_+$/g, '');
}

export default function KiniFormBuilder({
  entity,
  existingKeys,
  onClose,
  onAccept,
}: {
  entity: CustomField['entity_type'];
  existingKeys: string[];
  onClose: () => void;
  onAccept: (fields: KiniProposedField[]) => Promise<void>;
}) {
  const [step, setStep] = useState<'prompt' | 'clarify' | 'preview'>('prompt');
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState('');

  const [industry, setIndustry] = useState('');
  const [promptSummary, setPromptSummary] = useState('');
  const [questions, setQuestions] = useState<KiniClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [formTitle, setFormTitle] = useState('');
  const [genSummary, setGenSummary] = useState('');
  const [fields, setFields] = useState<EditableField[]>([]);
  const [accepting, setAccepting] = useState(false);

  const uidRef = useRef(0);
  const nextUid = () => `f${uidRef.current++}`;
  const existingLower = new Set(existingKeys.map((k) => k.toLowerCase()));

  const entityLabel = entity === 'deal' ? 'deal' : entity;

  const askQuestions = async () => {
    if (!problem.trim()) return toast.error('Describe what you want to capture first');
    setLoading(true);
    try {
      const res = await crmLeadFormAI.questions({ problem_statement: problem.trim(), entity_type: entity });
      const d = res.data;
      setIndustry(d.industry || '');
      setPromptSummary(d.summary || '');
      setQuestions(d.questions || []);
      setAnswers({});
      setStep('clarify');
    } catch (e: any) {
      toast.error(e?.message || 'KINI could not analyse that — try rephrasing');
    } finally {
      setLoading(false);
    }
  };

  const runGenerate = async () => {
    setLoading(true);
    try {
      const answerList = questions
        .map((q) => ({ question: q.question, answer: (answers[q.id] || '').trim() }))
        .filter((a) => a.answer);
      const res = await crmLeadFormAI.generate({
        problem_statement: problem.trim(),
        entity_type: entity,
        answers: answerList,
      });
      const d = res.data;
      setFormTitle(d.formTitle || '');
      setGenSummary(d.summary || '');
      setFields(
        (d.fields || []).map((f) => ({
          uid: nextUid(),
          field_key: f.field_key,
          label: f.label,
          field_type: f.field_type,
          required: !!f.required,
          optionsRaw: (f.options || []).join(', '),
          help: f.help,
        })),
      );
      setStep('preview');
      if (!d.fields || d.fields.length === 0) toast.error('KINI returned no fields — try adding more detail');
    } catch (e: any) {
      toast.error(e?.message || 'KINI could not build the form — try again');
    } finally {
      setLoading(false);
    }
  };

  const patchField = (uid: string, patch: Partial<EditableField>) =>
    setFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, ...patch } : f)));
  const removeField = (uid: string) => setFields((prev) => prev.filter((f) => f.uid !== uid));
  const addBlankField = () =>
    setFields((prev) => [
      ...prev,
      { uid: nextUid(), field_key: '', label: '', field_type: 'text', required: false, optionsRaw: '' },
    ]);

  const accept = async () => {
    // Final client-side validation + dedupe before we hand fields to the
    // parent's create loop. Keys are normalised; anything colliding with an
    // existing field or an earlier row in this batch is reported, not silently
    // dropped, so the admin knows why a field didn't land.
    const seen = new Set<string>();
    const payload: KiniProposedField[] = [];
    const problems: string[] = [];
    for (const f of fields) {
      const label = f.label.trim();
      if (!label) { problems.push('A field is missing its label'); continue; }
      const key = normaliseKey(f.field_key.trim() || label);
      if (!key) { problems.push(`"${label}" has no valid key`); continue; }
      if (existingLower.has(key)) { problems.push(`"${label}" (${key}) already exists on ${entityLabel}`); continue; }
      if (seen.has(key)) { problems.push(`Duplicate key "${key}" — rename one`); continue; }
      const options = OPTION_TYPES.has(f.field_type)
        ? f.optionsRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined;
      if (OPTION_TYPES.has(f.field_type) && (!options || options.length === 0)) {
        problems.push(`"${label}" is a picker but has no options`); continue;
      }
      seen.add(key);
      payload.push({ field_key: key, label, field_type: f.field_type, required: f.required, options });
    }
    if (problems.length) { toast.error(problems[0]); return; }
    if (payload.length === 0) { toast.error('No valid fields to add'); return; }
    setAccepting(true);
    try {
      await onAccept(payload);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Could not add the fields');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div style={overlay} onClick={(e) => { if (e.target === e.currentTarget && !loading && !accepting) onClose(); }}>
      <div style={panel}>
        {/* Header */}
        <div style={header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={sparkle}>✨</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Build the {entityLabel} form with KINI AI</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                Describe your business → answer a few questions → review &amp; add the fields
              </div>
            </div>
          </div>
          <button onClick={onClose} disabled={loading || accepting} style={closeBtn}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 6, padding: '10px 20px 0' }}>
          {(['prompt', 'clarify', 'preview'] as const).map((s, i) => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: stepIndex(step) >= i ? 'var(--primary)' : 'var(--border)' }} />
          ))}
        </div>

        <div style={body}>
          {/* STEP 1 — problem statement */}
          {step === 'prompt' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>What should this form capture?</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                Write a plain-English problem statement. KINI will infer your industry and ask a few
                clarifying questions before designing a comprehensive set of fields.
              </div>
              <textarea
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                placeholder={`e.g. I run a rooftop solar installer. When a homeowner enquires I need to capture their property type, monthly electricity bill, roof area and shading, preferred installation timeline, and financing interest so my team can qualify and quote.`}
                rows={6}
                style={{ ...input, width: '100%', resize: 'vertical', lineHeight: 1.5 }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} type="button" onClick={() => setProblem(ex.text)} style={chip}>
                    {ex.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <button onClick={onClose} style={btnGhost}>Cancel</button>
                <button onClick={askQuestions} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'KINI is thinking…' : 'Ask KINI →'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — clarifying questions */}
          {step === 'clarify' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(industry || promptSummary) && (
                <div style={infoCard}>
                  {industry && <div style={{ fontSize: 12, color: 'var(--text)' }}><strong>Detected industry:</strong> {industry}</div>}
                  {promptSummary && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{promptSummary}</div>}
                </div>
              )}
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>A few questions to tailor your form</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Answer what you can — you can skip any and KINI will use sensible defaults.</div>
              {questions.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No questions — go straight to generating.</div>}
              {questions.map((q) => (
                <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)' }}>
                    {q.question}
                    <span style={{ ...tag, background: q.kind === 'industry' ? 'var(--primary)' : 'var(--s3)', color: q.kind === 'industry' ? '#fff' : 'var(--text-dim)' }}>
                      {q.kind}
                    </span>
                  </div>
                  {q.help && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{q.help}</div>}
                  <input
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                    placeholder="Your answer (optional)"
                    style={{ ...input, width: '100%' }}
                  />
                  {q.suggestions && q.suggestions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {q.suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] ? `${a[q.id]}, ${s}` : s }))}
                          style={suggestChip}
                        >
                          + {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4 }}>
                <button onClick={() => setStep('prompt')} disabled={loading} style={btnGhost}>← Back</button>
                <button onClick={runGenerate} disabled={loading} style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
                  {loading ? 'Designing your form…' : 'Generate form →'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — editable preview */}
          {step === 'preview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={infoCard}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{formTitle || 'Proposed form'}</div>
                {genSummary && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{genSummary}</div>}
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                  {fields.length} field{fields.length === 1 ? '' : 's'} — edit anything below, then add them to <strong>{entityLabel}</strong>. Nothing is saved until you click Add.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fields.map((f, idx) => (
                  <div key={f.uid} style={fieldCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontWeight: 700, minWidth: 18 }}>{idx + 1}.</span>
                      <input
                        value={f.label}
                        onChange={(e) => patchField(f.uid, { label: e.target.value })}
                        placeholder="Field label"
                        style={{ ...input, flex: 1, fontWeight: 600 }}
                      />
                      <button onClick={() => removeField(f.uid)} title="Remove" style={removeBtn}>✕</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
                      <input
                        value={f.field_key}
                        onChange={(e) => patchField(f.uid, { field_key: e.target.value.toLowerCase() })}
                        onBlur={(e) => patchField(f.uid, { field_key: normaliseKey(e.target.value) })}
                        placeholder="field_key"
                        style={{ ...input, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 }}
                      />
                      <select
                        value={f.field_type}
                        onChange={(e) => patchField(f.uid, { field_type: e.target.value as CustomField['field_type'] })}
                        style={input}
                      >
                        {EDITABLE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                        <input type="checkbox" checked={f.required} onChange={(e) => patchField(f.uid, { required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                    {OPTION_TYPES.has(f.field_type) && (
                      <input
                        value={f.optionsRaw}
                        onChange={(e) => patchField(f.uid, { optionsRaw: e.target.value })}
                        placeholder="Comma-separated options (e.g. Hot, Warm, Cold)"
                        style={{ ...input, width: '100%', marginTop: 8 }}
                      />
                    )}
                    {f.help && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>{f.help}</div>}
                  </div>
                ))}
              </div>

              <button onClick={addBlankField} style={{ ...btnGhost, alignSelf: 'flex-start' }}>+ Add another field</button>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setStep('clarify')} disabled={accepting} style={btnGhost}>← Back</button>
                  <button onClick={runGenerate} disabled={loading || accepting} style={btnGhost}>
                    {loading ? 'Regenerating…' : '↻ Regenerate'}
                  </button>
                </div>
                <button onClick={accept} disabled={accepting || fields.length === 0} style={{ ...btnPrimary, opacity: accepting || fields.length === 0 ? 0.6 : 1 }}>
                  {accepting ? 'Adding…' : `✓ Add ${fields.length} field${fields.length === 1 ? '' : 's'} to ${entityLabel}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function stepIndex(s: 'prompt' | 'clarify' | 'preview') {
  return s === 'prompt' ? 0 : s === 'clarify' ? 1 : 2;
}

const EXAMPLES: Array<{ label: string; text: string }> = [
  { label: '🏠 Real estate', text: 'I sell residential apartments. For each enquiry I want to capture budget range, preferred locality, apartment configuration (1/2/3 BHK), purchase timeline, whether they need a home loan, and how they heard about us.' },
  { label: '🏥 Healthcare clinic', text: 'We run a dental clinic. For every new patient enquiry I need their reason for visit, preferred appointment time, insurance provider, whether they were referred, and any existing dental conditions.' },
  { label: '🚗 Auto dealership', text: 'I run a car dealership. For each lead I want the model of interest, budget, whether they have a vehicle to exchange, financing needs, and their expected purchase date.' },
];

// ── styles (inline, matching the dashboard's CSS-var convention) ────────────
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto',
};
const panel: React.CSSProperties = {
  background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 16,
  width: '100%', maxWidth: 760, boxShadow: '0 24px 60px rgba(0,0,0,0.4)', overflow: 'hidden',
};
const header: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px', background: 'linear-gradient(135deg, var(--primary), #7c3aed)',
};
const sparkle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
};
const closeBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', fontSize: 22,
  width: 32, height: 32, borderRadius: 8, cursor: 'pointer', lineHeight: 1,
};
const body: React.CSSProperties = { padding: 20, maxHeight: '70vh', overflowY: 'auto' };
const input: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '8px 12px', borderRadius: 8, fontSize: 13,
};
const btnPrimary: React.CSSProperties = {
  background: 'var(--primary)', border: 'none', color: '#fff', padding: '9px 16px',
  borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13,
};
const btnGhost: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)',
  padding: '9px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
};
const chip: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
  border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', fontWeight: 600,
};
const suggestChip: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 999, fontSize: 11, cursor: 'pointer',
  border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-dim)', fontWeight: 600,
};
const infoCard: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12,
};
const fieldCard: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12,
};
const removeBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)',
  width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 13, flexShrink: 0,
};
const tag: React.CSSProperties = {
  marginLeft: 8, padding: '1px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, verticalAlign: 'middle',
};

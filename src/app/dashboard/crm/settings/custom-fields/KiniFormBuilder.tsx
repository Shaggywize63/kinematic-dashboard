'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Sparkles, X, ArrowRight, ArrowLeft, Check, CheckCircle2, RefreshCw, Plus,
  Loader2, Lightbulb, Wand2, GripVertical,
  Type as TypeIcon, AlignLeft, Hash, IndianRupee, ToggleLeft,
  Calendar, Clock, List, ListChecks, CircleDot, Link2, Mail, Phone,
  type LucideIcon,
} from 'lucide-react';
import { crmLeadFormAI, type KiniClarifyingQuestion, type KiniProposedField } from '../../../../../lib/crmApi';
import type { CustomField } from '../../../../../types/crm';
import KiniMascot from './KiniMascot';

type FieldType = CustomField['field_type'];

// Per-type presentation — icon + soft accent used across the type picker and
// the preview field cards so each field reads at a glance.
const TYPE_META: Partial<Record<FieldType, { icon: LucideIcon; label: string; accent: string }>> = {
  text:        { icon: TypeIcon,   label: 'Text',         accent: '#E5202B' },
  longtext:    { icon: AlignLeft,  label: 'Long text',    accent: '#E5202B' },
  number:      { icon: Hash,       label: 'Number',       accent: '#10b981' },
  currency:    { icon: IndianRupee, label: 'Currency',    accent: '#10b981' },
  boolean:     { icon: ToggleLeft, label: 'Yes / no',     accent: '#E5202B' },
  date:        { icon: Calendar,   label: 'Date',         accent: '#F59E0B' },
  datetime:    { icon: Clock,      label: 'Date & time',  accent: '#F59E0B' },
  select:      { icon: List,       label: 'Dropdown',     accent: '#F7B538' },
  multiselect: { icon: ListChecks, label: 'Multi-select', accent: '#F7B538' },
  radio:       { icon: CircleDot,  label: 'Radio',        accent: '#F7B538' },
  url:         { icon: Link2,      label: 'URL',          accent: '#6B7280' },
  email:       { icon: Mail,       label: 'Email',        accent: '#6B7280' },
  phone:       { icon: Phone,      label: 'Phone',        accent: '#6B7280' },
};
const EDITABLE_TYPES: FieldType[] = [
  'text', 'longtext', 'number', 'currency', 'boolean', 'date', 'datetime',
  'select', 'multiselect', 'radio', 'url', 'email', 'phone',
];
const OPTION_TYPES = new Set<FieldType>(['select', 'multiselect', 'radio']);

type EditableField = {
  uid: string;
  field_key: string;
  label: string;
  field_type: FieldType;
  required: boolean;
  options: string[];
  help?: string;
};

const STEPS: Array<{ key: 'prompt' | 'clarify' | 'preview'; label: string }> = [
  { key: 'prompt', label: 'Describe' },
  { key: 'clarify', label: 'Refine' },
  { key: 'preview', label: 'Review' },
];

const THINKING: Record<'questions' | 'generate', string[]> = {
  questions: ['Reading your brief…', 'Inferring your industry…', 'Preparing a few smart questions…'],
  generate: ['Understanding your requirements…', 'Designing the field set…', 'Choosing the right input types…', 'Finalising your form…'],
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
  const [loading, setLoading] = useState<null | 'questions' | 'generate'>(null);
  const [problem, setProblem] = useState('');

  const [industry, setIndustry] = useState('');
  const [promptSummary, setPromptSummary] = useState('');
  const [questions, setQuestions] = useState<KiniClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [formTitle, setFormTitle] = useState('');
  const [genSummary, setGenSummary] = useState('');
  const [fields, setFields] = useState<EditableField[]>([]);
  const [optDraft, setOptDraft] = useState<Record<string, string>>({});
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(0); // >0 → success screen showing N added

  const [msgIdx, setMsgIdx] = useState(0);
  const uidRef = useRef(0);
  const nextUid = () => `f${uidRef.current++}`;
  const existingLower = new Set(existingKeys.map((k) => k.toLowerCase()));
  const entityLabel = entity;

  // Esc closes (unless mid-flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading && !accepting) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, accepting, onClose]);

  // Cycle the "thinking" copy while a request is in flight.
  useEffect(() => {
    if (!loading) return;
    setMsgIdx(0);
    const list = THINKING[loading];
    const t = window.setInterval(() => setMsgIdx((i) => (i + 1) % list.length), 1500);
    return () => window.clearInterval(t);
  }, [loading]);

  const askQuestions = async () => {
    if (!problem.trim()) return toast.error('Describe what you want to capture first');
    setLoading('questions');
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
      setLoading(null);
    }
  };

  const runGenerate = async () => {
    setLoading('generate');
    try {
      const answerList = questions
        .map((q) => ({ question: q.question, answer: (answers[q.id] || '').trim() }))
        .filter((a) => a.answer);
      const res = await crmLeadFormAI.generate({ problem_statement: problem.trim(), entity_type: entity, answers: answerList });
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
          options: f.options || [],
          help: f.help,
        })),
      );
      setStep('preview');
      if (!d.fields || d.fields.length === 0) toast.error('KINI returned no fields — add more detail and regenerate');
    } catch (e: any) {
      toast.error(e?.message || 'KINI could not build the form — try again');
    } finally {
      setLoading(null);
    }
  };

  const patch = (uid: string, p: Partial<EditableField>) =>
    setFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, ...p } : f)));
  const removeField = (uid: string) => setFields((prev) => prev.filter((f) => f.uid !== uid));
  const addBlank = () =>
    setFields((prev) => [...prev, { uid: nextUid(), field_key: '', label: '', field_type: 'text', required: false, options: [] }]);
  const addOption = (uid: string) => {
    const v = (optDraft[uid] || '').trim();
    if (!v) return;
    setFields((prev) => prev.map((f) => (f.uid === uid && !f.options.includes(v) ? { ...f, options: [...f.options, v] } : f)));
    setOptDraft((d) => ({ ...d, [uid]: '' }));
  };
  const removeOption = (uid: string, opt: string) =>
    setFields((prev) => prev.map((f) => (f.uid === uid ? { ...f, options: f.options.filter((o) => o !== opt) } : f)));

  const accept = async () => {
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
      if (OPTION_TYPES.has(f.field_type) && f.options.length === 0) { problems.push(`"${label}" is a picker but has no options`); continue; }
      seen.add(key);
      payload.push({
        field_key: key, label, field_type: f.field_type, required: f.required,
        options: OPTION_TYPES.has(f.field_type) ? f.options : undefined,
      });
    }
    if (problems.length) return toast.error(problems[0]);
    if (payload.length === 0) return toast.error('No valid fields to add');
    setAccepting(true);
    try {
      await onAccept(payload);
      setDone(payload.length);
      import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 130, spread: 80, origin: { y: 0.5 }, colors: ['#E5202B', '#FF6B57', '#F7B538', '#10b981', '#FFFFFF'] });
      }).catch(() => { /* decorative */ });
      window.setTimeout(onClose, 1400);
    } catch (e: any) {
      toast.error(e?.message || 'Could not add the fields');
      setAccepting(false);
    }
  };

  const activeIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <motion.div
      style={overlay}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading && !accepting) onClose(); }}
    >
      <motion.div
        style={panel}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Header */}
        <div style={header}>
          <motion.div
            aria-hidden style={shine}
            animate={{ x: ['-120%', '220%'] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
            <motion.div
              style={orb}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <KiniMascot size={34} />
            </motion.div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', letterSpacing: 0.2 }}>
                Build the {entityLabel} form with KINI AI
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
                Describe your business → answer a few questions → review &amp; add
              </div>
            </div>
          </div>
          <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.94 }} onClick={onClose} disabled={!!loading || accepting} style={closeBtn}>
            <X size={18} />
          </motion.button>
        </div>

        {/* Step rail */}
        <div style={rail}>
          {STEPS.map((s, i) => {
            const state = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo';
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <motion.div
                    animate={{
                      background: state === 'todo' ? 'var(--s3)' : 'var(--primary)',
                      color: state === 'todo' ? 'var(--text-dim)' : '#fff',
                      scale: state === 'active' ? 1.06 : 1,
                    }}
                    style={railDot}
                  >
                    {state === 'done' ? <Check size={13} /> : i + 1}
                  </motion.div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: state === 'todo' ? 'var(--text-dim)' : 'var(--text)' }}>{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={railLine}>
                    <motion.div style={railFill} animate={{ width: i < activeIdx ? '100%' : '0%' }} transition={{ duration: 0.4 }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div style={body}>
          <AnimatePresence mode="wait">
            {/* SUCCESS */}
            {done > 0 ? (
              <motion.div key="done" style={centerCol} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }} style={successRing}>
                  <CheckCircle2 size={40} color="#10b981" />
                </motion.div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginTop: 14 }}>
                  Added {done} field{done === 1 ? '' : 's'} to {entityLabel} 🎉
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>Your form is ready — they’re live on the {entityLabel} form now.</div>
              </motion.div>
            ) : loading ? (
              /* THINKING */
              <motion.div key={`load-${loading}`} style={centerCol} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div style={thinkOrb} animate={{ scale: [1, 1.1, 1], boxShadow: ['0 0 0 0 rgba(229,32,43,0.5)', '0 0 0 18px rgba(229,32,43,0)', '0 0 0 0 rgba(229,32,43,0)'] }} transition={{ duration: 1.8, repeat: Infinity }}>
                  <KiniMascot size={46} />
                </motion.div>
                <div style={{ height: 22, marginTop: 18, overflow: 'hidden', position: 'relative', width: '100%', textAlign: 'center' }}>
                  <AnimatePresence mode="wait">
                    <motion.div key={msgIdx} initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.3 }} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>
                      {THINKING[loading][msgIdx]}
                    </motion.div>
                  </AnimatePresence>
                </div>
                <div style={shimmerTrack}><motion.div style={shimmerBar} animate={{ x: ['-60%', '160%'] }} transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }} /></div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>KINI is on it — this usually takes a few seconds.</div>
              </motion.div>
            ) : step === 'prompt' ? (
              /* STEP 1 */
              <motion.div key="prompt" style={col} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.28 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>What should this form capture?</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.55 }}>
                  Write a plain-English brief. KINI infers your industry, asks a few clarifying questions, then designs a comprehensive set of fields — you review everything before anything is saved.
                </div>
                <textarea
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  autoFocus
                  placeholder={`e.g. I run a rooftop solar installer. When a homeowner enquires I want to capture their property type, monthly electricity bill, roof area and shading, preferred installation timeline, and financing interest so my team can qualify and quote.`}
                  rows={6}
                  style={textarea}
                />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Try an example</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {EXAMPLES.map((ex, i) => (
                      <motion.button
                        key={ex.label} type="button" onClick={() => setProblem(ex.text)}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
                        whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }} style={chip}
                      >
                        {ex.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
                <div style={footer}>
                  <button onClick={onClose} style={btnGhost}>Cancel</button>
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={askQuestions} style={btnPrimary}>
                    <Wand2 size={15} /> Ask KINI <ArrowRight size={15} />
                  </motion.button>
                </div>
              </motion.div>
            ) : step === 'clarify' ? (
              /* STEP 2 */
              <motion.div key="clarify" style={col} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.28 }}>
                {(industry || promptSummary) && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ ...infoCard, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ ...iconChip, background: 'rgba(229,32,43,0.14)' }}><Lightbulb size={15} color="#E5202B" /></div>
                    <div>
                      {industry && <div style={{ fontSize: 12.5, color: 'var(--text)' }}><strong>Detected industry:</strong> {industry}</div>}
                      {promptSummary && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{promptSummary}</div>}
                    </div>
                  </motion.div>
                )}
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>A few questions to tailor your form</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Answer what you can — skip any and KINI uses sensible defaults.</div>
                {questions.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>No questions — go straight to generating.</div>}
                {questions.map((q, i) => (
                  <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>{q.question}</span>
                      <span style={{ ...kindTag, background: q.kind === 'industry' ? 'rgba(229,32,43,0.14)' : 'rgba(107,114,128,0.16)', color: q.kind === 'industry' ? '#E5202B' : '#6B7280' }}>
                        {q.kind}
                      </span>
                    </div>
                    {q.help && <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{q.help}</div>}
                    <input value={answers[q.id] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} placeholder="Your answer (optional)" style={input} />
                    {q.suggestions && q.suggestions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {q.suggestions.map((s) => {
                          const on = (answers[q.id] || '').split(',').map((x) => x.trim()).includes(s);
                          return (
                            <motion.button key={s} type="button" whileTap={{ scale: 0.95 }}
                              onClick={() => setAnswers((a) => ({ ...a, [q.id]: a[q.id] ? `${a[q.id]}, ${s}` : s }))}
                              style={{ ...suggestChip, borderStyle: on ? 'solid' : 'dashed', color: on ? 'var(--primary)' : 'var(--text-dim)', borderColor: on ? 'var(--primary)' : 'var(--border)' }}>
                              {on ? '✓ ' : '+ '}{s}
                            </motion.button>
                          );
                        })}
                      </div>
                    )}
                  </motion.div>
                ))}
                <div style={{ ...footer, justifyContent: 'space-between' }}>
                  <button onClick={() => setStep('prompt')} style={btnGhost}><ArrowLeft size={15} /> Back</button>
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={runGenerate} style={btnPrimary}>
                    <Sparkles size={15} /> Generate form <ArrowRight size={15} />
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              /* STEP 3 */
              <motion.div key="preview" style={col} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.28 }}>
                <div style={{ ...infoCard, borderLeft: '3px solid var(--primary)' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{formTitle || 'Proposed form'}</div>
                  {genSummary && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{genSummary}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8 }}>
                    <strong style={{ color: 'var(--text)' }}>{fields.length} field{fields.length === 1 ? '' : 's'}</strong> — edit anything, then add them to <strong>{entityLabel}</strong>. Nothing is saved until you click Add.
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <AnimatePresence initial={false}>
                    {fields.map((f, idx) => {
                      const meta = TYPE_META[f.field_type];
                      const Icon = meta?.icon || TypeIcon;
                      const accent = meta?.accent || 'var(--primary)';
                      return (
                        <motion.div
                          key={f.uid} layout
                          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30, height: 0, marginTop: -10 }}
                          transition={{ duration: 0.25, delay: Math.min(idx, 8) * 0.03 }}
                          whileHover={{ y: -2 }} style={fieldCard}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <GripVertical size={14} style={{ color: 'var(--text-dim)', opacity: 0.5, flexShrink: 0 }} />
                            <div style={{ ...iconChip, background: `${accent}22`, flexShrink: 0 }}><Icon size={15} color={accent} /></div>
                            <input value={f.label} onChange={(e) => patch(f.uid, { label: e.target.value })} placeholder="Field label" style={labelInput} />
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => removeField(f.uid)} title="Remove" style={removeBtn}><X size={14} /></motion.button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, paddingLeft: 30 }}>
                            <input value={f.field_key} onChange={(e) => patch(f.uid, { field_key: e.target.value.toLowerCase() })} onBlur={(e) => patch(f.uid, { field_key: normaliseKey(e.target.value) })} placeholder="field_key" style={keyInput} />
                            <select value={f.field_type} onChange={(e) => patch(f.uid, { field_type: e.target.value as FieldType })} style={input}>
                              {EDITABLE_TYPES.map((t) => <option key={t} value={t}>{TYPE_META[t]?.label || t}</option>)}
                            </select>
                            <button type="button" onClick={() => patch(f.uid, { required: !f.required })} style={{ ...switchWrap, justifyContent: 'flex-start' }}>
                              <span style={{ ...switchTrack, background: f.required ? 'var(--primary)' : 'var(--border)' }}>
                                <motion.span layout style={switchThumb} animate={{ x: f.required ? 16 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
                              </span>
                              <span style={{ fontSize: 12, color: 'var(--text)' }}>Required</span>
                            </button>
                          </div>
                          {OPTION_TYPES.has(f.field_type) && (
                            <div style={{ paddingLeft: 30, marginTop: 8 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                {f.options.map((o) => (
                                  <span key={o} style={optionChip}>
                                    {o}
                                    <button onClick={() => removeOption(f.uid, o)} style={optionX}><X size={11} /></button>
                                  </span>
                                ))}
                                <input
                                  value={optDraft[f.uid] || ''}
                                  onChange={(e) => setOptDraft((d) => ({ ...d, [f.uid]: e.target.value }))}
                                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addOption(f.uid); } }}
                                  onBlur={() => addOption(f.uid)}
                                  placeholder={f.options.length ? 'Add option…' : 'Type an option, press Enter'}
                                  style={{ ...input, flex: 1, minWidth: 130, fontSize: 12 }}
                                />
                              </div>
                            </div>
                          )}
                          {f.help && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 8, paddingLeft: 30 }}>{f.help}</div>}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.98 }} onClick={addBlank} style={{ ...btnGhost, alignSelf: 'flex-start' }}>
                  <Plus size={15} /> Add another field
                </motion.button>

                <div style={{ ...footer, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setStep('clarify')} disabled={accepting} style={btnGhost}><ArrowLeft size={15} /> Back</button>
                    <button onClick={runGenerate} disabled={accepting} style={btnGhost}><RefreshCw size={15} /> Regenerate</button>
                  </div>
                  <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} onClick={accept} disabled={accepting || fields.length === 0} style={{ ...btnPrimary, opacity: accepting || fields.length === 0 ? 0.7 : 1 }}>
                    {accepting ? <><Loader2 size={15} className="kini-spin" /> Adding…</> : <><Check size={15} /> Add {fields.length} field{fields.length === 1 ? '' : 's'}</>}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      <style>{`@keyframes kini-spin{to{transform:rotate(360deg)}}.kini-spin{animation:kini-spin 0.9s linear infinite}`}</style>
    </motion.div>
  );
}

const EXAMPLES: Array<{ label: string; text: string }> = [
  { label: '🏠 Real estate', text: 'I sell residential apartments. For each enquiry I want to capture budget range, preferred locality, apartment configuration (1/2/3 BHK), purchase timeline, whether they need a home loan, and how they heard about us.' },
  { label: '🏥 Dental clinic', text: 'We run a dental clinic. For every new patient enquiry I need their reason for visit, preferred appointment time, insurance provider, whether they were referred, and any existing dental conditions.' },
  { label: '🚗 Car dealership', text: 'I run a car dealership. For each lead I want the model of interest, budget, whether they have a vehicle to exchange, financing needs, and their expected purchase date.' },
  { label: '☀️ Solar installer', text: 'Rooftop solar installer. Capture property type, average monthly electricity bill, roof area, shading, whether they own the property, preferred timeline, and financing interest.' },
  { label: '🎓 Coaching / EdTech', text: 'We run a test-prep coaching institute. For each enquiry capture the course of interest, target exam and year, current grade/level, preferred batch timing (online/offline), the student’s city, and parent contact.' },
  { label: '💪 Gym / fitness', text: 'I run a fitness studio. For each lead capture their fitness goal, preferred membership plan, prior gym experience, any medical conditions, preferred workout timing, and how they heard about us.' },
  { label: '🛡️ Insurance advisor', text: 'I’m an insurance advisor. For each prospect capture the policy type of interest (term/health/motor/ULIP), age, annual income band, number of dependents, existing cover, and preferred premium budget.' },
  { label: '🛋️ Interior design', text: 'Interior design firm. For each enquiry capture property type, carpet area, rooms to design, design style preference, budget range, possession/move-in date, and whether it’s a rented or owned home.' },
  { label: '🎉 Event planning', text: 'We plan weddings and events. Capture event type, expected guest count, event date, venue status (booked/not), city, estimated budget, and the services needed (decor, catering, photography).' },
  { label: '✈️ Travel agency', text: 'Travel agency. For each enquiry capture destination, travel type (leisure/business/honeymoon), number of travellers, tentative dates, duration, budget per person, and whether visa assistance is needed.' },
  { label: '💻 B2B SaaS', text: 'We sell a B2B software product. For each lead capture company size, industry, role/designation, the problem they’re trying to solve, current tool in use, team size to onboard, and expected go-live timeline.' },
  { label: '🏭 Manufacturing', text: 'Industrial equipment manufacturer. For each enquiry capture the product/category of interest, required quantity, application/use-case, expected delivery timeline, whether they need customisation, and GST/company details.' },
  { label: '💍 Jewellery retail', text: 'Jewellery showroom. For each enquiry capture the occasion, product category (gold/diamond/silver), metal purity preference, budget range, preferred visit date, and whether it’s for an exchange.' },
  { label: '📸 Photography', text: 'Wedding photography studio. For each enquiry capture the event type, event date(s), city/venue, package of interest, number of events to cover, deliverables wanted (album/video/drone), and budget.' },
  { label: '🚚 Logistics', text: 'Logistics and freight company. For each enquiry capture shipment type, origin and destination cities, cargo weight/volume, frequency (one-time/recurring), preferred mode (road/air/sea), and required delivery timeline.' },
  { label: '🌾 Agriculture', text: 'Agri-inputs dealer. For each farmer enquiry capture crop type, land area (acres), product category of interest (seeds/fertiliser/pesticide), season, irrigation type, and preferred delivery village/block.' },
];

// ── styles (inline, matching the dashboard's CSS-var convention) ────────────
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(10,10,16,0.62)', backdropFilter: 'blur(3px)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '4vh 16px', overflowY: 'auto' };
const panel: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 780, boxShadow: '0 30px 80px rgba(0,0,0,0.45)', overflow: 'hidden' };
const header: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', background: 'linear-gradient(120deg, #FF5A4E 0%, #E5202B 52%, #B3121B 120%)', position: 'relative', overflow: 'hidden' };
const shine: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, width: 80, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', transform: 'skewX(-20deg)' };
const orb: React.CSSProperties = { width: 44, height: 44, borderRadius: 13, background: 'rgba(255,255,255,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' };
const closeBtn: React.CSSProperties = { background: 'rgba(255,255,255,0.16)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 };
const rail: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 22px 4px' };
const railDot: React.CSSProperties = { width: 24, height: 24, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 };
const railLine: React.CSSProperties = { flex: 1, height: 2, background: 'var(--border)', margin: '0 8px', borderRadius: 2, position: 'relative', overflow: 'hidden' };
const railFill: React.CSSProperties = { position: 'absolute', left: 0, top: 0, bottom: 0, background: 'var(--primary)', borderRadius: 2 };
const body: React.CSSProperties = { padding: 20, maxHeight: '68vh', overflowY: 'auto' };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 13 };
const centerCol: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '38px 12px' };
const footer: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 };
const input: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 9, fontSize: 13, outline: 'none' };
const textarea: React.CSSProperties = { ...input, width: '100%', resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' };
const labelInput: React.CSSProperties = { flex: 1, background: 'transparent', border: '1px solid transparent', color: 'var(--text)', padding: '6px 8px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, outline: 'none' };
const keyInput: React.CSSProperties = { ...input, fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 12 };
const btnPrimary: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '9px 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7 };
const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 };
const chip: React.CSSProperties = { padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--s3)', color: 'var(--text)', fontWeight: 600 };
const suggestChip: React.CSSProperties = { padding: '4px 11px', borderRadius: 999, fontSize: 11, cursor: 'pointer', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-dim)', fontWeight: 600 };
const infoCard: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 13 };
const iconChip: React.CSSProperties = { width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const fieldCard: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 12, padding: 13 };
const removeBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };
const kindTag: React.CSSProperties = { padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.3 };
const switchWrap: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0' };
const switchTrack: React.CSSProperties = { width: 34, height: 18, borderRadius: 999, position: 'relative', display: 'inline-flex', alignItems: 'center', padding: 2, transition: 'background 0.2s' };
const switchThumb: React.CSSProperties = { width: 14, height: 14, borderRadius: 999, background: '#fff', display: 'block', boxShadow: '0 1px 2px rgba(0,0,0,0.3)' };
const optionChip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px 3px 10px', borderRadius: 999, fontSize: 12, background: 'var(--s2)', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600 };
const optionX: React.CSSProperties = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 };
const thinkOrb: React.CSSProperties = { width: 68, height: 68, borderRadius: 22, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(0,0,0,0.16)' };
const shimmerTrack: React.CSSProperties = { width: 200, height: 5, borderRadius: 999, background: 'var(--s3)', overflow: 'hidden', marginTop: 6, position: 'relative' };
const shimmerBar: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, width: '45%', borderRadius: 999, background: 'linear-gradient(90deg, transparent, var(--primary), transparent)' };
const successRing: React.CSSProperties = { width: 78, height: 78, borderRadius: 999, background: 'rgba(16,185,129,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' };

'use client';
import { useEffect, useRef, useState } from 'react';

/**
 * AI Smart Filter bar for the leads list — plain-English → validated filter
 * params (KINI). Presentation only: the parent owns the query state and the
 * actual API call. This component adds the affordances that make the feature
 * discoverable and easy to use:
 *   - a ✨ leading icon + a subtly animated "run" button (AI/magic cue),
 *   - a typewriter placeholder that auto-types example queries when the box is
 *     empty and unfocused (so a rep sees *what to ask* without reading docs),
 *   - one-tap example chips that fill AND run,
 *   - an "Interpreted as …" result bar with the resolved param chips.
 * Motion is disabled under `prefers-reduced-motion` (see globals.css .sf-*).
 */

// Full-length phrasings drive the typewriter — they read like real questions.
const TYPE_EXAMPLES = [
  'hot B2C leads in Mumbai not contacted in 30 days',
  'qualified leads added this week',
  'my open leads going cold',
  'B2B leads in steel industry with score above 70',
  'leads from Facebook this month',
  'unqualified leads in Delhi to re-engage',
  "high-intent leads I haven't followed up",
  'new leads added today, highest score first',
];

// Short, tappable starters — clicking fills the box and runs immediately.
const CHIP_EXAMPLES = [
  'Hot leads this week',
  'My leads going cold',
  'Qualified in Mumbai',
  'Score above 80',
  'Added today',
  'Never contacted',
];

export interface SmartFilterBarProps {
  query: string;
  setQuery: (v: string) => void;
  /** Run the filter. Pass an explicit query to fill-and-run (chip taps). */
  onRun: (explicit?: string) => void;
  onClear: () => void;
  loading: boolean;
  explanation: string;
  params: Record<string, string>;
}

export default function SmartFilterBar({
  query, setQuery, onRun, onClear, loading, explanation, params,
}: SmartFilterBarProps) {
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState('');

  // Typewriter placeholder — types each example, pauses, deletes, advances.
  // Only runs while the box is empty and unfocused so it never fights a user
  // who is mid-thought. Falls back to a static example under reduced-motion.
  const showTypewriter = !query && !focused;
  useEffect(() => {
    if (!showTypewriter) return;
    const reduce = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setTyped(TYPE_EXAMPLES[0]); return; }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let ex = 0, ch = 0, deleting = false;
    const step = () => {
      if (cancelled) return;
      const full = TYPE_EXAMPLES[ex];
      if (!deleting) {
        ch++;
        setTyped(full.slice(0, ch));
        if (ch >= full.length) { deleting = true; timer = setTimeout(step, 1600); return; }
        timer = setTimeout(step, 42 + Math.random() * 46);
      } else {
        ch--;
        setTyped(full.slice(0, Math.max(0, ch)));
        if (ch <= 0) { deleting = false; ex = (ex + 1) % TYPE_EXAMPLES.length; timer = setTimeout(step, 260); return; }
        timer = setTimeout(step, 22);
      }
    };
    timer = setTimeout(step, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [showTypewriter]);

  const runChip = (text: string) => { setQuery(text); onRun(text); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
      {/* Input row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div
          style={{
            position: 'relative', flex: 1, minWidth: 240, display: 'flex', alignItems: 'center',
            background: 'var(--s3)',
            border: `1px solid ${focused ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: 10,
            boxShadow: focused ? '0 0 0 3px color-mix(in srgb, var(--primary) 22%, transparent)' : 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}
        >
          <span aria-hidden style={{ position: 'absolute', left: 11, fontSize: 15, pointerEvents: 'none', opacity: 0.9 }}>✨</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') onRun(); }}
            placeholder={focused ? 'Describe the leads you want — e.g. hot leads in Mumbai added this week' : ''}
            aria-label="Smart Filter — describe the leads you want in plain English"
            style={{
              flex: 1, width: '100%', background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text)', padding: '10px 12px 10px 34px', borderRadius: 10, fontSize: 13,
            }}
          />
          {/* Typewriter overlay — sits over the empty input, never blocks clicks. */}
          {showTypewriter && (
            <div
              aria-hidden
              style={{
                position: 'absolute', left: 34, right: 12, pointerEvents: 'none',
                color: 'var(--textSec)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              <span style={{ opacity: 0.7 }}>Try: </span>{typed}<span className="sf-caret" style={{ height: 14 }} />
            </div>
          )}
        </div>
        <button
          onClick={() => onRun()}
          disabled={loading}
          className={loading ? undefined : 'sf-run'}
          style={{
            background: 'var(--primary)', border: 'none', color: '#fff', padding: '10px 18px',
            borderRadius: 10, fontSize: 13, fontWeight: 700, opacity: loading ? 0.65 : 1,
            whiteSpace: 'nowrap', cursor: loading ? 'default' : 'pointer', display: 'inline-flex',
            alignItems: 'center', gap: 7,
          }}
        >
          {loading
            ? (<><span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(255,255,255,0.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Thinking…</>)
            : (<>✨ Smart Filter</>)}
        </button>
      </div>

      {/* Example starter chips */}
      {!explanation && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--textSec)', fontWeight: 600, opacity: 0.8 }}>Try:</span>
          {CHIP_EXAMPLES.map((ex) => (
            <button
              key={ex}
              className="sf-chip"
              onClick={() => runChip(ex)}
              disabled={loading}
              style={{
                background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)',
                padding: '4px 11px', borderRadius: 999, fontSize: 12, cursor: loading ? 'default' : 'pointer',
              }}
            >{ex}</button>
          ))}
        </div>
      )}

      {/* Result — "Interpreted as …" with resolved param chips */}
      {explanation && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--textSec)', background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
          <span style={{ fontSize: 14 }}>✨</span>
          <span>Interpreted as: <strong style={{ color: 'var(--text)' }}>{explanation}</strong></span>
          {Object.entries(params).map(([k, v]) => (
            <span key={k} style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: '1px 7px', fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
              {k}: {v}
            </span>
          ))}
          <button onClick={onClear} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)', color: 'var(--textSec)', padding: '3px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Clear</button>
        </div>
      )}
    </div>
  );
}

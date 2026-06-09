'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { messagingApi, type ScopedUser } from '../../lib/messagingApi';

/**
 * Textarea with @-trigger mention picker.
 *
 * Emits @[uid:Display Name] tokens into the value string so the backend
 * parser can extract the uid set reliably. The visible chip rendered in
 * timelines/messages is handled by a sibling renderer (renderMentions
 * below) that replaces the token with the display name.
 *
 * Scope filtering is server-side — the dropdown only ever shows users
 * the caller can reach (city ∩ hierarchy subtree).
 */
export default function MentionInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  rows = 3,
  disabled,
  maxLength = 4000,
  style,
}: {
  value: string;
  onChange: (next: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  maxLength?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<number>(0);
  const [results, setResults] = useState<ScopedUser[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  const close = useCallback(() => { setQuery(null); setResults([]); setActive(0); }, []);

  // Detect "@…" trigger as the user types — look at the substring from the
  // last "@" before the caret to the caret. Whitespace cancels.
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    const pos = e.target.selectionStart || 0;
    const upto = next.slice(0, pos);
    const at = upto.lastIndexOf('@');
    if (at < 0) { close(); return; }
    const after = upto.slice(at + 1);
    if (/\s/.test(after) || after.length > 30) { close(); return; }
    setQuery(after);
    setAnchor(at);
  };

  useEffect(() => {
    if (query === null) return;
    let cancelled = false;
    setLoading(true);
    messagingApi.searchMentions(query)
      .then((r) => { if (!cancelled) setResults(r.data || []); })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [query]);

  const pick = (u: ScopedUser) => {
    const ta = ref.current;
    if (!ta) return;
    const pos = ta.selectionStart || 0;
    const before = value.slice(0, anchor);
    const after = value.slice(pos);
    const name = u.full_name || u.email || 'User';
    const token = `@[${u.id}:${name}] `;
    const next = before + token + after;
    onChange(next);
    close();
    requestAnimationFrame(() => {
      ta.focus();
      const newPos = (before + token).length;
      ta.setSelectionRange(newPos, newPos);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (query !== null && results.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(results[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || 'Type @ to mention someone…'}
        rows={rows}
        maxLength={maxLength}
        disabled={disabled}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--s3)', border: '1px solid var(--border)',
          color: 'var(--text)', padding: 10, borderRadius: 8, fontSize: 13,
          resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
          opacity: disabled ? 0.6 : 1, minHeight: 60,
          ...style,
        }}
      />
      {query !== null && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4,
          minWidth: 240, maxWidth: 360, maxHeight: 260, overflowY: 'auto',
          background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 6px 24px rgba(0,0,0,0.35)', zIndex: 30,
        }}>
          {loading && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>Searching…</div>}
          {!loading && results.length === 0 && (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--text-dim)' }}>
              No one matches that name in your team.
            </div>
          )}
          {results.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pick(u); }}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                padding: '8px 12px', background: i === active ? 'var(--s4)' : 'transparent',
                border: 'none', textAlign: 'left', cursor: 'pointer',
                color: 'var(--text)', fontSize: 13,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'var(--s4)', color: 'var(--text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
              }}>
                {(u.full_name || u.email || 'U').slice(0, 1).toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.full_name || u.email}
                </div>
                {u.city_names.length > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.city_names.join(', ')}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Replaces @[uid:Name] tokens with bold chips for display. Returns
 * React fragments so callers can drop it inline into a paragraph.
 */
export function renderMentions(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@\[([0-9a-fA-F-]{8,})(?::([^\]]+))?\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`t${key++}`}>{text.slice(last, m.index)}</span>);
    const display = m[2] || 'user';
    parts.push(
      <span key={`m${key++}`} style={{
        background: 'rgba(99,102,241,0.15)', color: 'var(--accent)',
        padding: '1px 6px', borderRadius: 5, fontWeight: 600,
      }}>@{display}</span>,
    );
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(<span key={`t${key++}`}>{text.slice(last)}</span>);
  return <>{parts}</>;
}

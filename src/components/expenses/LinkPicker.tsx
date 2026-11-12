'use client';
// A search-as-you-type picker for linking an expense to a CRM record (lead / deal). Same look as the company
// picker in the claim editor: once something is chosen it shows its name with a Clear button; otherwise a search
// box with a dropdown. The options come from `load(query)` — called when the box gets focus and (debounced) as
// you type — so the caller decides what is searched and how a row is labelled.

import { useEffect, useRef, useState } from 'react';
import { Button, Input, T } from '../ui';

export interface LinkOption { id: string; label: string }

export default function LinkPicker<O extends LinkOption>({ id, ariaLabel, icon, placeholder, selectedId, selectedLabel, fallbackLabel, load, reloadKey, onPick, onClear }: {
  /** Set by the surrounding Field so its label points at the search box. */
  id?: string;
  /** Names the search box and the Clear button, e.g. "Lead". */
  ariaLabel: string;
  icon: string;
  placeholder: string;
  selectedId: string;
  selectedLabel: string;
  fallbackLabel: string;
  load: (q: string) => Promise<O[]>;
  /** Changes when what `load` returns changes under the same query (e.g. the deal list narrowed to another lead). */
  reloadKey?: string;
  onPick: (o: O) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<O[]>([]);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!open || selectedId) return;
    let off = false;
    setBusy(true);
    const t = setTimeout(() => {
      loadRef.current(query.trim())
        .then((rows) => { if (!off) setResults(rows); })
        .catch(() => { if (!off) setResults([]); })
        .finally(() => { if (!off) setBusy(false); });
    }, query.trim() ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [open, query, selectedId, reloadKey]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  if (selectedId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text, overflowWrap: 'anywhere' }}>{icon} {selectedLabel || fallbackLabel}</span>
        <Button size="sm" variant="ghost" aria-label={`Clear ${ariaLabel.toLowerCase()}`} onClick={() => { onClear(); setQuery(''); setResults([]); }}>Clear</Button>
      </div>
    );
  }
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <Input id={id} aria-label={ariaLabel} value={query} placeholder={placeholder} autoComplete="off"
        onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {open && (busy || results.length > 0 || query.trim()) && (
        <div role="listbox" aria-label={`${ariaLabel} results`}
          style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, marginTop: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: T.radius.md, maxHeight: 220, overflowY: 'auto', boxShadow: '0 6px 24px rgba(0,0,0,0.12)' }}>
          {results.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={false}
              onClick={() => { onPick(o); setQuery(''); setResults([]); setOpen(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: T.text, fontSize: 13.5, cursor: 'pointer' }}>
              {o.label}
            </button>
          ))}
          {!results.length && <div style={{ padding: '8px 12px', fontSize: 13, color: T.mute }}>{busy ? 'Searching…' : 'No matches'}</div>}
        </div>
      )}
    </div>
  );
}

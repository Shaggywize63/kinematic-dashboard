'use client';
import { useId, useRef } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { Field, Input, T } from '../../ui';
import type { AccountSite } from '../../../lib/crmApi';

/**
 * Plant / Location picker for the Spark & Ray lead form.
 *
 * A company has many plants, and which one a requirement is for is what stops two leads at the
 * same customer reading identically. So the picker leads with the account's KNOWN plants as
 * one-tap chips, and still allows a new name to be typed — the backend de-dupes/creates sites
 * by name, so a free-typed plant is a feature, not a loophole.
 *
 * A typed name that is not one of the account's existing plants is badged NEW, so the rep can
 * see at a glance that they are about to create a site rather than pick one (and catch their
 * own typo before it becomes a second "Dadri").
 */
export default function PlantPicker({ value, onChange, sites, accountLinked }: {
  value: string;
  onChange: (next: string) => void;
  /** Plants already recorded against the linked account. */
  sites: readonly AccountSite[];
  /** Whether a company has been linked yet — without one there are no plants to offer. */
  accountLinked: boolean;
}) {
  const id = useId();
  const listId = `${id}-sites`;
  const inputRef = useRef<HTMLInputElement>(null);

  const typed = value.trim();
  const known = sites.map((s) => (s.name || '').trim()).filter(Boolean);
  const isNew = typed.length > 0 && !known.some((n) => n.toLowerCase() === typed.toLowerCase());

  const chip = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
    fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
    border: `1px solid ${active ? T.red : T.border}`,
    background: active ? 'color-mix(in srgb, var(--red) 10%, transparent)' : T.card,
    color: active ? T.red : T.text,
  });

  return (
    <Field
      htmlFor={`${id}-input`}
      label={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          Plant / Location
          {isNew && (
            <span data-testid="plant-new-badge" title="This plant is not on the account yet — saving the lead creates it." style={{
              fontFamily: T.mono, fontSize: 9, letterSpacing: '0.07em', fontWeight: 700,
              padding: '1px 5px', borderRadius: 4, color: T.ok,
              background: 'color-mix(in srgb, var(--ok) 13%, transparent)',
              border: '1px solid color-mix(in srgb, var(--ok) 35%, transparent)',
            }}>NEW</span>
          )}
        </span>
      }
    >
      <Input
        id={`${id}-input`}
        ref={inputRef}
        list={known.length > 0 ? listId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={accountLinked ? 'e.g. Dadri Super Thermal Plant' : 'Link a company first to pick its plants'}
      />
      {known.length > 0 && (
        <datalist id={listId}>{known.map((n) => <option key={n} value={n} />)}</datalist>
      )}

      <div data-testid="plant-chips" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
        {known.map((n) => {
          const active = n.toLowerCase() === typed.toLowerCase();
          return (
            <button
              key={n}
              type="button"
              aria-pressed={active}
              // Clicking the active chip clears it, so a mis-tap is one tap to undo.
              onClick={() => onChange(active ? '' : n)}
              style={chip(active)}
            >
              <MapPin size={11} strokeWidth={2.2} aria-hidden />{n}
            </button>
          );
        })}
        <button
          type="button"
          data-testid="plant-add"
          onClick={() => { onChange(''); inputRef.current?.focus(); }}
          style={{ ...chip(false), borderStyle: 'dashed', color: T.dim }}
        >
          <Plus size={11} strokeWidth={2.4} aria-hidden />Add plant
        </button>
        <span style={{ fontSize: 11.5, color: T.mute }}>
          {known.length > 0
            ? 'picks from this account’s plants, or add a new one'
            : accountLinked ? 'no plants recorded yet — type one to add it' : 'link a company to see its plants'}
        </span>
      </div>
    </Field>
  );
}

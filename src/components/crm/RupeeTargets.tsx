'use client';
/**
 * Settings → Targets, for a Sales / Collection (rupee) target type.
 *
 * Same layout as the weekly lead target — a target per hierarchy level, optional overrides for individuals, a
 * fallback for everyone else — but in whole rupees per MONTH, plus the two things only a rupee target has:
 * how the team is doing this month, and the entries (orders / payments reps logged) that progress is made of.
 * Everything goes through the typed admin endpoints (`type=sales|collection`); the lead target UI next door
 * is not touched.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { crmTargets } from '../../lib/crmApi';
import { MAX_RUPEES, MAX_RUPEES_LABEL, fmtGrouped, fmtRupees, groupRupeeInput, parseRupeeInput } from '../../lib/rupees';
import type { RupeeLeaderboard, TargetEntry, TargetType } from '../../types/crm';
import { IconButton, Input, Select, T } from '../ui';
import { Col, DataTable, useConfirm } from '../finance/ui';

export interface TargetUser { id: string; name: string; role: string; city: string | null; org_role_id: string | null }
export interface TargetLevel { id: string; name: string }

const card: React.CSSProperties = { background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 16 };
const h2: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 4 };
const hint: React.CSSProperties = { fontSize: 12, color: 'var(--text-dim)', margin: '0 0 12px' };
const inputStyle: React.CSSProperties = { width: 128, background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const selStyle: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%' };
const btnStyle: React.CSSProperties = { background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' };

/** "2026-10-01" -> "1 Oct 2026" (a calendar day, no timezone shifting). */
const fmtDay = (d?: string | null): string => {
  if (!d) return '—';
  const dt = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** A target number as text for a rupee box ("" when there is none). */
const asText = (n: number | null | undefined) => (n == null ? '' : fmtGrouped(n));
/** Whole rupees from a box, or null when blank. May exceed the ceiling — see `tooBig`. */
const wholeOf = (text: string): number | null => { const n = parseRupeeInput(text); return n == null ? null : Math.floor(n); };
const tooBig = (text: string) => (wholeOf(text) ?? 0) > MAX_RUPEES;

function RupeeBox({ value, onChange, label, placeholder, invalid }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; invalid?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span aria-hidden style={{ fontSize: 13, color: 'var(--text-dim)' }}>₹</span>
      <input inputMode="numeric" aria-label={label} aria-invalid={invalid || undefined} value={value} placeholder={placeholder ?? '0'}
        onChange={(e) => onChange(groupRupeeInput(e.target.value))}
        style={{ ...inputStyle, ...(invalid ? { borderColor: 'var(--red, #dc2626)' } : null) }} />
    </span>
  );
}

export default function RupeeTargets({ type, users, levels, baseLoading, narrow }: {
  type: TargetType; users: TargetUser[]; levels: TargetLevel[]; baseLoading: boolean; narrow: boolean;
}) {
  const kind = type.key;
  const label = type.label;
  const lower = label.toLowerCase();

  // ── the targets ──
  const [loading, setLoading] = useState(true);
  const [defaultText, setDefaultText] = useState('');
  const [levelText, setLevelText] = useState<Record<string, string>>({});
  const [overrideText, setOverrideText] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [pickLevel, setPickLevel] = useState('');
  const [cityFilter, setCityFilter] = useState('');

  // ── the team board + the entries ──
  const [board, setBoard] = useState<RupeeLeaderboard | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [entries, setEntries] = useState<TargetEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [ownOnly, setOwnOnly] = useState(false);
  const [person, setPerson] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ask, dialog] = useConfirm();

  const loadTargets = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await crmTargets.get(kind))?.data;
      setDefaultText(asText(d?.default_target || null));
      setLevelText(Object.fromEntries((d?.per_level ?? []).map((r) => [r.hierarchy_level_id, asText(r.target_value)])));
      setOverrideText(Object.fromEntries((d?.per_user ?? []).map((r) => [r.user_id, asText(r.target_value)])));
    } catch (e: unknown) { toast.error((e as Error)?.message || `Failed to load the ${lower}`); }
    finally { setLoading(false); }
  }, [kind, lower]);

  const loadBoard = useCallback(async () => {
    try { setBoard((await crmTargets.rupeeLeaderboard(kind))?.data ?? null); setBoardError(null); }
    catch (e: unknown) { setBoard(null); setBoardError((e as Error)?.message || 'Could not load the team progress'); }
  }, [kind]);

  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    setEntriesError(null);
    const q = { kind, from: from || undefined, to: to || undefined, limit: ENTRIES_LIMIT };
    try {
      let rows: TargetEntry[];
      try {
        rows = (await crmTargets.entries.list({ ...q, all: true, user_id: person || undefined }))?.data ?? [];
        setOwnOnly(false);
      } catch (e: unknown) {
        // Seeing everyone's entries is for approvers; anyone else just gets their own.
        if (!/approver|forbidden|403/i.test(String((e as Error)?.message))) throw e;
        rows = (await crmTargets.entries.list(q))?.data ?? [];
        setOwnOnly(true);
      }
      setEntries(Array.isArray(rows) ? rows : []);
    } catch (e: unknown) { setEntries([]); setEntriesError((e as Error)?.message || 'Could not load the entries'); }
    finally { setEntriesLoading(false); }
  }, [kind, person, from, to]);

  useEffect(() => { loadTargets(); loadBoard(); }, [loadTargets, loadBoard]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  const cities = useMemo(() => Array.from(new Set(users.map((u) => u.city).filter((c): c is string => !!c))).sort(), [users]);
  const usersInPicked = useMemo(
    () => users.filter((u) => (!pickLevel || u.org_role_id === pickLevel) && (!cityFilter || u.city === cityFilter)),
    [users, pickLevel, cityFilter],
  );
  const countAtLevel = (id: string) => users.filter((u) => u.org_role_id === id).length;
  const sortedUsers = useMemo(() => [...users].sort((a, b) => a.name.localeCompare(b.name)), [users]);

  // One save path for the three scopes: a level, one person, or the fallback for everyone else.
  const save = async (key: string, text: string, scope: { hierarchy_level_id?: string; user_id?: string; all?: boolean }, done: string) => {
    const v = wholeOf(text);
    if (v == null) return;
    if (v > MAX_RUPEES) { toast.error(`A target can be at most ${MAX_RUPEES_LABEL} a month`); return; }
    setSaving(key);
    try {
      await crmTargets.set({ type: kind, ...scope, target_value: v });
      toast.success(`${done}: ${fmtRupees(v)} / month`);
      loadBoard();
    } catch (e: unknown) { toast.error((e as Error)?.message || 'Failed'); }
    finally { setSaving(null); }
  };

  const removeEntry = async (e: TargetEntry) => {
    if (!(await ask({
      title: 'Delete this entry?', danger: true, confirmLabel: 'Delete entry',
      message: `${fmtRupees(e.amount)}${e.user_name ? ` logged by ${e.user_name}` : ''} on ${fmtDay(e.entry_date)} stops counting towards the ${lower}.`,
    }))) return;
    try {
      await crmTargets.entries.remove(e.id);
      toast.success('Entry deleted');
      loadEntries();
      loadBoard();
    } catch (err: unknown) { toast.error((err as Error)?.message || 'Could not delete the entry'); }
  };

  const controls: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: narrow ? 0 : 'auto' };
  const busy = (k: string) => saving === k;

  // ── tables ──
  type BoardRow = RupeeLeaderboard['entries'][number] & { id: string };
  const boardCols: Col<BoardRow>[] = [
    { key: 'person', label: 'Person', render: (r) => <span style={{ fontWeight: 600 }}>{r.name}</span> },
    { key: 'role', label: 'Role', render: (r) => r.role || '—' },
    { key: 'target', label: 'Target', align: 'right', render: (r) => (r.target == null ? '—' : fmtRupees(r.target)) },
    { key: 'achieved', label: 'Achieved', align: 'right', render: (r) => fmtRupees(r.achieved) },
    { key: 'pct', label: '%', width: 170, render: (r) => <PctBar pct={r.pct} /> },
  ];
  const entryCols: Col<TargetEntry>[] = [
    { key: 'date', label: 'Date', render: (r) => fmtDay(r.entry_date) },
    { key: 'person', label: 'Person', render: (r) => <span style={{ fontWeight: 600 }}>{r.user_name || '—'}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => fmtRupees(r.amount) },
    { key: 'dealer', label: 'Dealer', render: (r) => r.lead_name || '—' },
    { key: 'note', label: 'Note', nowrap: false, render: (r) => <span style={{ color: r.note ? T.text : T.mute, display: 'inline-block', maxWidth: 260, overflowWrap: 'anywhere' }}>{r.note || '—'}</span> },
    { key: 'del', label: '', align: 'right', width: 48, render: (r) => <IconButton label={`Delete the ${fmtRupees(r.amount)} entry`} onClick={() => removeEntry(r)}><Trash2 size={16} strokeWidth={1.6} /></IconButton> },
  ];

  return (
    <>
      {/* Per-hierarchy-level targets — the primary control */}
      <div style={card}>
        <div style={h2}>{label} by hierarchy level</div>
        <p style={hint}>The monthly {lower} in rupees for every user at each level. Progress counts what they log this month.</p>
        {baseLoading || loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>Loading…</div>
        ) : levels.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 12 }}>
            No hierarchy levels defined for this client yet. Set them up in <a href="/dashboard/crm/settings/hierarchy" style={{ color: 'var(--primary)' }}>Org Hierarchy</a>, then set per-level targets here. You can still set individual targets below.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {levels.map((l) => {
              const text = levelText[l.id] ?? '';
              return (
                <div key={l.id} style={rowStyle}>
                  <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{l.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{countAtLevel(l.id)} {countAtLevel(l.id) === 1 ? 'person' : 'people'}</div>
                  </div>
                  <div style={controls}>
                    <RupeeBox label={`${l.name} ${lower}`} value={text} invalid={tooBig(text)} onChange={(v) => setLevelText((m) => ({ ...m, [l.id]: v }))} />
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>₹ / month</span>
                    <button onClick={() => save(`lvl:${l.id}`, text, { hierarchy_level_id: l.id }, `${l.name}`)}
                      disabled={busy(`lvl:${l.id}`) || wholeOf(text) == null || tooBig(text)} style={{ ...btnStyle, opacity: busy(`lvl:${l.id}`) || wholeOf(text) == null || tooBig(text) ? 0.6 : 1 }}>
                      {busy(`lvl:${l.id}`) ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                  {tooBig(text) && <div style={{ flexBasis: '100%', fontSize: 11, color: 'var(--red, #dc2626)', textAlign: 'right' }}>At most {MAX_RUPEES_LABEL} a month.</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Individual overrides — optional fine-tuning */}
      <div style={card}>
        <div style={h2}>Individual overrides <span style={{ fontWeight: 500, color: 'var(--text-dim)' }}>(optional)</span></div>
        <p style={hint}>Pick a level (and optional city) to list its people and override specific individuals. Leave a box empty to use their level’s target; enter 0 for no target at all.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <select aria-label="Level" value={pickLevel} onChange={(e) => setPickLevel(e.target.value)} style={{ ...selStyle, flex: '1 1 200px', minWidth: 0 }}>
            <option value="">{levels.length ? 'Choose a level…' : 'All users'}</option>
            {levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select aria-label="City" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} style={{ ...selStyle, flex: '1 1 200px', minWidth: 0 }}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        {(pickLevel || cityFilter) ? (
          usersInPicked.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>No users match.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {usersInPicked.map((u) => {
                const text = overrideText[u.id] ?? '';
                const lvl = u.org_role_id ? levelText[u.org_role_id] : undefined;
                return (
                  <div key={u.id} style={rowStyle}>
                    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{u.city || '—'}</div>
                    </div>
                    <div style={controls}>
                      <RupeeBox label={`${u.name} ${lower}`} value={text} placeholder={lvl || '—'} invalid={tooBig(text)} onChange={(v) => setOverrideText((m) => ({ ...m, [u.id]: v }))} />
                      <button onClick={() => save(`usr:${u.id}`, text, { user_id: u.id }, u.name)}
                        disabled={busy(`usr:${u.id}`) || wholeOf(text) == null || tooBig(text)}
                        style={{ ...btnStyle, background: 'var(--s3)', color: 'var(--text)', border: '1px solid var(--border)', opacity: busy(`usr:${u.id}`) || wholeOf(text) == null || tooBig(text) ? 0.6 : 1 }}>
                        {busy(`usr:${u.id}`) ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>Choose a level above to list its people.</div>
        )}
      </div>

      {/* Fallback default — for anyone with no level + no individual target */}
      <div style={card}>
        <div style={h2}>Fallback default</div>
        <p style={hint}>Used only for people with no hierarchy level and no individual target.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <RupeeBox label={`Fallback ${lower}`} value={defaultText} invalid={tooBig(defaultText)} onChange={setDefaultText} />
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>₹ / month</span>
          <button onClick={() => save('__default__', defaultText, { all: true }, 'Fallback')}
            disabled={busy('__default__') || wholeOf(defaultText) == null || tooBig(defaultText)}
            style={{ ...btnStyle, opacity: busy('__default__') || wholeOf(defaultText) == null || tooBig(defaultText) ? 0.6 : 1 }}>
            {busy('__default__') ? 'Saving…' : 'Save fallback'}
          </button>
        </div>
        {tooBig(defaultText) && <div style={{ fontSize: 11, color: 'var(--red, #dc2626)', marginTop: 6 }}>At most {MAX_RUPEES_LABEL} a month.</div>}
      </div>

      {/* How the team is doing this month */}
      <div style={card}>
        <div style={h2}>Team progress</div>
        <p style={hint}>
          {board ? `${fmtDay(board.period_start)} – ${fmtDay(board.period_end)}` : 'This month'}
          {board && board.stats.target_participants > 0 ? ` · ${fmtRupees(board.stats.total_achieved)} of ${fmtRupees(board.stats.total_target)} · ${board.stats.meeting_target} of ${board.stats.target_participants} on target` : ''}
        </p>
        {boardError ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>{boardError}</div>
        ) : (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <DataTable<BoardRow> columns={boardCols} rows={(board?.entries ?? []).map((r) => ({ ...r, id: r.user_id }))} loading={!board}
              empty="Nobody to show yet — people appear here once they have a role, a target or an entry." />
          </div>
        )}
      </div>

      {/* The entries those totals are made of */}
      <div style={card}>
        <div style={h2}>Entries</div>
        <p style={hint}>
          {ownOnly ? 'Showing your own entries.' : `Every ${kind === 'sales' ? 'sale' : 'collection'} logged by the team, newest first.`} Deleting one takes it off the total straight away.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {!ownOnly && (
            <Select aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)} style={{ width: 200 }}>
              <option value="">Everyone</option>
              {sortedUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          )}
          <Input aria-label="From date" type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
          <span style={{ fontSize: 13, color: T.mute }}>to</span>
          <Input aria-label="To date" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        </div>
        {entriesError ? (
          <div style={{ fontSize: 12, color: 'var(--text-dim)', padding: 8 }}>{entriesError}</div>
        ) : (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <DataTable<TargetEntry> columns={entryCols} rows={entries} loading={entriesLoading}
              empty={person || from || to ? 'No entries match these filters.' : 'No entries logged yet.'} />
            {entries.length >= ENTRIES_LIMIT && (
              <div style={{ padding: '10px 14px', fontSize: 12.5, color: T.mute, borderTop: `1px solid ${T.border}` }}>
                Showing the latest {ENTRIES_LIMIT} entries. Use the filters to look further back.
              </div>
            )}
          </div>
        )}
      </div>
      {dialog}
    </>
  );
}

const ENTRIES_LIMIT = 50;

/** Percentage of target with a bar; "—" when the person has no target. */
function PctBar({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: T.mute }}>—</span>;
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.rule, overflow: 'hidden', minWidth: 60 }}>
        <div role="presentation" style={{ width: `${w}%`, height: '100%', background: pct >= 100 ? T.ok : T.red, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: T.text, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

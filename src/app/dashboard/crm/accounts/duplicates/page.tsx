'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { GitMerge, X } from 'lucide-react';
import { crmAccounts } from '../../../../../lib/crmApi';
import type {
  AccountMergeMoved, AccountMergeResult, SimilarAccount, SimilarAccountGroup,
} from '../../../../../types/crm';
import Breadcrumbs from '../../../../../components/crm/shared/Breadcrumbs';
import { Badge, Button, Card, EmptyState, PageHeader, Select, T, useIsCompact } from '../../../../../components/ui';

/**
 * Duplicate accounts: groups of accounts with the same or a very similar name ("NTPC Lara" / "NTPC Lara Ltd.").
 * For each group an admin picks the account to keep and merges the rest into it, so every contact, lead and
 * deal ends up under one account. GET /crm/accounts/similar lists the groups; POST /crm/accounts/merge merges
 * (dry_run:true previews). Merge is admin-only: a 403 is shown as an inline message on the group.
 */

const HIDDEN_KEY = 'kinematic_hidden_duplicate_groups';
const MATCH_OPTIONS = [
  { label: 'Exact', value: '1' },
  { label: 'Close', value: '0.88' },
  { label: 'Loose', value: '0.75' },
] as const;
const DEFAULT_MATCH = '0.88';

// ── helpers ───────────────────────────────────────────────────────────────
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const accountsLabel = (n: number) => plural(n, 'account');

/** "6 contacts, 4 leads, 2 deals": every non-zero count the merge moves, in a fixed order. */
const MOVED_LABELS: Array<[keyof AccountMergeMoved, string, string]> = [
  ['contacts', 'contact', 'contacts'],
  ['leads', 'lead', 'leads'],
  ['converted_leads', 'converted lead', 'converted leads'],
  ['deals', 'deal', 'deals'],
  ['activities', 'activity', 'activities'],
  ['notes', 'note', 'notes'],
  ['sites', 'site', 'sites'],
  ['visits', 'visit', 'visits'],
  ['account_updates', 'update', 'updates'],
  ['expenses', 'expense', 'expenses'],
  ['form_submissions', 'form submission', 'form submissions'],
  ['child_accounts', 'child account', 'child accounts'],
];
function describeMoved(moved: Partial<AccountMergeMoved> | undefined): string {
  const parts: string[] = [];
  for (const [k, one, many] of MOVED_LABELS) {
    const n = Number(moved?.[k] || 0);
    if (n > 0) parts.push(plural(n, one, many));
  }
  return parts.join(', ');
}

const total = (a: SimilarAccount) => (a.contact_count || 0) + (a.lead_count || 0) + (a.deal_count || 0);

/** The account most worth keeping: most contacts + leads + deals; a tie goes to the oldest. */
function defaultKeepId(accounts: SimilarAccount[]): string {
  let best = accounts[0];
  for (const a of accounts.slice(1)) {
    const d = total(a) - total(best);
    if (d > 0 || (d === 0 && Date.parse(a.created_at) < Date.parse(best.created_at))) best = a;
  }
  return best?.id;
}

function loadHidden(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch { return new Set(); }
}
function saveHidden(s: Set<string>) {
  try { window.localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s])); } catch { /* per-viewer convenience only */ }
}

const fmtDate = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

type Notice = { id: string; keptId: string; keptName: string; dupes: number; skipped: number };

// ── page ──────────────────────────────────────────────────────────────────
export default function DuplicateAccountsPage() {
  const narrow = useIsCompact(760);
  const [minScore, setMinScore] = useState<string>(DEFAULT_MATCH);
  const [groups, setGroups] = useState<SimilarAccountGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Notice[]>([]);
  const reqId = useRef(0);

  // Hidden group keys are per-viewer (localStorage), read once on mount.
  useEffect(() => { setHidden(loadHidden()); }, []);

  const load = useCallback(async (score: string) => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const r = await crmAccounts.similar({ min_score: Number(score) });
      if (id !== reqId.current) return; // a newer fetch (the select changed) owns the list
      setGroups((r.data?.groups || []).filter((g) => (g.accounts || []).length > 1));
    } catch (e: any) {
      if (id !== reqId.current) return;
      setGroups([]);
      setError({ message: e?.message || 'Could not load duplicate accounts', status: e?.status });
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(minScore); }, [minScore, load]);

  const visible = useMemo(() => groups.filter((g) => !hidden.has(g.key)), [groups, hidden]);
  const hiddenCount = groups.length - visible.length;

  const hideGroup = (g: SimilarAccountGroup) => {
    const next = new Set(hidden); next.add(g.key);
    setHidden(next); saveHidden(next);
  };
  const showHidden = () => {
    const next = new Set(hidden);
    for (const g of groups) next.delete(g.key);
    setHidden(next); saveHidden(next);
  };

  const onMerged = (g: SimilarAccountGroup, r: AccountMergeResult) => {
    const keptName = r.kept?.name || g.accounts.find((a) => a.id === r.kept?.id)?.name || 'the kept account';
    const n = (r.merged_ids || []).length;
    const moved = describeMoved(r.moved);
    toast.success(`Merged ${accountsLabel(n)} into ${keptName}.${moved ? ` ${moved} moved.` : ''}`);
    setGroups((cur) => cur.filter((x) => x.key !== g.key));
    const dupes = (r.duplicate_contacts || []).length;
    const skipped = (r.skipped || []).length;
    if (dupes || skipped) {
      setNotices((cur) => [...cur, { id: `${g.key}-${Date.now()}`, keptId: r.kept?.id, keptName, dupes, skipped }]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Breadcrumbs items={[
        { label: 'CRM', href: '/dashboard/crm/dashboard' },
        { label: 'Accounts', href: '/dashboard/crm/accounts' },
        { label: 'Duplicate accounts' },
      ]} />
      <PageHeader
        compact={narrow}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            Duplicate accounts
            {!loading && !error && (
              <Badge mono style={{ fontSize: 11.5 }} >{plural(visible.length, 'group')}</Badge>
            )}
          </span>
        }
        description="Accounts with the same or a very similar name. Pick the one to keep, then merge the rest into it."
        actions={
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.dim }}>
            Min match
            <Select
              aria-label="Min match"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              style={{ width: 120 }}
            >
              {MATCH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </label>
        }
      />

      {notices.map((n) => (
        <div key={n.id} role="status" data-testid="dup-notice" style={noticeStyle}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text }}>
            {n.dupes > 0 && (
              <div>
                {plural(n.dupes, 'contact')} {n.dupes === 1 ? 'looks like a duplicate' : 'look like duplicates'}: check {n.dupes === 1 ? 'it' : 'them'} in the account.{' '}
                {n.keptId && <Link href={`/dashboard/crm/accounts/${n.keptId}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>Open {n.keptName}</Link>}
              </div>
            )}
            {n.skipped > 0 && <div style={{ color: T.dim }}>{plural(n.skipped, 'account')} could not be merged and {n.skipped === 1 ? 'was' : 'were'} skipped.</div>}
          </div>
          <button
            type="button" aria-label="Dismiss note"
            onClick={() => setNotices((cur) => cur.filter((x) => x.id !== n.id))}
            style={{ background: 'transparent', border: 0, color: T.mute, cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          ><X size={15} strokeWidth={1.8} /></button>
        </div>
      ))}

      {loading ? (
        <div role="status" style={{ color: T.dim, fontSize: 13.5, padding: '28px 0', textAlign: 'center' }}>Looking for duplicate accounts...</div>
      ) : error ? (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <div role="alert" style={{ color: T.red, fontSize: 13.5, fontWeight: 600 }}>
            {error.status === 403 ? 'Only admins can merge accounts' : 'Could not load duplicate accounts'}
          </div>
          <div style={{ color: T.dim, fontSize: 13 }}>{error.message}</div>
          <Button onClick={() => void load(minScore)}>Try again</Button>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            title="No duplicate accounts found"
            description={minScore === '0.75' ? 'Nothing with a similar name was found.' : 'Try a lower Min match to look for weaker matches.'}
          />
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visible.map((g) => (
            <GroupCard key={g.key} group={g} narrow={narrow} onMerged={onMerged} onHide={hideGroup} />
          ))}
        </div>
      )}

      {!loading && !error && hiddenCount > 0 && (
        <div style={{ fontSize: 12.5, color: T.dim }}>
          {plural(hiddenCount, 'group')} hidden as not duplicates.{' '}
          <button type="button" onClick={showHidden} style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>Show again</button>
        </div>
      )}
    </div>
  );
}

const noticeStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
  background: T.infoWash, border: `1px solid ${T.border}`, borderRadius: T.radius.md,
};

// ── one group ─────────────────────────────────────────────────────────────
function GroupCard({ group, narrow, onMerged, onHide }: {
  group: SimilarAccountGroup;
  narrow: boolean;
  onMerged: (g: SimilarAccountGroup, r: AccountMergeResult) => void;
  onHide: (g: SimilarAccountGroup) => void;
}) {
  const accounts = group.accounts;
  const [keepId, setKeepId] = useState<string>(() => defaultKeepId(accounts));
  // Accounts the admin un-ticked. Everything else except the kept one is merged.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<AccountMergeResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'preview' | 'merge' | null>(null);
  const [err, setErr] = useState<{ message: string; status?: number } | null>(null);

  const keep = accounts.find((a) => a.id === keepId) || accounts[0];
  const mergeIds = accounts.filter((a) => a.id !== keep.id && !excluded.has(a.id)).map((a) => a.id);
  const merging = accounts.filter((a) => mergeIds.includes(a.id));
  const canAct = mergeIds.length > 0 && !busy;

  // Any change to the selection invalidates a shown preview or an open confirmation.
  const resetResult = () => { setPreview(null); setConfirming(false); setErr(null); };

  const chooseKeep = (id: string) => {
    if (id === keepId) return;
    setKeepId(id);
    setExcluded((cur) => { const n = new Set(cur); n.delete(id); return n; });
    resetResult();
  };
  const toggleMerge = (id: string, on: boolean) => {
    setExcluded((cur) => { const n = new Set(cur); if (on) n.delete(id); else n.add(id); return n; });
    resetResult();
  };

  const run = async (dry: boolean) => {
    setBusy(dry ? 'preview' : 'merge');
    setErr(null);
    try {
      const body = dry
        ? { keep_id: keep.id, merge_ids: mergeIds, dry_run: true }
        : { keep_id: keep.id, merge_ids: mergeIds };
      const r = await crmAccounts.merge(body);
      if (dry) setPreview(r.data);
      else onMerged(group, r.data);
    } catch (e: any) {
      setErr({ message: e?.message || 'Merge failed', status: e?.status });
      setConfirming(false);
    } finally {
      setBusy(null);
    }
  };

  const mergingCounts = merging.reduce(
    (s, a) => ({ c: s.c + (a.contact_count || 0), l: s.l + (a.lead_count || 0), d: s.d + (a.deal_count || 0) }),
    { c: 0, l: 0, d: 0 },
  );
  const matchLabel = group.score >= 0.995 ? 'Same name' : `${Math.round(group.score * 100)}% match`;

  return (
    <Card padding={narrow ? 14 : 18} className="dup-group" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-testid={`dup-group-${group.key}`} style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Badge tone={group.score >= 0.995 ? 'ok' : 'info'} mono>{matchLabel}</Badge>
          <span style={{ fontSize: 12.5, color: T.dim }}>{accountsLabel(accounts.length)}</span>
        </div>

        <div role="radiogroup" aria-label="Account to keep" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {accounts.map((a) => {
            const isKeep = a.id === keep.id;
            const place = [a.city, a.state].filter(Boolean).join(', ');
            return (
              <div
                key={a.id}
                data-testid={`dup-account-${a.id}`}
                data-keep={isKeep ? 'true' : 'false'}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', minWidth: 0,
                  border: `1px solid ${isKeep ? T.ok : T.border}`, borderRadius: T.radius.md,
                  background: isKeep ? T.okWash : T.raised,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <Link href={`/dashboard/crm/accounts/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ color: T.text, fontWeight: 700, fontSize: 14.5, overflowWrap: 'anywhere', textDecoration: 'none' }}>
                    {a.name}
                  </Link>
                  <div style={{ fontSize: 12.5, color: T.dim, marginTop: 3, overflowWrap: 'anywhere' }}>
                    {[place, a.industry, a.owner_name ? `Owner: ${a.owner_name}` : null, a.created_at ? `Added ${fmtDate(a.created_at)}` : null].filter(Boolean).join(' · ')}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.text, marginTop: 3 }}>
                    {plural(a.contact_count || 0, 'contact')} · {plural(a.lead_count || 0, 'lead')} · {plural(a.deal_count || 0, 'deal')}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', alignItems: 'center' }}>
                  <label style={choiceLabel}>
                    <input
                      type="radio" name={`keep-${group.key}`} checked={isKeep}
                      onChange={() => chooseKeep(a.id)} style={{ accentColor: 'var(--ok)' }}
                    />
                    Keep this one
                  </label>
                  {!isKeep && (
                    <label style={choiceLabel}>
                      <input
                        type="checkbox" checked={!excluded.has(a.id)}
                        onChange={(e) => toggleMerge(a.id, e.target.checked)}
                      />
                      Merge into the kept account
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {preview && (
          <div role="status" data-testid={`dup-preview-${group.key}`} style={{ fontSize: 13, color: T.text, background: T.infoWash, borderRadius: T.radius.md, padding: '9px 12px' }}>
            {describeMoved(preview.moved)
              ? <>Will move {describeMoved(preview.moved)} to &quot;{keep.name}&quot;.</>
              : <>Nothing to move. The {accountsLabel(mergeIds.length)} will just be merged into &quot;{keep.name}&quot;.</>}
            {(preview.duplicate_contacts || []).length > 0 && (
              <div style={{ color: T.dim, marginTop: 4 }}>
                {plural(preview.duplicate_contacts.length, 'contact')} {preview.duplicate_contacts.length === 1 ? 'looks like a duplicate' : 'look like duplicates'}.
              </div>
            )}
          </div>
        )}

        {err && (
          <div role="alert" data-testid={`dup-error-${group.key}`} style={{ fontSize: 13, color: T.red, background: T.redWash, borderRadius: T.radius.md, padding: '9px 12px' }}>
            {err.status === 403 ? (
              <>
                <strong>Only admins can merge accounts</strong>
                {err.message && !/only admins can merge accounts/i.test(err.message) && <div style={{ marginTop: 2 }}>{err.message}</div>}
              </>
            ) : err.message}
          </div>
        )}

        {confirming && (
          <div role="alertdialog" aria-label="Confirm merge" data-testid={`dup-confirm-${group.key}`}
            style={{ border: `1px solid ${T.warn}`, background: T.warnWash, borderRadius: T.radius.md, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13.5, color: T.text, lineHeight: 1.5 }}>
              <strong>Merge {accountsLabel(merging.length)} into {keep.name}?</strong>
              <div style={{ marginTop: 4 }}>
                {merging.map((a) => `"${a.name}"`).join(', ')} will be merged into &quot;{keep.name}&quot;. Their {plural(mergingCounts.c, 'contact')}, {plural(mergingCounts.l, 'lead')} and {plural(mergingCounts.d, 'deal')} (and other records) move to it.
                The merged {merging.length === 1 ? 'account is' : 'accounts are'} removed from lists.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button variant="primary" onClick={() => void run(false)} disabled={!!busy}>{busy === 'merge' ? 'Merging...' : 'Yes, merge'}</Button>
              <Button onClick={() => setConfirming(false)} disabled={!!busy}>Cancel</Button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button onClick={() => void run(true)} disabled={!canAct}>{busy === 'preview' ? 'Checking...' : 'Preview'}</Button>
          <Button
            variant="primary" icon={<GitMerge size={15} strokeWidth={1.8} />}
            onClick={() => { setErr(null); setConfirming(true); }}
            disabled={!canAct || confirming}
          >Merge</Button>
          <Button variant="ghost" onClick={() => onHide(group)} disabled={!!busy}>Not duplicates</Button>
          {mergeIds.length === 0 && <span style={{ fontSize: 12.5, color: T.mute }}>Tick at least one account to merge.</span>}
        </div>
      </div>
    </Card>
  );
}

const choiceLabel: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: T.text, cursor: 'pointer',
};

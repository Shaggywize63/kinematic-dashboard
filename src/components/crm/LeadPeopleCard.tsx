'use client';
// "People on this lead" card for the full lead detail page (connected-B2B / Spark & Ray only). Shows the
// customer people linked to the lead — the primary (nodal) contact first — lets you promote a secondary
// person to primary, TAG more customer people involved in the discussion (link an existing contact), and
// remove someone. Shown on every b2b lead (even with no people yet) so a rep can always add the first one.
// Backend: GET /crm/leads/:id/people, POST /crm/leads/:id/people (add), POST …/:linkId/primary, DELETE …/:linkId.

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Users, UserRound, Plus, X, Check } from 'lucide-react';
import { Card, Eyebrow, T } from '../ui';
import { InlineIcon } from '../ui/PageIcon';
import { isB2bClientActive } from '../../lib/b2bClient';
import { crmLeads, crmContacts, type LeadContactLink } from '../../lib/crmApi';

type ContactOption = { id: string; label: string; sub?: string };

function contactLabel(c: Record<string, unknown>): string {
  return (
    (c.full_name as string) ||
    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
    (c.email as string) ||
    'Contact'
  );
}

export default function LeadPeopleCard({ leadId }: { leadId: string }) {
  const b2b = isB2bClientActive();
  const [people, setPeople] = useState<LeadContactLink[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [primaryBusy, setPrimaryBusy] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);

  // Add-person picker.
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!b2b || !leadId) return;
    let off = false;
    setState('loading');
    crmLeads.people(leadId)
      .then((r) => { if (!off) { setPeople(r.data || []); setState('ready'); } })
      .catch(() => { if (!off) setState('error'); });
    return () => { off = true; };
  }, [b2b, leadId]);

  // Debounced contact search for the picker; already-linked contacts are filtered out.
  useEffect(() => {
    if (!adding) return;
    const mine = ++seq.current;
    setSearching(true);
    const linked = new Set(people.map((p) => p.contact_id));
    const t = setTimeout(() => {
      crmContacts.list(query ? { q: query } : undefined)
        .then((r) => {
          if (mine !== seq.current) return;
          const opts = ((r.data as unknown as Record<string, unknown>[]) || [])
            .filter((c) => !linked.has(c.id as string))
            .slice(0, 20)
            .map((c) => ({ id: c.id as string, label: contactLabel(c), sub: (c.title as string) || (c.email as string) || undefined }));
          setResults(opts);
        })
        .catch(() => { if (mine === seq.current) setResults([]); })
        .finally(() => { if (mine === seq.current) setSearching(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [adding, query, people]);

  const makePrimary = async (linkId: string) => {
    if (primaryBusy) return;
    setPrimaryBusy(linkId);
    try {
      const r = await crmLeads.setPrimaryPerson(leadId, linkId);
      setPeople(r.data || []);
      toast.success('Primary contact updated');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not change the primary contact');
    } finally {
      setPrimaryBusy(null);
    }
  };

  const addPerson = async (contactId: string) => {
    if (addBusy) return;
    setAddBusy(true);
    try {
      const r = await crmLeads.addPerson(leadId, { contact_id: contactId });
      setPeople(r.data || []);
      toast.success('Person added to this lead');
      setQuery(''); setResults([]); setAdding(false);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not add that person');
    } finally {
      setAddBusy(false);
    }
  };

  const removePerson = async (linkId: string) => {
    if (removeBusy) return;
    setRemoveBusy(linkId);
    try {
      const r = await crmLeads.removePerson(leadId, linkId);
      setPeople(r.data || []);
      toast.success('Person removed from this lead');
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Could not remove that person');
    } finally {
      setRemoveBusy(null);
    }
  };

  // Spark & Ray only. The card now shows for every b2b lead (even with no people yet) so people can be added.
  if (!b2b) return null;

  const pill: React.CSSProperties = {
    fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: 'var(--accent)',
    border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
    background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
    borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap',
  };
  const ghostBtn: React.CSSProperties = {
    background: 'transparent', border: `1px solid ${T.border}`, color: 'var(--accent)',
    fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  };

  return (
    <Card padding={18} style={{ minWidth: 0 }}>
      <Eyebrow style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users aria-hidden size={13} strokeWidth={2} />People on this lead
      </Eyebrow>
      {state === 'error' ? (
        <div style={{ fontSize: 13, color: T.dim }}>Couldn’t load the people on this lead</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {people.length === 0 && !adding && (
            <div style={{ fontSize: 12.5, color: T.dim }}>No one tagged yet — add the customer people involved in this lead.</div>
          )}
          {people.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
              <InlineIcon icon={UserRound} size={14} style={{ color: T.dim, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.name}</span>
              {p.title && <span style={{ color: T.dim, fontSize: 12, whiteSpace: 'nowrap' }}>· {p.title}</span>}
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {p.is_primary ? (
                  <span style={pill}>PRIMARY</span>
                ) : people.length > 1 && (
                  <button
                    type="button"
                    onClick={() => makePrimary(p.id)}
                    disabled={!!primaryBusy}
                    title="Make this the lead's primary (nodal) contact"
                    style={{ ...ghostBtn, cursor: primaryBusy ? 'default' : 'pointer', opacity: primaryBusy && primaryBusy !== p.id ? 0.5 : 1 }}
                  >
                    {primaryBusy === p.id ? 'Setting…' : 'Make primary'}
                  </button>
                )}
                {!p.is_primary && (
                  <button
                    type="button"
                    onClick={() => removePerson(p.id)}
                    disabled={removeBusy === p.id}
                    title="Remove this person from the lead"
                    aria-label={`Remove ${p.name}`}
                    style={{ background: 'transparent', border: 'none', color: T.dim, cursor: removeBusy === p.id ? 'default' : 'pointer', display: 'inline-flex', padding: 2 }}
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                )}
              </span>
            </div>
          ))}

          {adding ? (
            <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ position: 'relative' }}>
                <input
                  value={query}
                  autoFocus
                  autoComplete="off"
                  placeholder="Search a contact to tag…"
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 8, fontSize: 13, borderRadius: 8, border: `1px solid ${T.border}`, background: T.field, color: T.text }}
                />
              </div>
              <div style={{ maxHeight: 180, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 8 }}>
                {searching ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: T.dim }}>Searching…</div>
                ) : results.length === 0 ? (
                  <div style={{ padding: '8px 10px', fontSize: 12, color: T.dim }}>{query ? 'No matching contacts' : 'Type to search contacts'}</div>
                ) : results.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => addPerson(o.id)}
                    disabled={addBusy}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 10px', fontSize: 13, color: T.text, background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`, cursor: addBusy ? 'default' : 'pointer', fontFamily: 'inherit' }}
                  >
                    <InlineIcon icon={Check} size={13} style={{ color: 'var(--accent)', opacity: 0.0 }} />
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                    {o.sub && <span style={{ color: T.dim, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>· {o.sub}</span>}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => { setAdding(false); setQuery(''); setResults([]); }} style={{ ...ghostBtn, alignSelf: 'flex-start', color: T.dim }}>Cancel</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={{ ...ghostBtn, alignSelf: 'flex-start', marginTop: people.length ? 4 : 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Plus size={13} strokeWidth={2.2} /> Add a person
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

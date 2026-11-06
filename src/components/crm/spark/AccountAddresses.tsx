'use client';
import { useCallback, useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { crmSites, type AccountSite } from '../../../lib/crmApi';
import {
  apiErrorText, emptySiteForm, parseCoord, rows, siteFormError, siteFormToPayload, siteToForm, type SiteFormValues,
} from '../../../lib/sparkAccounts';
import Modal from '../shared/Modal';
import GoogleAddressAutocomplete, { type PlaceResult } from '../GoogleAddressAutocomplete';

/**
 * Spark & Ray "Addresses" card on an account: every address (site) of the company with its label, full address and a
 * map pin when it has coordinates, plus "+ Add address" and per-row Edit / Delete. Sites API:
 * GET /accounts/:id/sites, POST /sites, PATCH /sites/:id, DELETE /sites/:id. The address search is the shared Google
 * picker (it falls back to the backend places proxy when the browser has no Maps key).
 */
export default function AccountAddresses({ accountId }: { accountId: string }) {
  const [sites, setSites] = useState<AccountSite[]>([]);
  const [loading, setLoading] = useState(true);
  // null = closed; 'new' = adding; a site = editing it.
  const [editing, setEditing] = useState<AccountSite | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const r = await crmSites.forAccount(accountId);
      setSites(rows<AccountSite>(r?.data));
    } catch (e) {
      toast.error(apiErrorText(e, 'Failed to load addresses'));
    } finally { setLoading(false); }
  }, [accountId]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (s: AccountSite) => {
    if (!window.confirm(`Delete the address "${s.name}"?`)) return;
    setBusyId(s.id);
    try {
      await crmSites.remove(s.id);
      toast.success('Address deleted');
      setSites((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      toast.error(apiErrorText(e, 'Could not delete the address'));
    } finally { setBusyId(null); }
  };

  return (
    <div data-testid="account-addresses" style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{`Addresses (${sites.length})`}</div>
        <button type="button" onClick={() => setEditing('new')} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>+ Add address</button>
      </div>
      {loading ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>Loading…</div>
      ) : sites.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>No addresses yet. Add the head office, plants or delivery locations.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sites.map((s) => {
            const lat = parseCoord(s.latitude, 'lat');
            const lng = parseCoord(s.longitude, 'lng');
            const line = [s.address_line1, s.address_line2].filter(Boolean).join(', ');
            const place = [[s.city, s.state].filter(Boolean).join(', '), s.postal_code].filter(Boolean).join(' – ');
            return (
              <div key={s.id} data-testid="address-row" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', background: 'var(--s3)', borderRadius: 8, fontSize: 13 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.name}
                    {lat !== null && lng !== null && (
                      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.name} on the map`} title="Open on the map" style={{ color: 'var(--primary)', display: 'inline-flex' }}>
                        <MapPin size={14} strokeWidth={2} aria-hidden />
                      </a>
                    )}
                  </div>
                  {line && <div style={{ color: 'var(--text)', marginTop: 2, overflowWrap: 'anywhere' }}>{line}</div>}
                  {place && <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 1 }}>{place}</div>}
                  {s.notes && <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2, whiteSpace: 'pre-wrap' }}>{s.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button type="button" onClick={() => setEditing(s)} aria-label={`Edit address ${s.name}`} disabled={busyId === s.id} style={ghostBtn}>Edit</button>
                  <button type="button" onClick={() => remove(s)} aria-label={`Delete address ${s.name}`} disabled={busyId === s.id} style={{ ...ghostBtn, color: '#ef4444', borderColor: 'rgba(239,68,68,0.5)' }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && (
        <AddressForm
          accountId={accountId}
          site={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            setSites((prev) => (created ? [...prev, saved] : prev.map((x) => (x.id === saved.id ? { ...x, ...saved } : x))));
          }}
        />
      )}
    </div>
  );
}

function AddressForm({ accountId, site, onClose, onSaved }: {
  accountId: string; site: AccountSite | null; onClose: () => void; onSaved: (s: AccountSite, created: boolean) => void;
}) {
  const [f, setF] = useState<SiteFormValues>(() => (site ? siteToForm(site) : emptySiteForm()));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof SiteFormValues) => (v: string) => { setF((p) => ({ ...p, [k]: v })); setError(null); };

  // The picked address fills every address field and the pin.
  const onPick = (p: PlaceResult) => {
    setF((prev) => ({
      ...prev,
      address_line1: p.address_line1 || '', address_line2: '',
      city: p.city || '', state: p.state || '', postal_code: p.postal_code || '',
      latitude: p.latitude ?? '', longitude: p.longitude ?? '',
    }));
    setError(null);
  };

  const save = async () => {
    const err = siteFormError(f);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      const body = siteFormToPayload(f);
      if (site) {
        const r = await crmSites.update(site.id, body);
        toast.success('Address updated');
        onSaved({ ...site, ...body, ...(r?.data ?? {}) } as AccountSite, false);
      } else {
        const r = await crmSites.create({ account_id: accountId, ...body });
        toast.success('Address added');
        onSaved({ ...(body as unknown as AccountSite), ...(r?.data ?? {}), account_id: accountId, id: r?.data?.id ?? `tmp-${Date.now()}` }, true);
      }
    } catch (e) {
      setError(apiErrorText(e, 'Could not save the address'));
      setBusy(false);
    }
  };

  const hasPin = parseCoord(f.latitude, 'lat') !== null && parseCoord(f.longitude, 'lng') !== null;
  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={site ? 'Edit address' : 'Add address'}
      footer={<>
        <button type="button" onClick={onClose} disabled={busy} style={ghostBtn}>Cancel</button>
        <button type="button" onClick={save} disabled={busy} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : 'Save'}</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row label="Label *"><input aria-label="Label" value={f.name} onChange={(e) => set('name')(e.target.value)} placeholder="e.g. Head office, Plant 2" style={inp} /></Row>
        <div>
          {/* The picker renders its own "Search address" label. */}
          <GoogleAddressAutocomplete deviceFill={false} backend onSelect={onPick} />
          {hasPin && <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 4 }}>📍 Map pin set from the picked address</div>}
        </div>
        <Row label="Address line 1"><input aria-label="Address line 1" value={f.address_line1} onChange={(e) => set('address_line1')(e.target.value)} style={inp} /></Row>
        <Row label="Address line 2"><input aria-label="Address line 2" value={f.address_line2} onChange={(e) => set('address_line2')(e.target.value)} style={inp} /></Row>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Row label="City"><input aria-label="City" value={f.city} onChange={(e) => set('city')(e.target.value)} style={inp} /></Row>
          <Row label="State"><input aria-label="State" value={f.state} onChange={(e) => set('state')(e.target.value)} style={inp} /></Row>
          <Row label="PIN code"><input aria-label="PIN code" value={f.postal_code} onChange={(e) => set('postal_code')(e.target.value)} inputMode="numeric" style={inp} /></Row>
          <Row label="Country"><input aria-label="Country" value={f.country} onChange={(e) => set('country')(e.target.value)} style={inp} /></Row>
        </div>
        <Row label="Notes"><textarea aria-label="Notes" rows={2} value={f.notes} onChange={(e) => set('notes')(e.target.value)} style={{ ...inp, fontFamily: 'inherit', resize: 'vertical' }} /></Row>
        {error && <div role="alert" style={{ fontSize: 12, color: '#ef4444' }}>{error}</div>}
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}><span style={lbl}>{label}</span>{children}</div>;
}
const lbl: React.CSSProperties = { fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 };
const inp: React.CSSProperties = { background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const ghostBtn: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' };

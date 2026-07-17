'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmSettings, crmLeadSources, crmProducts, crmTargets, type MyTarget } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import { reverseGeocode } from '../../../../../lib/googleGeocode';
import { useClient } from '../../../../../context/ClientContext';
import type { BusinessType, LeadSource, Product } from '../../../../../types/crm';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import GoogleAddressAutocomplete from '../../../../../components/crm/GoogleAddressAutocomplete';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';
import AlternateMobiles from '../../../../../components/crm/AlternateMobiles';
import ClientScopeField from '../../../../../components/ClientScopeField';
import { buildFieldHelpers, extractFieldOverrides, type FieldOverrides } from '../../../../../lib/crmFieldOverrides';

type UserOpt = UserOption;

// True when ANY custom field on the lead matches the "first site visit"
// shape and carries a truthy value. Admins name the field differently
// per tenant (first_visit_date, first_site_visit, is_first_visit …), so
// we match the SHAPE of the key rather than a single hardcoded one.
// Used by the new-lead + edit flows to decide whether the auto-spawned
// activity subject reads "First Site Visit" instead of "Site visit".
function isFirstSiteVisit(cf: Record<string, unknown> | null | undefined): boolean {
  if (!cf) return false;
  return Object.entries(cf).some(([key, val]) => {
    const k = String(key).toLowerCase();
    if (!/first/.test(k) || !/(visit|site)/.test(k)) return false;
    if (val === true) return true;
    if (typeof val === 'string' && val.trim() !== '') return true;
    if (typeof val === 'number' && val !== 0) return true;
    return false;
  });
}

// Tata Tiscon is consumer-only — never offer the B2B lead option. BMW is
// folded in as the second steel-dealer tenant and is likewise strictly B2C.
const TATA_TISCON_CLIENT_ID = 'a1f67468-526e-4734-be3a-2cb132cc2804';
const BMW_CLIENT_ID = '2ee5e03a-3a56-41c9-aaa0-16468920f871';
const STEEL_DEALER_CLIENT_IDS = [TATA_TISCON_CLIENT_ID, BMW_CLIENT_ID];
// The parent Kinematic tenant runs an inside-sales CRM, not a field-force
// one — GPS lead-tagging is irrelevant there, so location capture is hidden
// and never required for it.
const KINEMATIC_CLIENT_ID = '7ecd47d7-9268-4ea2-a8ce-384978c13667';

type Form = {
  first_name: string; last_name: string; email: string; phone: string;
  company: string; title: string; industry: string; is_b2c: boolean;
  date_of_birth: string; gender: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address_line1: string; address_line2: string; city: string; state: string;
  postal_code: string; country: string;
  preferred_contact_method: '' | 'email' | 'phone' | 'whatsapp' | 'sms';
  marketing_consent: boolean; whatsapp_consent: boolean;
  source_id: string; owner_id: string; status: string;
  product_ids: string[];
  alternate_mobiles: string[];
  client_id: string;
  // Geo coordinates as strings for controlled inputs; parsed to numbers on submit.
  latitude: string; longitude: string;
  // Free-form jsonb for admin-defined custom fields. Keys match
  // crm_custom_field_defs.field_key for the current entity.
  custom_fields: Record<string, unknown>;
  // Tata Tiscon affordance — backend pops this on POST and atomically
  // spawns a completed `site_visit` activity tied to the new lead.
  // Visible + on-by-default for Tata only; ignored elsewhere.
  log_as_site_visit: boolean;
};

const empty: Form = {
  first_name: '', last_name: '', email: '', phone: '', company: '', title: '', industry: '',
  is_b2c: false, date_of_birth: '', gender: '', address_line1: '', address_line2: '',
  city: '', state: '', postal_code: '', country: 'India',
  preferred_contact_method: '', marketing_consent: false, whatsapp_consent: false,
  source_id: '', owner_id: '', status: 'new', product_ids: [], alternate_mobiles: [],
  client_id: '',
  latitude: '', longitude: '',
  custom_fields: {},
  // Default ON for Tata: every Champion lead creation is a physical
  // site visit, and reps weren't reliably ticking the checkbox — the
  // activity section never populated. They can still uncheck it when
  // they're recording a lead they DIDN'T visit. Toggle stays hidden
  // on non-Tata tenants so this default doesn't pollute other tenants.
  log_as_site_visit: true,
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  // Self-only roles (org_role.data_scope === 'own', e.g. Consumer Champion)
  // can't assign leads to others — they own what they create.
  const [selfOnly, setSelfOnly] = useState(false);

  // Capture the device's current position. Coordinates are mandatory and
  // non-editable: the lead is geo-tagged with the rep's actual location at
  // capture time, so we auto-request on load and offer a retry on failure.
  //
  // Strategy: two-stage capture, because GPS cold-starts can take 30–60s and
  // most reps are indoors when entering leads.
  //   Stage 1 (fast):  enableHighAccuracy=false  → WiFi/cell-tower fix that
  //                    usually returns in 1–3s and works indoors. Lets the
  //                    rep proceed immediately with a "good enough" position.
  //   Stage 2 (precise): enableHighAccuracy=true → GPS fix that overrides the
  //                      coarse one in the background. Up to 30s timeout.
  //
  // Either fix unblocks the form. The previous "GPS only, 10s, no cache"
  // setup was so strict that anyone indoors got
  // "Could not get your location" with no path forward.
  const captureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError('Location is not available on this device/browser.');
      return;
    }
    setGeoBusy(true);
    setGeoError('');

    const accept = (pos: GeolocationPosition) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      setForm((f) => ({
        ...f,
        latitude: lat.toFixed(6),
        longitude: lng.toFixed(6),
      }));
      setGeoBusy(false);
      setGeoError('');
      // Auto-populate the address line / city / state / postal code
      // from the GPS fix. Only fills fields that are still blank so a
      // value the rep already typed (or picked from autocomplete)
      // wins over the geocode. Silent on failure — the autocomplete
      // dropdown is the manual fallback.
      void reverseGeocode(lat, lng).then((addr) => {
        if (!addr) return;
        setForm((f) => ({
          ...f,
          address_line1: f.address_line1 || addr.address_line1 || '',
          city:          f.city          || addr.city          || '',
          state:         f.state         || addr.state         || '',
          postal_code:   f.postal_code   || addr.postal_code   || '',
        }));
      });
    };

    // Stage 2 — start the high-accuracy upgrade alongside Stage 1 so the GPS
    // chipset can warm up while we already have a coarse fix to show the user.
    navigator.geolocation.getCurrentPosition(
      accept,
      () => { /* Stage 2 failure is silent — Stage 1 already populated. */ },
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 0 },
    );

    // Stage 1 — fast coarse fix. WiFi/cell-tower is fine for a lead pin and
    // works indoors where GPS doesn't. Accepts positions up to 60s old.
    navigator.geolocation.getCurrentPosition(
      accept,
      (err) => {
        setGeoBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError('Location permission denied. Enable location access in your browser and retry — it’s required to add a lead.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError('Location is temporarily unavailable. Make sure Location Services / Wi-Fi are on, then click Retry. (Indoor signal can be weak — moving near a window or door usually fixes it.)');
        } else {
          setGeoError('Could not lock onto your location yet. Click Retry — it usually works on the second try, especially with Wi-Fi enabled.');
        }
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  const [businessType, setBusinessType] = useState<BusinessType>('both');
  // Today's lead target for the signed-in rep — shown as a ticker while
  // entering leads (null = no target / not loaded → ticker hidden).
  const [myTarget, setMyTarget] = useState<MyTarget | null>(null);
  // Tata Tiscon is consumer-only: never show the B2B option for that client,
  // regardless of the org-wide business_type. Detect the effective client
  // (the one chosen on the form, the user's pinned client, or the global
  // scope picker) so it works for both Tata-pinned staff and admins.
  const { selectedClientId } = useClient();
  const userClientId = useMemo<string | null>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      return raw ? (JSON.parse(raw)?.client_id ?? null) : null;
    } catch { return null; }
  }, []);
  const isTata = STEEL_DEALER_CLIENT_IDS.includes((form.client_id || userClientId || selectedClientId) ?? '');
  // The master admin (s@) runs the parent Kinematic CRM at org level: no
  // field-force GPS capture, and new leads default to the Kinematic client so
  // there's no per-form tenant picker to deal with.
  const isMasterAdmin = useMemo<boolean>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      return raw ? (JSON.parse(raw)?.email || '').toLowerCase() === 's@kinematicapp.com' : false;
    } catch { return false; }
  }, []);
  // Kinematic's own inside-sales CRM doesn't geo-tag leads — skip the GPS
  // capture entirely (auto-request, the Pin Location card, and the mandatory
  // check below all key off this). The master admin is exempt too.
  const isKinematic = (form.client_id || userClientId || selectedClientId) === KINEMATIC_CLIENT_ID;
  const skipLocation = isKinematic || isMasterAdmin;
  // Master admin's new leads default to the Kinematic client (or the globally
  // picked client, if they chose one) so they land under the right tenant
  // without a per-form picker.
  useEffect(() => {
    if (isMasterAdmin) setForm((f) => ({ ...f, client_id: selectedClientId || KINEMATIC_CLIENT_ID }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMasterAdmin, selectedClientId]);
  // Auto-request location on first load — coordinates are mandatory, except
  // for Kinematic / master admin where location capture is disabled.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!skipLocation) captureLocation(); }, [skipLocation]);
  // Force B2C for Tata (the toggle is hidden, so the default must not stay B2B).
  useEffect(() => {
    if (isTata) setForm((f) => (f.is_b2c ? f : { ...f, is_b2c: true }));
  }, [isTata]);
  // Per-tenant field overrides (label / required / hidden) for built-in
  // lead fields. Edited from Admin → CRM Settings → Custom Fields, stored
  // in crm_settings.config.field_overrides. Empty until first fetch — every
  // field renders with its hardcoded default in the interim.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  // Pass the active B2C/B2B scope so overrides like "email required for
  // B2B only" or "last_name optional for B2C" take precedence over the
  // universal entry for the same field.
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'lead', form.is_b2c ? 'b2c' : 'b2b'),
    [fieldOverrides, form.is_b2c],
  );
  // Business fields (company/title/industry) live on the B2B branch by
  // default. An admin can opt them onto B2C forms by explicitly un-hiding
  // the field in Settings → Custom Fields (which persists `hidden: false`).
  // Default-visible (no override at all) does NOT pull them onto B2C, so
  // tenants that never touched these keep the B2B-only behaviour untouched.
  const explicitlyShownOnB2C = useCallback((k: string): boolean => {
    const uni = fieldOverrides[`lead.${k}`];
    const b2c = fieldOverrides[`lead.${k}@b2c`];
    const merged = { ...(uni ?? {}), ...(b2c ?? {}) };
    return merged.hidden === false;
  }, [fieldOverrides]);
  const anyBizOnB2C = explicitlyShownOnB2C('company') || explicitlyShownOnB2C('title') || explicitlyShownOnB2C('industry');
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoGalleryRef = useRef<HTMLInputElement>(null);
  const photoCameraRef  = useRef<HTMLInputElement>(null);

  // Upload via /api/v1/upload/photo — same backend endpoint as the
  // activity-photo flow. Multer middleware expects the file under
  // field name `photo`.
  const uploadPhoto = async (f: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast.error('Pick an image file'); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error('Image must be under 8 MB'); return; }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('photo', f);
      const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
      const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/photo`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
        body: fd,
      });
      const json = await r.json();
      const url = json?.data?.url || json?.url;
      if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
      setPhotoUrl(url);
      toast.success('Photo uploaded');
    } catch (e: any) { toast.error(e.message || 'Upload failed'); }
    finally {
      setUploadingPhoto(false);
      if (photoGalleryRef.current) photoGalleryRef.current.value = '';
      if (photoCameraRef.current)  photoCameraRef.current.value  = '';
    }
  };

  useEffect(() => {
    (async () => {
      const [s, src, u, p, meRes] = await Promise.allSettled([
        crmSettings.get(),
        crmLeadSources.list(),
        api.getUsers({ limit: '500' }) as Promise<any>,
        crmProducts.list(),
        api.get<any>('/api/v1/auth/me'),
      ]);
      if (meRes.status === 'fulfilled') {
        const me = (meRes.value as any)?.data ?? meRes.value;
        if (me?.org_role?.data_scope === 'own') {
          setSelfOnly(true);
          // Default the owner to the current user so the lead is theirs.
          if (me.id) setForm((f) => ({ ...f, owner_id: f.owner_id || me.id }));
        }
      }
      if (s.status === 'fulfilled') {
        const t: BusinessType = s.value.data?.business_type ?? 'both';
        setBusinessType(t);
        if (t !== 'both') setForm((f) => ({ ...f, is_b2c: t === 'b2c' }));
        setFieldOverrides(extractFieldOverrides(s.value.data));
      }
      if (src.status === 'fulfilled') setSources((src.value.data || []).filter((x: LeadSource) => x.is_active));
      if (u.status === 'fulfilled') {
        const list: UserOpt[] = (u.value.data || u.value || []).map((x: any) => ({ id: x.id, name: x.name || x.full_name || x.email || 'User' }));
        setUsers(list);
      }
      if (p.status === 'fulfilled') setProducts((p.value.data || []).filter((x: Product) => x.is_active));
    })();
    // Today's lead target for the ticker (best-effort; hidden if none set).
    crmTargets.mine().then((r) => setMyTarget(r?.data ?? null)).catch(() => setMyTarget(null));
  }, []);

  const toggleProduct = (id: string) => {
    setForm((f) => ({
      ...f,
      product_ids: f.product_ids.includes(id)
        ? f.product_ids.filter((x) => x !== id)
        : [...f.product_ids, id],
    }));
  };

  // Scroll the named field into view and focus its input/select so the
  // user can fix the missing value immediately. On mobile, validation
  // toasts at the top of the page get missed when the user is at the
  // bottom looking at the submit button — without this, "Create Lead"
  // appears to do nothing on a half-filled form.
  const scrollToField = (id: string) => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (!el) return;
    // Wrappers like the city picker use `display: contents` so they have
    // no box of their own — scrollIntoView on them is a no-op. Scroll
    // the first focusable child instead (the actual input/select the
    // user needs to fix), falling back to the wrapper element.
    const focusable: HTMLElement | null = el.matches('input,select,textarea,button')
      ? (el as HTMLElement)
      : el.querySelector('input,select,textarea,button');
    const scrollTarget: Element = focusable || el;
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // preventScroll: we already smooth-scrolled; focus() would otherwise
    // snap-jump on iOS Safari and undo the smooth scroll.
    try { focusable?.focus({ preventScroll: true }); } catch { focusable?.focus(); }
  };

  // Single missing-field bailout: toast + scroll-to + focus the offending
  // field. Returns true so callers can `if (fail(...)) return;` cleanly.
  const fail = (id: string, message: string) => {
    toast.error(message);
    scrollToField(id);
    return true;
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // first_name is required by default — was previously only enforced
    // by the HTML5 `required` attr, which on mobile shows a tiny native
    // tooltip the user often misses. Promote it to an explicit JS check
    // so we can scroll-to-field consistently with the others.
    if (
      !fields.isHidden('first_name') &&
      fields.requiredFor('first_name', true) &&
      (!form.first_name || !form.first_name.trim())
    ) {
      fail('lead-field-first_name', 'First name is required.');
      return;
    }
    // Skip the field if the admin hid it, OR if they explicitly made it
    // optional for the active business-type scope. The backend's
    // leadCreateSchema has last_name as a hard min(1) on the universal
    // path; clients that switch it to optional via field overrides also
    // need a matching backend rule (handled elsewhere) — this block
    // just makes the dashboard stop forcing the field on its own.
    if (
      !fields.isHidden('last_name') &&
      fields.requiredFor('last_name', true) &&
      (!form.last_name || !form.last_name.trim())
    ) {
      fail('lead-field-last_name', 'Last name is required.');
      return;
    }
    // Phone / email defaults are NOT scope-aware anymore. The form
    // honours whatever the admin sets in Settings → Custom Fields
    // (`lead.phone` / `lead.email` overrides, optionally scoped via
    // @b2b / @b2c). With no override saved, both fields are optional —
    // matching the BUILTIN_FIELDS row in settings, so the lead form
    // and the settings page never disagree. Tenants that need email
    // mandatory on B2B leads (or phone mandatory on B2C) can flip the
    // toggle in settings once and the form picks it up immediately.
    if (
      !isTata &&
      !fields.isHidden('email') &&
      fields.requiredFor('email', false) &&
      (!form.email || !form.email.trim())
    ) {
      fail('lead-field-email', 'Email is required.');
      return;
    }
    if (
      !fields.isHidden('phone') &&
      fields.requiredFor('phone', true) &&
      (!form.phone || !form.phone.trim())
    ) {
      fail('lead-field-phone', 'Primary mobile is required.');
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      fail('lead-field-phone', 'Primary mobile must be a 10-digit number');
      return;
    }
    // B2B-only mandatory field. Was previously enforced via the HTML5
    // `required` attr on the company input — promote to JS so we can
    // scroll-to-field on mobile.
    if (
      !form.is_b2c &&
      !fields.isHidden('company') &&
      (!form.company || !form.company.trim())
    ) {
      fail('lead-field-company', 'Company is required for B2B leads.');
      return;
    }
    // City is required on most leads — without it the per-user city
    // scope filter has nothing to match against and the lead would
    // leak to other reps. Block submit early with a clear message
    // instead of letting the backend 400. Skip the guard when the
    // admin has hidden the field OR explicitly toggled it optional
    // for the active business-type scope.
    if (
      !fields.isHidden('city') &&
      fields.requiredFor('city', true) &&
      (!form.city || !form.city.trim())
    ) {
      fail('lead-field-city', 'City is required — pick from the city dropdown.');
      return;
    }
    // Location is mandatory and auto-captured — block submit until we have it.
    // Kinematic's inside-sales CRM doesn't geo-tag leads, so it's exempt.
    if (!skipLocation && (!form.latitude || !form.longitude)) {
      captureLocation();
      fail('lead-field-location', 'Location is required. Allow location access, then tap “Use my current location”.');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name || undefined, last_name: form.last_name || undefined,
        email: form.email || undefined, phone: form.phone || undefined, is_b2c: isTata || form.is_b2c,
        source_id: form.source_id || undefined,
        owner_id: form.owner_id || undefined,
        status: form.status || 'new',
        product_ids: form.product_ids.length > 0 ? form.product_ids : undefined,
        alternate_mobiles: form.alternate_mobiles.length ? form.alternate_mobiles : undefined,
        client_id: form.client_id || undefined,
        // City + state always sent (B2B + B2C). Backend schema enforces
        // city.min(1); state is optional but auto-inferred client-side
        // from the city catalog when the user picks an assigned city.
        city: form.city.trim(),
        state: form.state || undefined,
        // Geo coordinates — sent only when both are present and numeric.
        latitude:  form.latitude.trim()  !== '' && !Number.isNaN(Number(form.latitude))  ? Number(form.latitude)  : undefined,
        longitude: form.longitude.trim() !== '' && !Number.isNaN(Number(form.longitude)) ? Number(form.longitude) : undefined,
        // Admin-defined custom fields (jsonb). Empty object means
        // there were either no custom fields configured for this
        // entity or the rep didn't fill any. Backend keeps the column.
        custom_fields: Object.keys(form.custom_fields).length > 0 ? form.custom_fields : undefined,
        photo_url: photoUrl || undefined,
      };
      // Business fields persist on B2B always, and on B2C when an admin has
      // explicitly un-hidden them (so the value the rep typed actually saves).
      const bizOnB2C = form.is_b2c && anyBizOnB2C;
      if (!form.is_b2c || bizOnB2C) {
        Object.assign(payload, { company: form.company || undefined, title: form.title || undefined, industry: form.industry || undefined });
      }
      if (form.is_b2c) {
        Object.assign(payload, {
          date_of_birth: form.date_of_birth || undefined, gender: form.gender || undefined,
          address_line1: form.address_line1 || undefined, address_line2: form.address_line2 || undefined,
          postal_code: form.postal_code || undefined, country: form.country || undefined,
          preferred_contact_method: form.preferred_contact_method || undefined,
          marketing_consent: form.marketing_consent, whatsapp_consent: form.whatsapp_consent,
        });
      }
      // Tata Tiscon: backend pops this flag before persisting and atomically
      // spawns a completed `site_visit` activity tied to the new lead. Sent
      // only when the rep is on a Tata tenant + has the toggle on.
      if (isTata && form.log_as_site_visit) {
        payload._auto_log_site_visit = true;
      }
      const r = await crmLeads.create(payload);
      toast.success('Lead created');
      // After creating a lead on Tata, ALWAYS hop to the activity
      // compose screen pre-filled with this lead + Meeting (matches
      // the user requirement: "Do not add the activity by default,
      // just open the activity section with information pre-filled
      // like Meeting selected by default."). We don't gate on the
      // backend echoing back `auto_log_site_visit_prefill` because
      // the rep wants this redirect for every new lead, not just
      // when they ticked a toggle. Non-Tata tenants keep the
      // legacy "land on lead detail" flow.
      if (isTata && r.data?.id) {
        const name = [form.first_name, form.last_name].filter(Boolean).join(' ').trim()
          || form.email || form.phone || 'Lead';
        const qs = new URLSearchParams({
          lead_id: r.data.id,
          type: 'meeting',
          subject: `Meeting — ${name}`,
        }).toString();
        router.push(`/dashboard/crm/activities/new?${qs}`);
        return;
      }
      router.push(`/dashboard/crm/leads/${r.data.id}`);
    } catch (e: any) { toast.error(e.message || 'Create failed'); setBusy(false); }
  };

  // `text()` builds a labelled <input>. When `opts.phone` is true the
  // input is numeric-only (no letters), capped at 10 digits, and pulls
  // up the phone keypad on mobile.
  // text() / select() consult the admin's field-override map: hidden ⇒
  // omit the field entirely, label override ⇒ render the new label,
  // required override ⇒ flip the asterisk + browser-level required attr.
  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean; phone?: boolean } = {}) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel    = fields.labelFor(k as string, label);
    const effRequired = fields.requiredFor(k as string, !!opts.required);
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>
          {effLabel}{effRequired && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
        </span>
        <input
          id={`lead-field-${k as string}`}
          type={opts.phone ? 'tel' : (opts.type || 'text')}
          inputMode={opts.phone ? 'numeric' : undefined}
          pattern={opts.phone ? '[0-9]{10}' : undefined}
          maxLength={opts.phone ? 10 : undefined}
          autoComplete={opts.phone ? 'tel-national' : undefined}
          placeholder={opts.phone ? '10-digit mobile' : undefined}
          value={form[k] as string}
          onChange={(e) => {
            const v = opts.phone ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
            setForm({ ...form, [k]: v });
          }}
          required={effRequired}
          style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}
        />
      </label>
    );
  };
  const select = (k: keyof Form, label: string, options: Array<{ value: string; label: string }>) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel = fields.labelFor(k as string, label);
    return (
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{effLabel}</span>
        <select id={`lead-field-${k as string}`} value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          <option value="">—</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    );
  };

  // Tata is consumer-only: hide the B2B/B2C toggle and force B2C (above).
  const showToggle = businessType === 'both' && !isTata;
  const leadTypeLabel = businessType === 'b2c'
    ? 'Individual consumer lead — capture contact details and preferences.'
    : businessType === 'b2b'
      ? 'Business lead — capture company and decision-maker info.'
      : (form.is_b2c
        ? 'Individual consumer lead — capture contact details and preferences.'
        : 'Business lead — capture company and decision-maker info.');

  return (
    <form onSubmit={submit} noValidate style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, maxWidth: 820 }}>
      <h2 style={{ marginTop: 0, fontSize: 18, color: 'var(--text)' }}>New Lead</h2>
      <p style={{ margin: '-4px 0 18px', fontSize: 13, color: 'var(--text-dim)' }}>
        {leadTypeLabel}{' '}Fields marked <span style={{ color: '#ef4444' }}>*</span> are required.
      </p>

      {myTarget && myTarget.target > 0 && (() => {
        const done = myTarget.achieved >= myTarget.target;
        const accent = done ? '#0A8A4E' : '#E01E2C';
        const pct = Math.min(100, Math.round((myTarget.achieved / myTarget.target) * 100));
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--s3)', border: `1px solid ${accent}55`, marginBottom: 18 }}>
            <span style={{ fontSize: 16 }}>{done ? '✅' : '🎯'}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Today&apos;s lead target</span>
            <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', minWidth: 60 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 99, transition: 'width .3s' }} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: accent }}>{myTarget.achieved}/{myTarget.target}</span>
          </div>
        );
      })()}

      {/* Master admin runs the single Kinematic tenant — the client is set
          automatically, so hide the picker. */}
      {!isMasterAdmin && (
        <ClientScopeField value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} />
      )}

      {showToggle && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: true })} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2C Consumer</button>
          <button type="button" onClick={() => setForm({ ...form, is_b2c: false })} style={{ flex: '1 1 140px', padding: '10px 14px', borderRadius: 8, border: `1px solid ${!form.is_b2c ? 'var(--primary)' : 'var(--border)'}`, background: !form.is_b2c ? 'var(--primary)' : 'var(--s3)', color: !form.is_b2c ? '#fff' : 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>B2B Business</button>
        </div>
      )}


      <Section title="Personal">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          {text('first_name', 'First Name', { required: fields.requiredFor('first_name', true) })}
          {text('last_name',  'Last Name',  { required: fields.requiredFor('last_name',  true) })}
          {/* Email field is hidden entirely for Tata Tiscon — their FE
              walk-in flow doesn't collect email, and prompting for it
              just to skip it adds friction. */}
          {!isTata && text('email', 'Email', { type: 'email', required: fields.requiredFor('email', false) })}
          {text('phone',      'Primary Mobile', { required: fields.requiredFor('phone', true), phone: true })}
        </div>
        <AlternateMobiles
          values={form.alternate_mobiles}
          primary={form.phone}
          onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
        />
      </Section>

      {(!fields.isHidden('status') || !fields.isHidden('source_id') || !fields.isHidden('owner_id')) && (
        <Section title="Lifecycle & Assignment">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {!fields.isHidden('status') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('status', 'Status')}</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  <option value="new">New</option>
                  <option value="working">Working</option>
                  <option value="qualified">Qualified</option>
                  <option value="unqualified">Unqualified</option>
                </select>
              </label>
            )}
            {!fields.isHidden('source_id') && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('source_id', 'Source')}</span>
                <select value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })} style={{ background: 'var(--s3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
                  <option value="">— Unspecified —</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
            {/* Self-only roles (e.g. Consumer Champion, data_scope='own') always
                own the leads they create — hide the assign control and default
                the owner to themselves. */}
            {!fields.isHidden('owner_id') && !selfOnly && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 700 }}>{fields.labelFor('owner_id', 'Assign To')}</span>
                <UserSearchSelect
                  options={users}
                  value={form.owner_id}
                  onChange={(id) => setForm({ ...form, owner_id: id })}
                  placeholder="Search team member…"
                  emptyLabel="Unassigned (auto-route by rules)"
                />
              </label>
            )}
          </div>
        </Section>
      )}

      {!form.is_b2c ? (
        <>
          <Section title="Business Details">
            {/* Custom fields render inline inside this grid so admin-
                defined fields look like part of the form, not a tacked-
                on extension. CustomFieldsSection yields raw <label>
                children with no wrapper of its own. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('company', 'Company', { required: true })}
              {text('title', 'Job Title')}
              {text('industry', 'Industry')}
              <CustomFieldsSection
                entity="lead"
                values={form.custom_fields}
                onChange={(cf) => setForm({ ...form, custom_fields: cf })}
              />
            </div>
          </Section>
          {/* City is required on B2B leads too — the per-user city-scope
              filter applies to every lead row regardless of B2B/B2C. */}
          {!fields.isHidden('city') && (
            <Section title="Location">
              <div id="lead-field-city" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} required={fields.requiredFor('city', true)} />
              </div>
            </Section>
          )}
        </>
      ) : (
        <>
          {/* Business Details on a B2C lead — only when an admin explicitly
              un-hid company/title/industry (Settings → Custom Fields writes
              hidden:false). Keeps the B2B-only default for untouched tenants. */}
          {anyBizOnB2C && (
            <Section title="Business Details">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {explicitlyShownOnB2C('company')  && text('company', 'Company')}
                {explicitlyShownOnB2C('title')    && text('title', 'Job Title')}
                {explicitlyShownOnB2C('industry') && text('industry', 'Industry')}
              </div>
            </Section>
          )}
          <Section title="Customer Details">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              {text('date_of_birth', 'Date of Birth', { type: 'date' })}
              {select('gender', 'Gender', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }])}
              {select('preferred_contact_method', 'Preferred Channel', [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }])}
            </div>
          </Section>
          <Section title="Address">
            {/* Custom fields are inlined into the B2C Address grid for
                the same reason they're in the B2B grid above — they
                read as part of the form, not a footnote. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <GoogleAddressAutocomplete onSelect={(p) => setForm((f) => ({
                ...f,
                address_line1: p.address_line1 || f.address_line1,
                city: p.city || f.city,
                state: p.state || f.state,
                postal_code: p.postal_code || f.postal_code,
                latitude: p.latitude || f.latitude,
                longitude: p.longitude || f.longitude,
              }))} />
              {text('address_line1', 'Address Line 1')}{text('address_line2', 'Address Line 2')}
              {/* LocationPicker covers state + city. Hide it when the admin
                  has hidden the city built-in (state alone has no value). */}
              {!fields.isHidden('city') && (
                <div id="lead-field-city" style={{ display: 'contents' }}>
                  <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} required={fields.requiredFor('city', true)} />
                </div>
              )}
              {text('postal_code', 'Postal Code')}{text('country', 'Country')}
              <CustomFieldsSection
                entity="lead"
                values={form.custom_fields}
                onChange={(cf) => setForm({ ...form, custom_fields: cf })}
              />
            </div>
          </Section>
          {(!fields.isHidden('marketing_consent') || !fields.isHidden('whatsapp_consent')) && (
            <Section title="Consent">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                {!fields.isHidden('marketing_consent') && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} />{fields.labelFor('marketing_consent', 'Customer agreed to receive marketing communications')}</label>
                )}
                {!fields.isHidden('whatsapp_consent') && (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.whatsapp_consent} onChange={(e) => setForm({ ...form, whatsapp_consent: e.target.checked })} />{fields.labelFor('whatsapp_consent', 'Customer agreed to be contacted via WhatsApp')}</label>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Products of Interest is captured in the Convert dialog (deal_product_lines)
          for Kaiyo/Tata, not on the lead form — the rep picks products when the
          lead becomes a deal, so the picker no longer renders here. */}

      {!skipLocation && (
      <Section title="Pin Location (required)">
        <div id="lead-field-location" style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          The lead is geo-tagged with your current location. This is captured automatically and is required to add a lead.
        </div>
        {form.latitude && form.longitude ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Location captured</div>
              {/* Read-only — coordinates can't be edited by hand. */}
              <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', marginTop: 2 }}>
                {form.latitude}, {form.longitude}
              </div>
            </div>
            <button
              type="button"
              onClick={captureLocation}
              disabled={geoBusy}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '8px 12px', borderRadius: 8, fontSize: 12, cursor: geoBusy ? 'wait' : 'pointer' }}
            >{geoBusy ? 'Updating…' : 'Update'}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: 'var(--s3)', border: `1px solid ${geoError ? '#ef4444' : 'var(--border)'}`, borderRadius: 10 }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div style={{ flex: 1, fontSize: 12, color: geoError ? '#ef4444' : 'var(--text-dim)' }}>
              {geoBusy ? 'Getting your location…' : (geoError || 'Waiting for location…')}
            </div>
            <button
              type="button"
              onClick={captureLocation}
              disabled={geoBusy}
              style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: geoBusy ? 'wait' : 'pointer', opacity: geoBusy ? 0.6 : 1 }}
            >📍 {geoBusy ? 'Locating…' : 'Use my current location'}</button>
          </div>
        )}
      </Section>
      )}

      {/* Tata Tiscon: tick to atomically spawn a completed `site_visit`
          activity tied to the new lead. Default on because most adds
          happen at the dealer / consumer counter; the toggle stays
          invisible on every other tenant via the isTata gate. */}
      {isTata && (
        <Section title="Activity">
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.log_as_site_visit}
              onChange={(e) => {
                const on = e.target.checked;
                setForm({ ...form, log_as_site_visit: on });
                // Ticking the toggle is the "save & open the activity
                // composer" shortcut. We trigger the existing submit
                // handler — required-field guards still run, so an
                // empty form surfaces the same validation toasts
                // (first-name, phone, coordinates) before any save.
                if (on && !busy) void submit();
              }}
              style={{ marginTop: 3 }}
            />
            <span>
              <strong style={{ color: 'var(--text)' }}>Also log this lead as a Site Visit activity</strong>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
                Saves this lead and opens the Site Visit activity composer pre-filled.
                When the First Visit Date custom field is filled in, the activity is recorded as a First Site Visit instead.
              </div>
            </span>
          </label>
        </Section>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.back()} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
        <button type="submit" disabled={busy || (!skipLocation && (!form.latitude || !form.longitude))} title={!skipLocation && (!form.latitude || !form.longitude) ? 'Capture your location to enable' : undefined} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 700, cursor: (busy || (!skipLocation && (!form.latitude || !form.longitude))) ? 'not-allowed' : 'pointer', opacity: (busy || (!skipLocation && (!form.latitude || !form.longitude))) ? 0.6 : 1 }}>{busy ? 'Saving...' : 'Create Lead'}</button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

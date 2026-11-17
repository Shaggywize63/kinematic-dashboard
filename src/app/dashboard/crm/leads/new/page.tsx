'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads, crmSettings, crmLeadSources, crmProducts, crmMakes, crmSites, crmTargets, crmAccounts, crmContacts, type AccountSite, type MyTarget, type ExtractedLead } from '../../../../../lib/crmApi';
import api from '../../../../../lib/api';
import { isB2bClientActive } from '../../../../../lib/b2bClient';
import { LEAD_TYPE_DEFAULT_LABEL, LEAD_TYPE_OPTIONS, leadTypeForApi } from '../../../../../lib/leadType';
import { reverseGeocode } from '../../../../../lib/googleGeocode';
import { useClient } from '../../../../../context/ClientContext';
import type { BusinessType, LeadSource, Product, CustomField, Make } from '../../../../../types/crm';
import LocationPicker from '../../../../../components/crm/LocationPicker';
import CustomFieldsSection from '../../../../../components/crm/CustomFieldsSection';
import GoogleAddressAutocomplete, { type PlaceResult } from '../../../../../components/crm/GoogleAddressAutocomplete';
import IndustrySelect from '../../../../../components/crm/spark/IndustrySelect';
import UserSearchSelect, { type UserOption } from '../../../../../components/crm/shared/UserSearchSelect';
import AlternateMobiles from '../../../../../components/crm/AlternateMobiles';
import LeadIdentityStrip from '../../../../../components/crm/spark/LeadIdentityStrip';
import PlantPicker from '../../../../../components/crm/spark/PlantPicker';
import { InlineLeadVoiceCapture } from '../../../../../components/crm/VoiceCaptureOverlay';
import ClientScopeField from '../../../../../components/ClientScopeField';
import { UNORDERED_LAST, buildFieldHelpers, extractFieldOverrides, type FieldOverrides, type FieldScope } from '../../../../../lib/crmFieldOverrides';
import { extractLeadStatuses, type LeadStatusOption } from '../../../../../lib/crmLeadStatuses';
import { STEEL_DEALER_CLIENT_IDS, BMW_CLIENT_ID, isWalkInExecutive } from '../../../../../lib/clientFeatures';
import { getStoredUser } from '../../../../../lib/auth';
import { orderLeadSources } from '../../../../../lib/leadSourceOrder';
import { clearSubIndustryOnChange, industryOptions, subIndustryOptions, useIndustries } from '../../../../../lib/industries';
import {
  DEFAULT_LEAD_FORM, extractLeadForm, localDateTimeToIso, offersScheduleVisit, segmentName, segmentToggleLabel, showsAddress,
  type LeadFormConfig,
} from '../../../../../lib/crmLeadForm';
import { useLeadOwnerAccess } from '../../../../../lib/leadOwnerAccess';
import { Button, Eyebrow, Field, FormGrid, Input, PageHeader, Section as FormSection, Segmented, Select, T, Textarea, cardStyle, requiredMark, useIsCompact } from '../../../../../components/ui';
import { usePageTitle } from '../../../../../lib/pageTitle';
import { Check, CheckCircle2, Info, LocateFixed, MapPin, Target } from 'lucide-react';

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

// Steel-dealer tenants (Tata Tiscon / SRS, BMW, PASA) are consumer-only — never
// offer the B2B lead option — and they get the Site Visit auto-log on lead
// create. Sourced from the single canonical STEEL_DEALER_CLIENT_IDS in
// clientFeatures.ts so a newly onboarded steel-dealer tenant (e.g. PASA) can't
// be missed on this form the way it was before.
// The parent Kinematic tenant runs an inside-sales CRM, not a field-force
// one — GPS lead-tagging is irrelevant there, so location capture is hidden
// and never required for it.
const KINEMATIC_CLIENT_ID = '7ecd47d7-9268-4ea2-a8ce-384978c13667';

type Form = {
  first_name: string; last_name: string; email: string; phone: string;
  company: string; title: string; industry: string; is_b2c: boolean;
  // Connected-B2B (Spark & Ray): when the rep links the lead's company to an
  // existing CRM account via the typeahead, its id is pinned here and sent so
  // the backend reuses that account instead of matching/creating one by name.
  account_id: string;
  // Spark & Ray structured B2B (Option A: one lead = one person + one requirement).
  // group/location/plant are sent by NAME — the backend de-dupes/creates them
  // (findOrCreateAccount/Site match case-insensitively), so no id pinning here.
  site_id: string; group: string; plant: string; department: string; requirement: string;
  date_of_birth: string; gender: '' | 'male' | 'female' | 'other' | 'prefer_not_to_say';
  address_line1: string; address_line2: string; city: string; state: string;
  postal_code: string; country: string;
  preferred_contact_method: '' | 'email' | 'phone' | 'whatsapp' | 'sms';
  marketing_consent: boolean; whatsapp_consent: boolean;
  source_id: string; owner_id: string; status: string;
  // Connected-B2B built-in field `lead_type` ('' = not chosen).
  lead_type: '' | 'requirement' | 'discussion';
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
  account_id: '',
  site_id: '', group: '', plant: '', department: '', requirement: '',
  is_b2c: false, date_of_birth: '', gender: '', address_line1: '', address_line2: '',
  city: '', state: '', postal_code: '', country: 'India',
  preferred_contact_method: '', marketing_consent: false, whatsapp_consent: false,
  source_id: '', owner_id: '', status: 'new', lead_type: '', product_ids: [], alternate_mobiles: [],
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

// One person met at a B2B lead's company, with what they need. Mirrors the
// backend leadContactSchema (contacts[]) and the iOS LeadContactDraft. `key`
// is a client-only React key; `contactId` is set when the rep linked the row
// to an existing CRM contact via the typeahead (sent as `id` so the backend
// resolves that exact record instead of de-duping by email/phone).
type LeadContactRow = {
  key: string; contactId: string;
  firstName: string; lastName: string; title: string; phone: string; email: string; requirement: string;
};
const newContactRow = (): LeadContactRow => ({
  key: Math.random().toString(36).slice(2), contactId: '',
  firstName: '', lastName: '', title: '', phone: '', email: '', requirement: '',
});

// One secondary customer person on a Spark lead (GM / DGM / procurement …): an
// existing contact linked via typeahead, with a free-text role. `name`/`title`
// are display snapshots filled on pick; only contactId + role are sent.
type OtherLeadContact = { key: string; contactId: string; name: string; title: string; role: string };
const newOtherContact = (): OtherLeadContact => ({ key: Math.random().toString(36).slice(2), contactId: '', name: '', title: '', role: '' });

// One make/product/qty line under the lead's requirement (Spark & Ray). Make and
// product are chosen from the tenant's own lists (ids sent with a name snapshot);
// qty / unit / lineValue are plain strings for controlled inputs, parsed on submit.
type ProductLineRow = {
  key: string;
  makeId: string; makeName: string; productId: string; productName: string;
  qty: string; unit: string; lineValue: string;
};
const newProductLine = (): ProductLineRow => ({
  key: Math.random().toString(36).slice(2),
  makeId: '', makeName: '', productId: '', productName: '', qty: '', unit: '', lineValue: '',
});

export default function NewLeadPage() {
  const router = useRouter();
  usePageTitle('New lead');
  // A Walk-in Executive's only lead form is the walk-in "Not Purchased" form,
  // so bounce them there if they land on the standard lead-create route.
  useEffect(() => {
    if (isWalkInExecutive(getStoredUser() as any)) router.replace('/dashboard/crm/walk-in');
  }, [router]);
  // Two-column grid on desktop, one column below 900px.
  const narrow = useIsCompact(900);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState('');
  // Self-only roles (org_role.data_scope === 'own', e.g. Consumer Champion)
  // can't assign leads to others — they own what they create.
  const [selfOnly, setSelfOnly] = useState(false);
  // The visible (role-filtered, non-hidden) custom-field defs, reported up
  // from CustomFieldsSection. Used to enforce required custom fields on
  // submit — the same rule the backend now enforces (enforceRequired) —
  // so a blank mandatory field is caught inline instead of via a 400.
  // Two CustomFieldsSection instances can be mounted at once on Spark (the Sub-industry field next to Industry,
  // and the generic block), so each reports under its own slot and the required-field check reads the union.
  const [customFieldDefsBySlot, setCustomFieldDefsBySlot] = useState<Record<string, CustomField[]>>({});
  const customFieldDefs = useMemo(() => Object.values(customFieldDefsBySlot).flat(), [customFieldDefsBySlot]);
  const reportCustomFieldDefs = useCallback((slot: string) => (defs: CustomField[]) => {
    setCustomFieldDefsBySlot((m) => ({ ...m, [slot]: defs }));
  }, []);
  // Spark & Ray: once the rep PICKS an address, that address's coordinates are the lead's pin. Device
  // geolocation (auto-capture on load, a late GPS fix, the GPS reverse-geocode) must never overwrite them.
  const addressPinnedRef = useRef(false);

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
      // A picked address owns the pin (Spark & Ray) — ignore the device fix entirely.
      if (addressPinnedRef.current) { setGeoBusy(false); setGeoError(''); return; }
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
        if (!addr || addressPinnedRef.current) return;
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
  // Client scope is read from localStorage, which exists only in the browser, so every flag derived from
  // it below — the user's own client_id, the master-admin check, the connected-B2B (Spark & Ray) gate —
  // resolved to false on the server and to its real value on the client. Deciding what to render from
  // them DURING render therefore made the server pass and the FIRST client pass disagree at every
  // scope-gated site (the Person/Contact section title, the company & plant block, the designation /
  // department rows, …), and React threw the server HTML away for the whole page with a dozen
  // "Text content did not match" hydration errors.
  //
  // So the scope is resolved ONCE, after mount: `scopeReady` is false for the server pass AND for the
  // first client pass, so the two agree and hydration succeeds; the scope-gated rows render from the
  // second pass on. The decision is hoisted here, next to the flags, deliberately — a `scopeReady &&`
  // at each of the ~12 render sites would be the same fix spelled out a dozen times, and the next field
  // added to the form would silently miss it.
  const [scopeReady, setScopeReady] = useState(false);
  useEffect(() => { setScopeReady(true); }, []);
  const userClientId = useMemo<string | null>(() => {
    if (!scopeReady) return null;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      return raw ? (JSON.parse(raw)?.client_id ?? null) : null;
    } catch { return null; }
  }, [scopeReady]);
  const isTata = STEEL_DEALER_CLIENT_IDS.includes((form.client_id || userClientId || selectedClientId) ?? '');
  // BMW (a steel-dealer tenant) skips the Tata "log as Site Visit" flow: lead
  // create just saves and lands on the lead, never the activity composer.
  const isBmw = (form.client_id || userClientId || selectedClientId) === BMW_CLIENT_ID;
  // The master admin (s@) runs the parent Kinematic CRM at org level: no
  // field-force GPS capture, and new leads default to the Kinematic client so
  // there's no per-form tenant picker to deal with.
  const isMasterAdmin = useMemo<boolean>(() => {
    if (!scopeReady) return false;
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('kinematic_user') : null;
      return raw ? (JSON.parse(raw)?.email || '').toLowerCase() === 's@kinematicapp.com' : false;
    } catch { return false; }
  }, [scopeReady]);
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
  // Waits for `scopeReady`: until the scope resolves, skipLocation is false for everyone, so firing here
  // would pop the permission prompt on the very tenants (Kinematic / master admin) that opt out of it.
  useEffect(() => { if (scopeReady && !skipLocation) captureLocation(); }, [scopeReady, skipLocation]);
  // Force B2C for Tata (the toggle is hidden, so the default must not stay B2B).
  useEffect(() => {
    if (isTata) setForm((f) => (f.is_b2c ? f : { ...f, is_b2c: true }));
  }, [isTata]);
  // Per-tenant field overrides (label / required / hidden) for built-in
  // lead fields. Edited from Admin → CRM Settings → Custom Fields, stored
  // in crm_settings.config.field_overrides. Empty until first fetch — every
  // field renders with its hardcoded default in the interim.
  const [fieldOverrides, setFieldOverrides] = useState<FieldOverrides>({});
  // Per-client custom lead-status set (crm_settings.config.lead_statuses).
  // Null until the settings fetch resolves AND the tenant has one configured;
  // null means "use the built-in status list" (zero change for existing
  // tenants). Loaded from the SAME settings round-trip as fieldOverrides.
  const [leadStatuses, setLeadStatuses] = useState<LeadStatusOption[] | null>(null);
  // Per-client lead-type names ("Dealer" / "Farmers"), B2B address block and the
  // "Schedule visit" control (crm_settings.config.lead_form). Defaults to the
  // legacy behaviour until the settings fetch resolves — and for any tenant
  // that never configured it.
  const [leadFormRaw, setLeadFormRaw] = useState<LeadFormConfig>(DEFAULT_LEAD_FORM);
  // Spark & Ray capture an address (Google picker) on B2B leads too, whatever lead_form.address_on_b2b says.
  const leadForm = useMemo<LeadFormConfig>(
    () => (scopeReady && isB2bClientActive() ? { ...leadFormRaw, addressOnB2b: true } : leadFormRaw),
    [leadFormRaw, scopeReady],
  );
  // datetime-local value ("2026-10-12T10:30") for the optional scheduled visit.
  const [visitAt, setVisitAt] = useState('');
  // True once the settings round-trip has finished (success or failure). Admin-gated rows (e.g. Lead type) wait
  // for this rather than flashing up and then disappearing.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Clients that set lead_form.owner_assignment='admin_only' let only an admin choose an owner. For anyone
  // else the Owner control is gone and no owner_id is sent (the server makes them the owner).
  const ownerAccess = useLeadOwnerAccess();
  const ownerLocked = ownerAccess.adminOnly && !ownerAccess.canAssign;
  // Pass the active B2C/B2B scope so overrides like "email required for
  // B2B only" or "last_name optional for B2C" take precedence over the
  // universal entry for the same field.
  const scope: FieldScope = form.is_b2c ? 'b2c' : 'b2b';
  const fields = useMemo(
    () => buildFieldHelpers(fieldOverrides, 'lead', scope),
    [fieldOverrides, scope],
  );
  // Lead type (connected-B2B only for now) is a built-in field like any other: it waits for the settings so a field
  // the admin hid never flashes, honours hide / relabel / required, and a hidden one is never sent.
  const showLeadType = isB2bClientActive() && settingsLoaded && !fields.isHidden('lead_type');
  // Form order (Settings → Custom Fields): once the admin has ordered the lead's fields, every field row — built-in
  // and custom — becomes an item of ONE grid (see FlatRegion) and takes its CSS `order`. Until then `flat` is false
  // and the section-by-section layout below is rendered exactly as before.
  const flat = fields.orderStyle('first_name') !== undefined;
  const hasOwnOrder = (k: string) => typeof fieldOverrides[`lead.${k}`]?.order === 'number';
  // Order of a row that has no settings entry of its own (alternate mobiles, the address search …): its own number if
  // the admin placed it, else the neighbour it belongs to — equal orders keep DOM order, so it stays glued to it.
  const orderOf = (key: string, glueTo?: string) => fields.orderStyle(glueTo && !hasOwnOrder(key) ? glueTo : key);
  // A full-width block (not a Field) as an item of the flat grid; a no-op wrapper-less passthrough when not ordered.
  const fullRow = (key: string, node: React.ReactNode, glueTo?: string) => {
    if (!node) return null;
    return flat ? <div style={{ gridColumn: '1 / -1', ...orderOf(key, glueTo) }}>{node}</div> : node;
  };
  // Order for a block that stands for several built-ins (the consent opt-ins): its earliest visible one.
  const earliestOrder = (keys: string[]): { order: number } | undefined => {
    if (!flat) return undefined;
    const orders = keys.filter((k) => !fields.isHidden(k)).map((k) => fields.orderStyle(k)?.order ?? UNORDERED_LAST);
    return { order: orders.length ? Math.min(...orders) : UNORDERED_LAST };
  };
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
  // When a custom status set is configured and the form's default status
  // ('new') isn't part of it, snap to the first custom option so the <Select>
  // value matches a real option and submit saves a valid status. No-op (and
  // zero change) for tenants on the built-in status list.
  useEffect(() => {
    if (!leadStatuses || leadStatuses.length === 0) return;
    setForm((f) => (leadStatuses.some((o) => o.value === f.status) ? f : { ...f, status: leadStatuses[0].value }));
  }, [leadStatuses]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoGalleryRef = useRef<HTMLInputElement>(null);
  const photoCameraRef  = useRef<HTMLInputElement>(null);

  // Company → CRM account typeahead. Connected-B2B tenants (Spark & Ray) capture
  // a company as a lead and that company becomes a CRM account. As the rep types
  // the company we search existing accounts so they can LINK to one (pins
  // account_id) instead of unknowingly spawning a near-duplicate; typing a fresh
  // name leaves account_id empty and the backend creates the account on save
  // (linkLeadToCompany → findOrCreateAccount, matched case-insensitively by name).
  // Gated to the connected-B2B client so every other tenant's form is unchanged.
  const b2bAccounts = scopeReady && isB2bClientActive();
  // Spark & Ray: the admin-configured industries (Settings -> Industries) drive the Industry dropdown + colours and
  // the dependent Sub-industry dropdown; the built-in seven until/unless one is saved.
  const { industries } = useIndustries(b2bAccounts);
  const [accountResults, setAccountResults] = useState<Array<{ id: string; name: string; industry?: string | null }>>([]);
  const [accountSearching, setAccountSearching] = useState(false);
  // B2B "Contacts & requirements": the people met at the company, each linked
  // to (or creating) a CRM contact and sent as the lead-create `contacts[]`.
  // Always starts with one blank row; blank rows are dropped on submit.
  const [contactRows, setContactRows] = useState<LeadContactRow[]>([newContactRow()]);
  // Spark & Ray structured capture (Option A): the make/product/qty lines under the
  // lead's requirement, the Makes list for the picker, and the picked account's
  // existing sites (locations/plants) offered as datalist suggestions.
  const [productLines, setProductLines] = useState<ProductLineRow[]>([newProductLine()]);
  const [makes, setMakes] = useState<Make[]>([]);
  const [accountSites, setAccountSites] = useState<AccountSite[]>([]);
  // Option A (structured B2B): a Spark & Ray lead is named after the PERSON it is
  // about; the company, group, location, plant, department, requirement and product
  // lines are captured as their own fields below, and the backend composes the
  // display name. (Previously the lead was company-named with a contacts[] list.)
  const sparkStructured = b2bAccounts && !form.is_b2c;
  // Spark structured "Person": link the lead to an EXISTING CRM contact via a
  // typeahead so a repeat person isn't duplicated (the client's duplicate-lead
  // fix). Picking fills the name / designation below and pins the contact id so
  // the backend links that exact record; brand-new people are still created in
  // the Contacts section first.
  const [personContactId, setPersonContactId] = useState('');
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<Array<{ id: string; first_name?: string | null; last_name?: string | null; title?: string | null; phone?: string | null; email?: string | null; department?: string | null; account_id?: string | null; account_name?: string | null }>>([]);
  // Linking an existing contact also brings in their company and that company's industry, so the rep doesn't
  // re-enter what the CRM already knows. A company the rep has already linked is kept (never silently swapped).
  const adoptContactCompany = (c: { account_id?: string | null; account_name?: string | null }) => {
    const accId = (c.account_id || '').trim();
    if (!accId || !b2bAccounts) return;
    setForm((f) => (f.account_id ? f : { ...f, account_id: accId, company: c.account_name || f.company }));
    crmAccounts.get(accId)
      .then((r) => {
        const a = r.data;
        if (!a) return;
        setForm((f) => (f.account_id !== accId ? f : { ...f, company: f.company || a.name || '', industry: (a.industry || '').trim() || f.industry }));
      })
      .catch(() => { /* the company link stands; industry stays as it was */ });
  };
  useEffect(() => {
    if (!sparkStructured || personContactId) { setPersonResults([]); return; }
    const term = personQuery.trim();
    if (term.length < 2) { setPersonResults([]); return; }
    let off = false;
    const t = setTimeout(() => {
      crmContacts.list({ q: term, limit: 8 })
        .then((r) => { if (!off) setPersonResults(((r.data as unknown as Array<Record<string, unknown>>) || []).filter((c) => c && c.id) as typeof personResults); })
        .catch(() => { if (!off) setPersonResults([]); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [sparkStructured, personContactId, personQuery]);
  // Spark: the OTHER customer people on this lead (GM / DGM / procurement …) besides
  // the primary (nodal) contact picked in the Person section. Each links an existing
  // contact; sent as lead_contacts[] (is_primary false). Start empty — a lead needs
  // only its primary.
  const [otherContacts, setOtherContacts] = useState<OtherLeadContact[]>([]);
  // Declutter: the optional, heavier blocks on the Spark B2B form start
  // collapsed so the default view is just the essentials — company, plant,
  // person, requirement. The rep expands each only when it is actually needed.
  const [showGroup, setShowGroup] = useState(false);
  const [showProductDetails, setShowProductDetails] = useState(false);
  const [showOtherPeople, setShowOtherPeople] = useState(false);
  useEffect(() => {
    // Only search for a B2B lead on the connected-B2B client, and never while a
    // company is already linked (the rep clears the link to search again).
    if (!b2bAccounts || form.is_b2c || form.account_id) { setAccountResults([]); setAccountSearching(false); return; }
    const term = form.company.trim();
    if (term.length < 2) { setAccountResults([]); setAccountSearching(false); return; }
    let off = false;
    setAccountSearching(true);
    const t = setTimeout(() => {
      crmAccounts.list({ q: term, limit: 8 })
        .then((r) => { if (!off) setAccountResults(((r.data as any[]) || []).map((a) => ({ id: a.id, name: a.name, industry: a.industry })).filter((a) => a.id && a.name)); })
        .catch(() => { if (!off) setAccountResults([]); })
        .finally(() => { if (!off) setAccountSearching(false); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [b2bAccounts, form.is_b2c, form.account_id, form.company]);

  // When the rep links an existing account, pull its sites so the Location / Plant
  // inputs can suggest the company's known locations and units (datalist). The
  // backend still de-dupes by name, so this is a convenience, not a hard dependency.
  useEffect(() => {
    if (!b2bAccounts || form.is_b2c || !form.account_id) { setAccountSites([]); return; }
    let off = false;
    crmSites.forAccount(form.account_id)
      .then((r) => { if (!off) setAccountSites((r.data as AccountSite[]) || []); })
      .catch(() => { if (!off) setAccountSites([]); });
    return () => { off = true; };
  }, [b2bAccounts, form.is_b2c, form.account_id]);

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
      const [s, src, u, p, meRes, mk] = await Promise.allSettled([
        crmSettings.get(),
        crmLeadSources.list(),
        api.getUsers({ limit: '500', scope: 'assignable' }) as Promise<any>,
        crmProducts.list(),
        api.get<any>('/api/v1/auth/me'),
        // Makes power the product-line picker; only the connected-B2B client has them.
        isB2bClientActive() ? crmMakes.list() : Promise.resolve({ data: [] as Make[] }),
      ]);
      if (mk.status === 'fulfilled') setMakes(((mk.value.data as Make[]) || []).filter((m) => (m as { is_active?: boolean }).is_active !== false));
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
        setLeadStatuses(extractLeadStatuses(s.value.data));
        setLeadFormRaw(extractLeadForm(s.value.data));
      }
      setSettingsLoaded(true);
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

  // Merge KINI-extracted lead fields onto the form for review. Only non-empty
  // values overwrite (a partial transcript never wipes what the rep already
  // typed). Built-in fields only — custom_fields + notes are skipped this cut.
  // We fill state regardless of a field's visibility; the field-override
  // contract still governs render + save, so a value for an admin-hidden field
  // simply never shows and is stripped on submit. Mirrors the iOS apply().
  const applyExtracted = (e: ExtractedLead) => {
    const clean = (v: string | null | undefined): string => (typeof v === 'string' ? v.trim() : '');
    const digits10 = (v: string | null | undefined): string => (v || '').replace(/\D/g, '').slice(0, 10);
    setForm((f) => {
      const next = { ...f };
      const fn = clean(e.first_name); if (fn) next.first_name = fn;
      const ln = clean(e.last_name); if (ln) next.last_name = ln;
      const em = clean(e.email); if (em) next.email = em.toLowerCase();
      const ph = digits10(e.phone); if (ph) next.phone = ph;
      if (Array.isArray(e.alternate_mobiles)) {
        const alts = e.alternate_mobiles.map(digits10).filter((d) => d.length === 10);
        if (alts.length) next.alternate_mobiles = alts;
      }
      const co = clean(e.company); if (co) { next.company = co; next.account_id = ''; }
      const ti = clean(e.title); if (ti) next.title = ti;
      const ind = clean(e.industry); if (ind) next.industry = ind;
      const a1 = clean(e.address_line1); if (a1) next.address_line1 = a1;
      const ci = clean(e.city); if (ci) next.city = ci;
      const st = clean(e.state); if (st) next.state = st;
      const pc = clean(e.postal_code); if (pc) next.postal_code = pc;
      const cn = clean(e.country); if (cn) next.country = cn;
      const g = clean(e.gender).toLowerCase();
      if (g && ['male', 'female', 'other', 'prefer_not_to_say'].includes(g)) next.gender = g as Form['gender'];
      const ch = clean(e.preferred_contact_method).toLowerCase();
      if (ch && ['email', 'phone', 'whatsapp', 'sms'].includes(ch)) next.preferred_contact_method = ch as Form['preferred_contact_method'];
      const dob = clean(e.date_of_birth);
      if (/^\d{4}-\d{2}-\d{2}$/.test(dob)) next.date_of_birth = dob;
      // Source hint → best-effort match against the tenant's active source list.
      const hint = clean(e.source_hint).toLowerCase();
      if (hint) {
        const match = sources.find((s) => {
          const n = (s.name || '').toLowerCase();
          return !!n && (n.includes(hint) || hint.includes(n));
        });
        if (match) next.source_id = match.id;
      }
      return next;
    });
    toast.success('Details filled in from voice — review and save.');
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
      !sparkStructured &&
      !fields.isHidden('first_name') &&
      fields.requiredFor('first_name', true) &&
      (!form.first_name || !form.first_name.trim())
    ) {
      fail('lead-field-first_name', 'First name is required.');
      return;
    }
    // Lead type: only enforced where it is shown (connected-B2B, not hidden by the admin) and made required.
    if (showLeadType && fields.requiredFor('lead_type', false) && !form.lead_type) {
      fail('lead-field-lead_type', `${fields.labelFor('lead_type', LEAD_TYPE_DEFAULT_LABEL)} is required.`);
      return;
    }
    // Skip the field if the admin hid it, OR if they explicitly made it
    // optional for the active business-type scope. The backend's
    // leadCreateSchema has last_name as a hard min(1) on the universal
    // path; clients that switch it to optional via field overrides also
    // need a matching backend rule (handled elsewhere) — this block
    // just makes the dashboard stop forcing the field on its own.
    if (
      !sparkStructured &&
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
      !sparkStructured &&
      !isTata &&
      !fields.isHidden('email') &&
      fields.requiredFor('email', false) &&
      (!form.email || !form.email.trim())
    ) {
      fail('lead-field-email', 'Email is required.');
      return;
    }
    if (
      !sparkStructured &&
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
      fields.requiredFor('company', true) &&
      (!form.company || !form.company.trim())
    ) {
      fail('lead-field-company', `${fields.labelFor('company', 'Company')} is required for ${segmentName(leadForm, 'b2b')} leads.`);
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
    // Address line: enforced wherever the address block shows (B2C always, B2B
    // when the client turned it on) and the admin marked it required — e.g. the
    // Dealer / Farmers "Location" field.
    if (
      showsAddress(leadForm, scope) &&
      !fields.isHidden('address_line1') &&
      fields.requiredFor('address_line1', false) &&
      (!form.address_line1 || !form.address_line1.trim())
    ) {
      fail('lead-field-address_line1', `${fields.labelFor('address_line1', 'Address line 1')} is required — search for it or type it in.`);
      return;
    }
    // Scheduled visit (optional): a reminder for a time that has already gone
    // would never fire, so ask for a future time instead of saving a dead visit.
    const visitIso = offersScheduleVisit(leadForm, scope) ? localDateTimeToIso(visitAt) : null;
    if (visitAt && offersScheduleVisit(leadForm, scope) && !visitIso) {
      fail('lead-field-visit_at', 'Enter a valid visit date and time.');
      return;
    }
    if (visitIso && new Date(visitIso).getTime() < Date.now() - 60_000) {
      fail('lead-field-visit_at', 'Pick a visit time in the future — or clear it to save the lead without a visit.');
      return;
    }
    // Location is mandatory and auto-captured — block submit until we have it.
    // Kinematic's inside-sales CRM doesn't geo-tag leads, so it's exempt.
    if (!skipLocation && (!form.latitude || !form.longitude)) {
      captureLocation();
      fail('lead-field-location', 'Location is required. Allow location access, then tap “Use my current location”.');
      return;
    }
    // Required CUSTOM fields. CustomFieldsSection reports the visible, role-
    // filtered defs up via onFieldsChange; enforce the required ones here so
    // the user gets an inline scroll-to error instead of a bare 400 (the
    // backend also enforces this now via enforceRequired). Hidden and role-
    // scoped-out fields aren't in the list, so we only police what's shown.
    for (const def of customFieldDefs) {
      if (!def.required || def.field_type === 'formula') continue;
      const v = form.custom_fields[def.field_key];
      const missing = v === null || v === undefined || v === ''
        || (Array.isArray(v) && v.length === 0);
      if (missing) {
        fail(`lead-cf-${def.field_key}`, `${def.label || def.field_key} is required.`);
        return;
      }
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        first_name: form.first_name || undefined, last_name: form.last_name || undefined,
        email: form.email || undefined, phone: form.phone || undefined, is_b2c: isTata || form.is_b2c,
        source_id: form.source_id || undefined,
        // Admin-only assignment: a non-admin never sends an owner (not even themselves) — the server owns it to them.
        owner_id: ownerLocked ? undefined : (form.owner_id || undefined),
        status: form.status || 'new',
        // Hidden / unavailable => never sent; shown but left blank => omitted (a create has nothing to clear).
        lead_type: showLeadType ? (leadTypeForApi(form.lead_type) ?? undefined) : undefined,
        product_ids: form.product_ids.length > 0 ? form.product_ids : undefined,
        alternate_mobiles: form.alternate_mobiles.length ? form.alternate_mobiles : undefined,
        client_id: form.client_id || undefined,
        // City + state always sent (B2B + B2C). Backend schema enforces
        // city.min(1); state is optional but auto-inferred client-side
        // from the city catalog when the user picks an assigned city.
        city: form.city.trim() || undefined,
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
      // Connected-B2B (Spark & Ray): the lead's company becomes a CRM account.
      // When the rep linked to an existing account via the typeahead, send its
      // id so the backend reuses it; otherwise the backend creates/matches the
      // account from the company name (linkLeadToCompany). B2B leads only.
      if (b2bAccounts && !form.is_b2c && form.account_id) {
        payload.account_id = form.account_id;
      }
      // Spark & Ray structured capture (Option A): one lead = one person + one
      // requirement + its product lines. group / location / plant go by NAME — the
      // backend de-dupes/creates them (findOrCreateAccount/Site match by name).
      // The lead stays person-named (first/last above); the backend composes the
      // human-readable display name from the whole chain.
      if (sparkStructured) {
        // Prefer a person-named lead (Option A); fall back to the company name when
        // the rep hasn't entered a person yet, so the lead always has a name and the
        // backend accepts it. The backend still composes the full display name.
        if (!form.first_name.trim() && !form.last_name.trim()) {
          payload.first_name = undefined;
          payload.last_name = form.company.trim() || undefined;
        }
        const S = (val: string) => (val.trim() ? val.trim() : undefined);
        Object.assign(payload, {
          group: S(form.group),
          plant: S(form.plant),
          // The plant's location is the lead's city/state (captured in the Location
          // section). The backend names the location after the city when no explicit
          // location name is sent, and nests the plant under it.
          location_city: S(form.city),
          location_state: S(form.state),
          department: S(form.department),
          requirement: S(form.requirement),
        });
        // make · product · qty lines under the requirement. Empty rows dropped;
        // sent even when empty so the field is explicit on create.
        payload.product_lines = productLines
          .map((r, i) => {
            const any = r.makeId || r.makeName.trim() || r.productId || r.productName.trim() || r.qty.trim();
            if (!any) return null;
            const line: Record<string, unknown> = { position: i };
            if (r.makeId) line.make_id = r.makeId;
            if (r.makeName.trim()) line.make_name = r.makeName.trim();
            if (r.productId) line.product_id = r.productId;
            if (r.productName.trim()) line.product_name = r.productName.trim();
            if (r.qty.trim() && !Number.isNaN(Number(r.qty))) line.qty = Number(r.qty);
            if (r.unit.trim()) line.unit = r.unit.trim();
            if (r.lineValue.trim() && !Number.isNaN(Number(r.lineValue))) line.line_value = Number(r.lineValue);
            return line;
          })
          .filter((l): l is Record<string, unknown> => l !== null);
        // Also link the person as a contact under the account/plant so the
        // account's contact graph is populated (department comes from the
        // lead-level field server-side; requirement rides along here).
        const person: Record<string, unknown> = {};
        if (form.first_name.trim()) person.first_name = form.first_name.trim();
        if (form.last_name.trim()) person.last_name = form.last_name.trim();
        if (form.title.trim()) person.title = form.title.trim();
        if (form.phone.trim()) person.phone = form.phone.trim();
        if (form.email.trim()) person.email = form.email.trim();
        if (form.requirement.trim()) person.requirement = form.requirement.trim();
        // Linked to an existing contact via the typeahead — send its id so the
        // backend attaches that exact record instead of de-duping by name/phone
        // (or, worse, creating a duplicate person).
        if (personContactId) person.id = personContactId;
        if (Object.keys(person).length) payload.contacts = [person];
        // Customer people on this lead: the Person pick is the primary (nodal)
        // contact; the "Other people" rows are secondary. Sent as lead_contacts[]
        // (the crm_lead_contacts join); undefined when none so the backend leaves
        // the links as-is.
        const leadContacts: Array<Record<string, unknown>> = [];
        if (personContactId) leadContacts.push({ contact_id: personContactId, is_primary: true });
        for (const o of otherContacts) {
          if (o.contactId && o.contactId !== personContactId) {
            leadContacts.push({ contact_id: o.contactId, is_primary: false, role: o.role.trim() || undefined });
          }
        }
        if (leadContacts.length) payload.lead_contacts = leadContacts;
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
      // B2B address — only for clients that turned it on (lead_form.address_on_b2b).
      // Hidden built-ins are not sent, same as the field-override contract.
      if (!form.is_b2c && leadForm.addressOnB2b) {
        const addr = (k: 'address_line1' | 'address_line2' | 'postal_code' | 'country') =>
          (fields.isHidden(k) ? undefined : (form[k] || undefined));
        Object.assign(payload, {
          address_line1: addr('address_line1'), address_line2: addr('address_line2'),
          postal_code: addr('postal_code'), country: addr('country'),
        });
      }
      // Schedule visit: the server adds a planned meeting for the lead's owner
      // and the activity reminder fires ~30 min before. Subject comes from the
      // Description field when the client has one (e.g. "Dealer Visit — Shop").
      if (visitIso) {
        const desc = form.custom_fields['visit_description'];
        const who = (form.company || [form.first_name, form.last_name].filter(Boolean).join(' ')).trim();
        payload.schedule_visit = {
          due_at: visitIso,
          subject: typeof desc === 'string' && desc.trim() ? `${desc.trim()}${who ? ` — ${who}` : ''}` : undefined,
        };
      }
      // Tata Tiscon: backend pops this flag before persisting and atomically
      // spawns a completed `site_visit` activity tied to the new lead. Sent
      // only when the rep is on a Tata tenant + has the toggle on.
      if (isTata && !isBmw && form.log_as_site_visit) {
        payload._auto_log_site_visit = true;
      }
      const r = await crmLeads.create(payload);
      const visitError = (r.data as { scheduled_visit_error?: string } | undefined)?.scheduled_visit_error;
      if (visitError) toast.warning(visitError);
      toast.success(visitIso && !visitError ? 'Lead created and visit scheduled' : 'Lead created');
      // After creating a lead on Tata, ALWAYS hop to the activity
      // compose screen pre-filled with this lead + Meeting (matches
      // the user requirement: "Do not add the activity by default,
      // just open the activity section with information pre-filled
      // like Meeting selected by default."). We don't gate on the
      // backend echoing back `auto_log_site_visit_prefill` because
      // the rep wants this redirect for every new lead, not just
      // when they ticked a toggle. Non-Tata tenants keep the
      // legacy "land on lead detail" flow. BMW is excluded — its reps asked
      // for create to simply finish on the lead, never the activity composer.
      if (isTata && !isBmw && r.data?.id) {
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

  // `text()` builds a labelled <Input>. When `opts.phone` is true the
  // input is numeric-only (no letters), capped at 10 digits, and pulls
  // up the phone keypad on mobile.
  // text() / select() consult the admin's field-override map: hidden ⇒
  // omit the field entirely, label override ⇒ render the new label,
  // required override ⇒ flip the asterisk + browser-level required attr.
  const text = (k: keyof Form, label: string, opts: { type?: string; required?: boolean; phone?: boolean; placeholder?: string } = {}) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel    = fields.labelFor(k as string, label);
    const effRequired = fields.requiredFor(k as string, !!opts.required);
    const id = `lead-field-${k as string}`;
    return (
      <Field label={effLabel} required={effRequired} htmlFor={id} style={fields.orderStyle(k as string)}>
        <Input
          id={id}
          type={opts.phone ? 'tel' : (opts.type || 'text')}
          inputMode={opts.phone ? 'numeric' : undefined}
          pattern={opts.phone ? '[0-9]{10}' : undefined}
          maxLength={opts.phone ? 10 : undefined}
          autoComplete={opts.phone ? 'tel-national' : undefined}
          placeholder={opts.phone ? '10-digit mobile' : opts.placeholder}
          value={form[k] as string}
          onChange={(e) => {
            const v = opts.phone ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
            setForm({ ...form, [k]: v });
          }}
          required={effRequired}
        />
      </Field>
    );
  };
  // `opts.required` opts a select into the admin's required override (default false); selects that don't pass it
  // keep their existing never-required behaviour.
  const select = (k: keyof Form, label: string, options: Array<{ value: string; label: string }>, opts: { required?: boolean } = {}) => {
    if (fields.isHidden(k as string)) return null;
    const effLabel = fields.labelFor(k as string, label);
    const effRequired = opts.required === undefined ? undefined : fields.requiredFor(k as string, opts.required);
    const id = `lead-field-${k as string}`;
    return (
      <Field label={effLabel} required={effRequired} htmlFor={id} style={fields.orderStyle(k as string)}>
        <Select id={id} value={form[k] as string} required={effRequired} onChange={(e) => setForm({ ...form, [k]: e.target.value })}>
          <option value="">—</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
    );
  };

  // Industry: Spark & Ray picks from the configured list (industryOptions keeps a legacy / free-text value
  // selectable); every other tenant keeps today's free-text field. Same admin gate (hidden / label / required)
  // either way, via select() / text().
  const sparkIndustrySelect = () => {
    if (fields.isHidden('industry')) return null;
    const effRequired = fields.requiredFor('industry', false);
    // Existing company linked → its industry is autofilled and shown read-only
    // (industry belongs to the company, not the lead). A new company keeps the
    // editable dropdown so the rep classifies it on the spot.
    if (form.account_id && form.industry.trim()) {
      return (
        <Field label={fields.labelFor('industry', 'Industry')} htmlFor="lead-field-industry" hint="From the linked company." style={fields.orderStyle('industry')}>
          <Input id="lead-field-industry" value={form.industry} readOnly disabled />
        </Field>
      );
    }
    return (
      <Field label={fields.labelFor('industry', 'Industry')} required={effRequired} htmlFor="lead-field-industry" style={fields.orderStyle('industry')}>
        <IndustrySelect
          id="lead-field-industry"
          value={form.industry}
          options={industryOptions(industries, form.industry)}
          industries={industries}
          required={effRequired}
          onChange={(v) => setForm((f) => {
            // Changing the industry clears a Sub-industry that no longer belongs to it.
            const sub = f.custom_fields?.industry_category;
            if (!clearSubIndustryOnChange(industries, f.industry, v, sub)) return { ...f, industry: v };
            const { industry_category: _drop, ...rest } = f.custom_fields ?? {};
            return { ...f, industry: v, custom_fields: rest };
          })}
        />
      </Field>
    );
  };
  // Spark & Ray: the "Industry Category" custom field (field_key industry_category) is shown as "Sub-industry"
  // right after Industry instead of down in the generic custom-field block (which then skips it).
  const SUB_INDUSTRY_KEY = 'industry_category';
  // Ordered mode: the field is wrapped in a grid item carrying INDUSTRY's order (it follows Industry in DOM order, so the
  // pair stays adjacent wherever the admin put Industry). The wrapper is hidden while there is no such field, so it
  // never leaves an empty cell. Not ordered: the field renders bare, as before.
  const hasSubIndustry = (customFieldDefsBySlot['sub-industry']?.length ?? 0) > 0;
  const subIndustryNode = () => (
    <CustomFieldsSection
      entity="lead"
      values={form.custom_fields}
      onChange={(cf) => setForm((f) => ({ ...f, custom_fields: cf }))}
      onFieldsChange={reportCustomFieldDefs('sub-industry')}
      isB2c={form.is_b2c}
      onlyKeys={[SUB_INDUSTRY_KEY]}
      labelOverrides={{ [SUB_INDUSTRY_KEY]: 'Sub-industry' }}
      optionsOverrides={{ [SUB_INDUSTRY_KEY]: subIndustryOptions(industries, form.industry, typeof form.custom_fields?.industry_category === 'string' ? form.custom_fields.industry_category : '') }}
    />
  );
  const subIndustryField = () => !b2bAccounts ? null : flat
    ? <div data-order-glue="industry" style={{ ...fields.orderStyle('industry'), display: hasSubIndustry ? undefined : 'none', minWidth: 0 }}>{subIndustryNode()}</div>
    : subIndustryNode();
  const industryField = () => b2bAccounts
    ? <>{sparkIndustrySelect()}{subIndustryField()}</>
    : text('industry', 'Industry');
  // The generic custom-field block skips the sub-industry key wherever it is rendered inline next to Industry.
  const genericExcludeKeys = (inlineSubIndustry: boolean): string[] | undefined => {
    const keys = [...(isBmw ? ['next_follow_up_date'] : []), ...(inlineSubIndustry && b2bAccounts ? [SUB_INDUSTRY_KEY] : [])];
    return keys.length ? keys : undefined;
  };

  // The Company field for connected-B2B (Spark & Ray): the same admin-gated
  // built-in `company` row as text(), but with a CRM-account typeahead layered
  // on so the rep can link to an existing company account (pins account_id) or
  // type a fresh name that becomes a new account on save. Still honours the
  // field-override contract (hidden / label / required) exactly like text().
  const companyField = () => {
    if (fields.isHidden('company')) return null;
    const effLabel    = fields.labelFor('company', 'Company');
    const effRequired = fields.requiredFor('company', true);
    const id = 'lead-field-company';
    return (
      <Field label={effLabel} required={effRequired} htmlFor={id} style={fields.orderStyle('company')}>
        <div style={{ position: 'relative' }}>
          <Input
            id={id}
            type="text"
            autoComplete="off"
            placeholder="Start typing to link or create a company…"
            value={form.company}
            onChange={(e) => {
              // Editing the name means the lead is no longer tied to the picked
              // account — drop the link so the search runs against the new text.
              const v = e.target.value;
              setForm((f) => ({ ...f, company: v, account_id: f.account_id ? '' : f.account_id }));
            }}
            required={effRequired}
          />
          {!form.account_id && form.company.trim().length >= 2 && accountResults.length > 0 && (
            <div
              role="listbox"
              style={{
                position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0,
                background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto',
              }}
            >
              {accountResults.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="option"
                  onClick={() => { setForm((f) => ({ ...f, company: a.name, account_id: a.id, industry: a.industry || f.industry })); setAccountResults([]); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                    padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: 13.5, color: T.text,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s3)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  <span aria-hidden>🏢</span>
                  <span style={{ fontWeight: 600 }}>{a.name}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.dim }}>Existing account</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {form.account_id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, color: T.ok }}>
            <CheckCircle2 size={14} strokeWidth={2} />
            <span>Linked to existing account</span>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, account_id: '' }))}
              style={{ marginLeft: 4, background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: 0 }}
            >
              Change
            </button>
          </div>
        ) : form.company.trim().length >= 2 && !accountSearching && accountResults.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12.5, color: T.dim }}>
            <Info size={13} strokeWidth={1.8} />
            <span>New company — a CRM account will be created on save.</span>
          </div>
        ) : null}
      </Field>
    );
  };

  // Tata is consumer-only: hide the B2B/B2C toggle and force B2C (above).
  const showToggle = businessType === 'both' && !isTata;
  // A client that renamed the lead types ("Dealer" / "Farmers") gets a caption in
  // its own words; everyone else keeps the original wording.
  const customTypeName = leadForm.segmentLabels[businessType === 'both' ? scope : businessType];
  const leadTypeLabel = customTypeName
    ? `${customTypeName} lead — add their details below.`
    : businessType === 'b2c'
      ? 'Individual consumer lead — capture contact details and preferences.'
      : businessType === 'b2b'
        ? 'Business lead — capture company and decision-maker info.'
        : (form.is_b2c
          ? 'Individual consumer lead — capture contact details and preferences.'
          : 'Business lead — capture company and decision-maker info.');

  // Spark & Ray: a picked address REPLACES the address parts and sets the pin from its coordinates. City / state /
  // postal code are replaced (not merged) so a stale value from an earlier pick or GPS guess cannot linger.
  const onPickSparkAddress = (p: PlaceResult) => {
    const hasPin = !!(p.latitude && p.longitude);
    if (hasPin) addressPinnedRef.current = true;
    setForm((f) => ({
      ...f,
      address_line1: p.address_line1 || f.address_line1,
      city: p.city || '',
      state: p.state || '',
      postal_code: p.postal_code || '',
      latitude: hasPin ? (p.latitude as string) : f.latitude,
      longitude: hasPin ? (p.longitude as string) : f.longitude,
    }));
  };

  // Address search + fields, shared by the B2C branch and (when the client turned
  // it on) the B2B branch. Every row is gated through the field overrides.
  const addressFields = () => (
    <>
      {b2bAccounts ? (fields.isHidden('address_line1') ? null : (
        // Spark & Ray: the lead is pinned where the PICKED address is — not where the rep stands while filling
        // the form — so the device GPS never auto-fills here (and is ignored once an address is picked).
        fullRow('address_search', <GoogleAddressAutocomplete deviceFill={false} backend onSelect={onPickSparkAddress} />, 'address_line1')
      )) : (
        fullRow('address_search', <GoogleAddressAutocomplete onSelect={(p) => setForm((f) => ({
          ...f,
          address_line1: p.address_line1 || f.address_line1,
          city: p.city || f.city,
          state: p.state || f.state,
          postal_code: p.postal_code || f.postal_code,
          latitude: p.latitude || f.latitude,
          longitude: p.longitude || f.longitude,
        }))} />, 'address_line1')
      )}
      {text('address_line1', 'Address line 1')}{text('address_line2', 'Address line 2')}
      {/* LocationPicker covers state + city. Hide it when the admin
          has hidden the city built-in (state alone has no value). */}
      {!fields.isHidden('city') && (
        // Ordered mode: State + City travel together as one two-column row at City's place in the list.
        <div id="lead-field-city" style={flat
          ? { display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '16px 20px', gridColumn: '1 / -1', ...fields.orderStyle('city') }
          : { display: 'contents' }}>
          <LocationPicker stateValue={form.state} cityValue={form.city} onChange={({ state, city }) => setForm({ ...form, state, city })} required={fields.requiredFor('city', true)} />
        </div>
      )}
      {text('postal_code', 'Postal code')}{text('country', 'Country')}
    </>
  );

  // Optional "Schedule visit" (clients that enabled it for this lead type).
  const scheduleVisitSection = offersScheduleVisit(leadForm, scope) ? (
    <Section title="Schedule visit" hint="Adds the visit to Activities and reminds the owner 30 minutes before." flatRow={flat ? { order: UNORDERED_LAST + 2 } : undefined}>
      <FormGrid narrow={narrow}>
        <Field label="Visit date & time" htmlFor="lead-field-visit_at">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Input
              id="lead-field-visit_at"
              type="datetime-local"
              value={visitAt}
              onChange={(e) => setVisitAt(e.target.value)}
              style={{ flex: 1, minWidth: 0 }}
            />
            {visitAt && <Button type="button" size="sm" onClick={() => setVisitAt('')}>Clear</Button>}
          </div>
        </Field>
      </FormGrid>
    </Section>
  ) : null;
  const locationMissing = !skipLocation && (!form.latitude || !form.longitude);
  const submitDisabled = busy || locationMissing;

  // One submit button per layout: in the page header on desktop, under the
  // form on phones (where the rep is at the bottom when they finish typing).
  // The same node is rendered in exactly one place so nothing is duplicated
  // for assistive tech or tests.
  const actions = (
    <>
      <Button type="button" onClick={() => router.back()}>Cancel</Button>
      <Button
        type="submit"
        form="new-lead-form"
        variant="primary"
        disabled={submitDisabled}
        title={locationMissing ? 'Capture your location to enable' : undefined}
        icon={<Check size={16} strokeWidth={2} />}
      >
        {busy ? 'Saving…' : 'Create lead'}
      </Button>
    </>
  );

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="New lead"
        description={<>{showToggle ? (ownerLocked ? 'Create a lead. Hidden fields follow your admin’s form settings.' : 'Create a lead and assign it to a rep. Hidden fields follow your admin’s form settings.') : leadTypeLabel} Fields marked {requiredMark} are required.</>}
        actions={narrow ? undefined : actions}
        compact={narrow}
      />

      {/* The identity chain, assembling itself as the rep types. Showing it here — rather than
          validating at submit — turns "what else does this lead need?" into something visible
          from the first keystroke. Serial is allocated by the backend on save, so it stays
          blank with its tooltip explaining why. */}
      {sparkStructured && (
        <LeadIdentityStrip
          variant="form"
          source={{
            account: form.company,
            plant: form.plant,
            department: form.department,
            contact: [form.first_name, form.last_name].filter(Boolean).join(' '),
            requirement: form.requirement,
            serial: '',
            owner: ownerLocked ? 'You' : (users.find((u) => u.id === form.owner_id)?.name || ''),
          }}
        />
      )}

      <form id="new-lead-form" onSubmit={submit} noValidate style={{ ...cardStyle, padding: narrow ? 16 : 24 }}>
        {showToggle && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Eyebrow>Lead type</Eyebrow>
              <div style={{ fontSize: 13, color: T.dim }}>{leadTypeLabel}</div>
            </div>
            <Segmented
              value={form.is_b2c ? 'b2c' : 'b2b'}
              onChange={(v) => setForm({ ...form, is_b2c: v === 'b2c' })}
              options={[{ value: 'b2b', label: segmentToggleLabel(leadForm, 'b2b') }, { value: 'b2c', label: segmentToggleLabel(leadForm, 'b2c') }]}
            />
          </div>
        )}

        {/* KINI "Fill with voice" — an INLINE press-and-hold mic. The rep HOLDS
            to dictate a prospect and RELEASES to submit; on release the transcript
            is extracted and merged into `form` (applyExtracted). No modal — the
            orb + transcript animate in-place. The field-override contract still
            governs what renders + saves. Voice is input only. B2C/B2B scope is
            passed through so the extractor parses fields for the right lead type.
            Removed for BMW — no KINI surfaces for that tenant. */}
        {!isBmw && <InlineLeadVoiceCapture isB2C={isTata || form.is_b2c} onExtracted={applyExtracted} />}

        {myTarget && myTarget.target > 0 && (() => {
          const done = myTarget.achieved >= myTarget.target;
          const pct = Math.min(100, Math.round((myTarget.achieved / myTarget.target) * 100));
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: done ? T.okWash : 'var(--s3)', border: `1px solid ${done ? T.ok : T.border}`, marginBottom: 16 }}>
              {done
                ? <CheckCircle2 size={18} strokeWidth={1.6} style={{ color: T.ok, flexShrink: 0 }} />
                : <Target size={18} strokeWidth={1.6} style={{ color: T.red, flexShrink: 0 }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: 'nowrap' }}>Today’s lead target</span>
              <div style={{ flex: 1, height: 6, borderRadius: 99, background: T.rule, overflow: 'hidden', minWidth: 60 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: done ? T.ok : T.red, borderRadius: 99, transition: 'width .3s' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: T.mono, color: done ? T.ok : T.text }}>{myTarget.achieved}/{myTarget.target}</span>
            </div>
          );
        })()}

        {/* Master admin runs the single Kinematic tenant — the client is set
            automatically, so hide the picker. */}
        {!isMasterAdmin && (
          <ClientScopeField value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} />
        )}

        {/* Connected-B2B (Spark & Ray) B2B leads are company-centric — the
            people are captured in "Contacts & requirements" below, so the
            per-person Contact section (name / mobile / email) is removed and the
            lead's name is taken from the Company on submit. Every other tenant
            keeps the full Contact section. */}
        <FlatRegion flat={flat} narrow={narrow}>
        <Section title={sparkStructured ? 'Person' : 'Contact'} hint={sparkStructured ? 'The person this requirement is for.' : 'Who you’re talking to.'} first>
          <Grid narrow={narrow}>
            {/* Spark duplicate-lead fix: link the lead to an EXISTING contact.
                Picking fills the name/designation below (kept so the field
                order/overrides and e2e hold) and pins the contact id, so the
                backend links that exact record instead of creating a new one. */}
            {sparkStructured && (
              <div style={{ gridColumn: '1 / -1' }}>
                {personContactId ? (
                  <Field label="Contact" hint="Linked to an existing contact — their details come from the Contacts record.">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'var(--s2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text }}>
                        <CheckCircle2 size={15} strokeWidth={2} style={{ color: T.ok, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>👤 {[form.first_name, form.last_name].filter(Boolean).join(' ') || 'Linked contact'}</span>
                        {form.title && <span style={{ color: T.dim }}>· {form.title}</span>}
                        <button type="button" onClick={() => { setPersonContactId(''); setPersonQuery(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: 0 }}>Change</button>
                      </div>
                      {(form.phone || form.email) && (
                        <div style={{ fontSize: 12, color: T.dim, paddingLeft: 23 }}>{[form.phone, form.email].filter(Boolean).join('  ·  ')}</div>
                      )}
                    </div>
                  </Field>
                ) : (
                  <Field label="Link an existing contact" hint="Search a contact to link this lead to them (no duplicate). New people are added in Contacts first.">
                    <div style={{ position: 'relative' }}>
                      <Input autoComplete="off" placeholder="Start typing a contact name…" value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} />
                      {personResults.length > 0 && (
                        <div role="listbox" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                          {personResults.map((c) => (
                            <button key={c.id} type="button" role="option"
                              onClick={() => {
                                setForm((f) => ({ ...f, first_name: c.first_name || '', last_name: c.last_name || '', title: c.title || f.title, phone: c.phone || f.phone, email: c.email || f.email, department: (c.department as string) || f.department }));
                                setPersonContactId(c.id); adoptContactCompany(c); setPersonResults([]); setPersonQuery([c.first_name, c.last_name].filter(Boolean).join(' '));
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13.5, color: T.text }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s3)'; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                              <span aria-hidden>👤</span>
                              <span style={{ fontWeight: 600 }}>{[c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact'}</span>
                              {(c.title || c.phone) && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.dim }}>{c.title || c.phone}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </Field>
                )}
              </div>
            )}
            {/* Once a Spark lead is linked to an existing contact, their name /
                designation / mobile / email come from that Contacts record — so
                we don't re-ask for them here (this was the duplicate data entry).
                The compact "Contact" chip above shows those details read-only.
                Unlinked (or non-Spark) leads still capture the person inline. */}
            {!(sparkStructured && personContactId) && text('first_name', 'First name', { required: fields.requiredFor('first_name', true) })}
            {!(sparkStructured && personContactId) && text('last_name',  'Last name',  { required: fields.requiredFor('last_name',  true) })}
            {/* Designation = the built-in `title` field, rendered through the
                field-override helper so it keeps its id, admin label/order and
                hidden/required gating (the contract every built-in must honour). */}
            {sparkStructured && !personContactId && text('title', 'Designation', { placeholder: 'e.g. Maintenance In-charge' })}
            {/* Department (Spark structured) — denormalised onto the lead for the
                name + reporting; the backend also stamps it on the contact. Kept
                even when a contact is linked: it is a per-lead/requirement detail,
                not a property of the person. */}
            {sparkStructured && (
              <Field label="Department">
                <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Instrumentation (optional)" />
              </Field>
            )}
            {!(sparkStructured && personContactId) && text('phone',      'Primary mobile', { required: fields.requiredFor('phone', true), phone: true })}
            {/* Email field is hidden entirely for Tata Tiscon — their FE
                walk-in flow doesn't collect email, and prompting for it
                just to skip it adds friction. */}
            {!isTata && !(sparkStructured && personContactId) && text('email', 'Email', { type: 'email', required: fields.requiredFor('email', false), placeholder: 'name@company.com' })}
          </Grid>
          {/* Built-in field — gate on its own key like every other built-in
              row (and like the Edit form + mobile apps) so hiding
              "alternate_mobiles" on the admin Settings page drops it here too. */}
          {!fields.isHidden('alternate_mobiles') && fullRow('alternate_mobiles', (
            <AlternateMobiles
              values={form.alternate_mobiles}
              primary={form.phone}
              onChange={(next) => setForm({ ...form, alternate_mobiles: next })}
            />
          ), 'phone')}
        </Section>

        {(!fields.isHidden('status') || !fields.isHidden('source_id') || (!fields.isHidden('owner_id') && !ownerLocked) || isBmw || showLeadType) && (
          <Section title="Assignment" hint={ownerLocked ? 'Stage and source.' : 'Stage, source and owner. The owner sees this lead in their queue.'}>
            <Grid narrow={narrow}>
              {!fields.isHidden('status') && (
                <Field label={fields.labelFor('status', 'Status')} htmlFor="lead-field-status" style={fields.orderStyle('status')}>
                  <Select id="lead-field-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {leadStatuses
                      ? leadStatuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)
                      : (
                        <>
                          <option value="new">New</option>
                          <option value="working">Working</option>
                          <option value="qualified">Qualified</option>
                          <option value="unqualified">Unqualified</option>
                        </>
                      )}
                  </Select>
                </Field>
              )}
              {!fields.isHidden('source_id') && (
                <Field label={fields.labelFor('source_id', 'Source')} htmlFor="lead-field-source_id" style={fields.orderStyle('source_id')}>
                  <Select id="lead-field-source_id" value={form.source_id} onChange={(e) => setForm({ ...form, source_id: e.target.value })}>
                    <option value="">— Unspecified —</option>
                    {orderLeadSources(sources).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              )}
              {showLeadType && (
                <Field label={fields.labelFor('lead_type', LEAD_TYPE_DEFAULT_LABEL)} required={fields.requiredFor('lead_type', false)} htmlFor="lead-field-lead_type" style={fields.orderStyle('lead_type')}>
                  <Select id="lead-field-lead_type" value={form.lead_type} required={fields.requiredFor('lead_type', false)} onChange={(e) => setForm({ ...form, lead_type: e.target.value as Form['lead_type'] })}>
                    <option value="">— None —</option>
                    {LEAD_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
              )}
              {/* Self-only roles (e.g. Consumer Champion, data_scope='own') always
                  own the leads they create — hide the assign control and default
                  the owner to themselves. */}
              {/* Admin-only assignment (lead_form.owner_assignment) takes the control away from everyone but
                  an admin; it also waits for the setting + identity so it never flashes up for them. */}
              {!fields.isHidden('owner_id') && !selfOnly && ownerAccess.canAssign && (
                <Field label={fields.labelFor('owner_id', 'Owner')} style={fields.orderStyle('owner_id')}>
                  <UserSearchSelect
                    options={users}
                    value={form.owner_id}
                    onChange={(id) => setForm({ ...form, owner_id: id })}
                    placeholder="Search team member…"
                    emptyLabel="Unassigned (auto-route by rules)"
                  />
                </Field>
              )}
              {/* BMW: a dedicated, prominent Follow-up date. Writes into
                  custom_fields.next_follow_up_date as yyyy-mm-dd (the backend
                  turns it into the day-of reminder). The same custom-field key
                  is excluded from the generic CustomFieldsSection render below
                  for BMW so it isn't shown twice. */}
              {isBmw && (
                <Field label="Follow-up date" htmlFor="lead-field-next_follow_up_date" style={orderOf('next_follow_up_date', 'owner_id')}>
                  <Input
                    id="lead-field-next_follow_up_date"
                    type="date"
                    value={typeof form.custom_fields.next_follow_up_date === 'string' ? form.custom_fields.next_follow_up_date : ''}
                    onChange={(e) => {
                      const v = e.target.value; // native date input yields yyyy-mm-dd
                      setForm((f) => {
                        const cf = { ...f.custom_fields };
                        if (v) cf.next_follow_up_date = v; else delete cf.next_follow_up_date;
                        return { ...f, custom_fields: cf };
                      });
                    }}
                  />
                </Field>
              )}
            </Grid>
          </Section>
        )}

        {/* Spark: the other customer people on this lead besides the primary (nodal)
            contact. Each links an existing contact; sent as secondary lead_contacts. */}
        {sparkStructured && (showOtherPeople || otherContacts.length > 0 ? (
          <Section title="Other people on this lead" hint="GM / DGM / procurement … besides the primary contact (optional).">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {otherContacts.map((row) => (
                <OtherContactRow
                  key={row.key}
                  row={row}
                  onChange={(next) => setOtherContacts((rows) => rows.map((r) => (r.key === row.key ? next : r)))}
                  onRemove={() => setOtherContacts((rows) => rows.filter((r) => r.key !== row.key))}
                  narrow={narrow}
                />
              ))}
              <button
                type="button"
                onClick={() => setOtherContacts((rows) => [...rows, newOtherContact()])}
                style={{ alignSelf: 'flex-start', background: 'transparent', border: `1px dashed ${T.border}`, color: T.text, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                + Add a person
              </button>
            </div>
          </Section>
        ) : (
          // Collapsed by default — most leads have just the primary contact.
          <div style={{ margin: '2px 0 4px' }}>
            <button
              type="button"
              onClick={() => { setShowOtherPeople(true); setOtherContacts([newOtherContact()]); }}
              style={{ alignSelf: 'flex-start', background: 'transparent', border: `1px dashed ${T.border}`, color: T.text, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              + Add other people on this lead (GM / DGM / procurement…)
            </button>
          </div>
        ))}

        {!form.is_b2c ? (
          <>
            <Section title={sparkStructured ? 'Company & plant' : 'Company'} hint={sparkStructured ? 'The organisation, its parent group, and the plant this requirement is for.' : 'Where they work and how they found you.'}>
              {/* Custom fields render inline inside this grid so admin-
                  defined fields look like part of the form, not a tacked-
                  on extension. CustomFieldsSection yields raw <label>
                  children with no wrapper of its own. */}
              <Grid narrow={narrow}>
                {/* Group (Spark structured): the parent group the company maps to.
                    Sent by name — the backend de-dupes/creates it as a parent account. */}
                {sparkStructured && (showGroup || !!form.group.trim() ? (
                  <Field label="Group" hint="Parent group this company maps to (optional).">
                    <Input list="spark-group-list" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })} placeholder="e.g. Tata Steel Limited" />
                  </Field>
                ) : (
                  <button type="button" onClick={() => setShowGroup(true)} style={{ alignSelf: 'end', justifySelf: 'start', background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, padding: '0 0 10px', textDecoration: 'underline' }}>
                    + Add parent group
                  </button>
                ))}
                {b2bAccounts ? companyField() : text('company', 'Company', { required: true })}
                {/* Plant / Unit (Spark structured): nested under the location (the
                    lead's city/state). Suggests the account's known sites. */}
                {sparkStructured && (
                  <PlantPicker
                    value={form.plant}
                    onChange={(plant) => setForm({ ...form, plant })}
                    sites={accountSites}
                    accountLinked={!!form.account_id}
                  />
                )}
                {!sparkStructured && text('title', 'Job title')}
                {/* Industry: a fixed dropdown for Spark & Ray, free text for
                    every other tenant (see industryField). */}
                {industryField()}
                <CustomFieldsSection
                  entity="lead"
                  values={form.custom_fields}
                  onChange={(cf) => setForm({ ...form, custom_fields: cf })}
                  onFieldsChange={reportCustomFieldDefs('main')}
                  isB2c={form.is_b2c}
                  // BMW renders next_follow_up_date as a dedicated control in
                  // the Assignment section, so skip it here to avoid a double render.
                  excludeKeys={genericExcludeKeys(true)}
                />
              </Grid>
            </Section>
            {/* Spark & Ray structured capture (Option A): one requirement for this
                lead, and the make/product/qty lines it covers. Spark-gated. */}
            {sparkStructured && (
              <Section title="Requirement & products" hint="What they need, and the make / product / quantity for each line." flatRow={flat ? { order: UNORDERED_LAST + 1 } : undefined}>
                <Field label="Requirement">
                  <Textarea
                    rows={2}
                    value={form.requirement}
                    onChange={(e) => setForm({ ...form, requirement: e.target.value })}
                    placeholder="e.g. Requirement to Replace ASCO Pulse Valve with MAC Pulse Valves"
                  />
                </Field>
                {showProductDetails || productLines.some((r) => r.makeId || r.productId || r.qty || r.lineValue) ? (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {productLines.map((row) => (
                    <div key={row.key} style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'minmax(0,1.1fr) minmax(0,1.4fr) 90px 120px 32px', gap: 8, alignItems: 'end' }}>
                      <Field label="Make">
                        <Select value={row.makeId} onChange={(e) => {
                          const id = e.target.value; const m = makes.find((x) => x.id === id);
                          setProductLines((rows) => rows.map((r) => (r.key === row.key ? { ...r, makeId: id, makeName: m?.name ?? '' } : r)));
                        }}>
                          <option value="">— Make —</option>
                          {makes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Product">
                        <Select value={row.productId} onChange={(e) => {
                          const id = e.target.value; const p = products.find((x) => x.id === id);
                          setProductLines((rows) => rows.map((r) => (r.key === row.key ? { ...r, productId: id, productName: p?.name ?? '', unit: r.unit || (p?.unit ?? '') } : r)));
                        }}>
                          <option value="">— Product —</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ''}</option>)}
                        </Select>
                      </Field>
                      <Field label="Qty">
                        <Input inputMode="decimal" value={row.qty} onChange={(e) => setProductLines((rows) => rows.map((r) => (r.key === row.key ? { ...r, qty: e.target.value.replace(/[^0-9.]/g, '') } : r)))} placeholder="12" />
                      </Field>
                      <Field label="Line value">
                        <Input inputMode="decimal" value={row.lineValue} onChange={(e) => setProductLines((rows) => rows.map((r) => (r.key === row.key ? { ...r, lineValue: e.target.value.replace(/[^0-9.]/g, '') } : r)))} placeholder="₹" />
                      </Field>
                      <Button type="button" onClick={() => setProductLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [newProductLine()]))} aria-label="Remove product line">×</Button>
                    </div>
                  ))}
                  <div>
                    <Button type="button" onClick={() => setProductLines((rows) => [...rows, newProductLine()])}>
                      + Add product line
                    </Button>
                  </div>
                </div>
                ) : (
                  // Product / make / quantity lines are optional detail — collapsed
                  // by default so the requirement text is all the rep sees first.
                  <button
                    type="button"
                    onClick={() => setShowProductDetails(true)}
                    style={{ marginTop: 10, alignSelf: 'flex-start', background: 'transparent', border: `1px dashed ${T.border}`, color: T.text, borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                  >
                    + Add product / make / quantity details
                  </button>
                )}
              </Section>
            )}
            {/* Clients that turned on lead_form.address_on_b2b get the full
                address block (search + fields) here, like the B2C form. */}
            {leadForm.addressOnB2b && (
              <Section title="Location" hint="Search an address to fill the pin, or type it in.">
                <Grid narrow={narrow}>{addressFields()}</Grid>
              </Section>
            )}
            {/* City is required on B2B leads too — the per-user city-scope
                filter applies to every lead row regardless of B2B/B2C. */}
            {!leadForm.addressOnB2b && !fields.isHidden('city') && (
              <Section title="Location" hint="Used for city scoping and route planning.">
                <div id="lead-field-city" style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '16px 20px', ...(flat ? { gridColumn: '1 / -1', ...fields.orderStyle('city') } : null) }}>
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
              <Section title="Company" hint="Where they work.">
                <Grid narrow={narrow}>
                  {explicitlyShownOnB2C('company')  && text('company', 'Company')}
                  {explicitlyShownOnB2C('title')    && text('title', 'Job title')}
                  {explicitlyShownOnB2C('industry') && industryField()}
                </Grid>
              </Section>
            )}
            <Section title="Customer" hint="Personal details and the channel they prefer.">
              <Grid narrow={narrow}>
                {text('date_of_birth', 'Date of birth', { type: 'date' })}
                {select('gender', 'Gender', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }])}
                {select('preferred_contact_method', 'Preferred channel', [{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS' }])}
              </Grid>
            </Section>
            <Section title="Address" hint="Search an address to fill the pin, or type it in.">
              {/* Custom fields are inlined into the B2C Address grid for
                  the same reason they're in the B2B grid above — they
                  read as part of the form, not a footnote. */}
              <Grid narrow={narrow}>
                {addressFields()}
                <CustomFieldsSection
                  entity="lead"
                  values={form.custom_fields}
                  onChange={(cf) => setForm({ ...form, custom_fields: cf })}
                  onFieldsChange={reportCustomFieldDefs('main')}
                  isB2c={form.is_b2c}
                  // BMW renders next_follow_up_date as a dedicated control in
                  // the Assignment section, so skip it here to avoid a double render.
                  // The sub-industry field is only pulled out when Industry itself renders on this branch.
                  excludeKeys={genericExcludeKeys(explicitlyShownOnB2C('industry'))}
                />
              </Grid>
            </Section>
            {(!fields.isHidden('marketing_consent') || !fields.isHidden('whatsapp_consent')) && (
              <Section title="Consent" hint="Marketing and WhatsApp opt-ins." flatRow={earliestOrder(['marketing_consent', 'whatsapp_consent'])}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5, color: T.text }}>
                  {!fields.isHidden('marketing_consent') && (
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.marketing_consent} onChange={(e) => setForm({ ...form, marketing_consent: e.target.checked })} style={{ width: 16, height: 16 }} />{fields.labelFor('marketing_consent', 'Customer agreed to receive marketing communications')}</label>
                  )}
                  {!fields.isHidden('whatsapp_consent') && (
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={form.whatsapp_consent} onChange={(e) => setForm({ ...form, whatsapp_consent: e.target.checked })} style={{ width: 16, height: 16 }} />{fields.labelFor('whatsapp_consent', 'Customer agreed to be contacted via WhatsApp')}</label>
                  )}
                </div>
              </Section>
            )}
          </>
        )}

        {scheduleVisitSection}

        </FlatRegion>

        {/* Products of Interest is captured in the Convert dialog (deal_product_lines)
            for Kaiyo/Tata, not on the lead form — the rep picks products when the
            lead becomes a deal, so the picker no longer renders here. */}

        {!skipLocation && (
          <Section title="Pin location" hint={b2bAccounts ? 'The lead is pinned where its address is — search and pick the address above. Without one, your current location is used.' : 'The lead is geo-tagged with your current location — captured automatically and required to add a lead.'}>
            <div id="lead-field-location">
              {form.latitude && form.longitude ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: T.okWash, border: `1px solid ${T.ok}`, borderRadius: 8 }}>
                  <MapPin size={18} strokeWidth={1.6} style={{ color: T.ok, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{b2bAccounts && addressPinnedRef.current ? 'Pinned to the selected address' : 'Location captured'}</div>
                    {/* Read-only — coordinates can't be edited by hand. */}
                    <div style={{ fontSize: 12, color: T.dim, fontFamily: T.mono, marginTop: 2 }}>
                      {form.latitude}, {form.longitude}
                    </div>
                  </div>
                  {/* A Spark lead whose address was picked keeps that pin — re-pick the address to move it. */}
                  {!(b2bAccounts && addressPinnedRef.current) && (
                    <Button type="button" size="sm" onClick={captureLocation} disabled={geoBusy}>{geoBusy ? 'Updating…' : 'Update'}</Button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: geoError ? T.redWash : 'var(--s3)', border: `1px solid ${geoError ? T.red : T.border}`, borderRadius: 8, flexWrap: 'wrap' }}>
                  <LocateFixed size={18} strokeWidth={1.6} style={{ color: geoError ? T.red : T.dim, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, lineHeight: 1.45, color: geoError ? T.red : T.dim }}>
                    {geoBusy ? 'Getting your location…' : (geoError || 'Waiting for location…')}
                  </div>
                  <Button type="button" size="sm" variant="primary" onClick={captureLocation} disabled={geoBusy} icon={<LocateFixed size={14} strokeWidth={2} />}>
                    {geoBusy ? 'Locating…' : 'Use my current location'}
                  </Button>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Tata Tiscon: tick to atomically spawn a completed `site_visit`
            activity tied to the new lead. Default on because most adds
            happen at the dealer / consumer counter; the toggle stays
            invisible on every other tenant via the isTata gate. BMW opts out
            of the auto-log flow entirely, so the toggle is hidden there too. */}
        {isTata && !isBmw && (
          <Section title="Activity" hint="Log the visit that produced this lead.">
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '10px 12px', background: 'var(--s3)', border: `1px solid ${T.border}`, borderRadius: 8 }}>
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
                style={{ marginTop: 3, width: 16, height: 16 }}
              />
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>Also log this lead as a Site Visit activity</span>
                <div style={{ fontSize: 12.5, color: T.dim, marginTop: 2, lineHeight: 1.45 }}>
                  Saves this lead and opens the Site Visit activity composer pre-filled.
                  When the First Visit Date custom field is filled in, the activity is recorded as a First Site Visit instead.
                </div>
              </span>
            </label>
          </Section>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 18, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: T.mute }}>
            <Info size={14} strokeWidth={1.6} /> Fields your admin hid in Settings don’t appear here.
          </div>
          {narrow && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
      </form>
    </div>
  );
}

// Form order. When the admin has ordered the lead's fields, the field sections of the form are flattened into ONE grid
// (FlatRegion) so built-in rows and custom fields can interleave through CSS `order`: section headings and grids
// dissolve (`display: contents`) and every row becomes an item of that grid. Not ordered: FlatRegion renders its
// children as they are and Section / Grid below are the plain section / FormGrid, i.e. the layout is unchanged.
const FlatCtx = createContext(false);

function FlatRegion({ flat, narrow, children }: { flat: boolean; narrow: boolean; children: React.ReactNode }) {
  if (!flat) return <>{children}</>;
  return (
    <FlatCtx.Provider value>
      <FormGrid narrow={narrow} style={{ padding: '0 0 22px' }}>{children}</FormGrid>
    </FlatCtx.Provider>
  );
}

function Grid({ narrow, children }: { narrow: boolean; children: React.ReactNode }) {
  const flat = useContext(FlatCtx);
  return flat ? <div style={{ display: 'contents' }}>{children}</div> : <FormGrid narrow={narrow}>{children}</FormGrid>;
}

// `flatRow` (ordered mode only): a block that keeps its own heading — it becomes one full-width grid item at that
// order. Without it the section dissolves into the grid. Inside such a block the layout is the normal one again.
function Section({ title, hint, first, flatRow, children }: { title: string; hint?: string; first?: boolean; flatRow?: React.CSSProperties; children: React.ReactNode }) {
  const flat = useContext(FlatCtx);
  if (!flat) return <FormSection eyebrow={title} hint={hint} first={first}>{children}</FormSection>;
  if (!flatRow) return <div style={{ display: 'contents' }}>{children}</div>;
  return (
    <FlatCtx.Provider value={false}>
      <FormSection eyebrow={title} hint={hint} style={{ padding: 0, borderTop: 0, gridColumn: '1 / -1', ...flatRow }}>{children}</FormSection>
    </FlatCtx.Provider>
  );
}

// One row of the B2B "Contacts & requirements" capture (Spark & Ray). Leads
// with a name typeahead against existing CRM contacts — picking one LINKS the
// row (pins contactId + fills the fields) so a repeat person isn't duplicated;
// typing a fresh name creates a new contact on save. Manages its own search
// state so each row searches independently. Mirrors the Company→account
// typeahead one level down (lead → account → contacts).
// One "Other people on this lead" row (Spark): link an existing contact via a
// typeahead + a free-text role. Picking pins contactId; sent as a secondary
// lead_contact (is_primary false). Own search state so each row searches alone.
function OtherContactRow({ row, onChange, onRemove, narrow }: {
  row: OtherLeadContact; onChange: (next: OtherLeadContact) => void; onRemove: () => void; narrow: boolean;
}) {
  const [query, setQuery] = useState(row.name);
  const [results, setResults] = useState<Array<{ id: string; first_name?: string | null; last_name?: string | null; title?: string | null; phone?: string | null }>>([]);
  useEffect(() => {
    if (row.contactId) { setResults([]); return; }
    const term = query.trim();
    if (term.length < 2) { setResults([]); return; }
    let off = false;
    const t = setTimeout(() => {
      crmContacts.list({ q: term, limit: 8 })
        .then((r) => { if (!off) setResults(((r.data as unknown as Array<Record<string, unknown>>) || []).filter((c) => c && c.id) as typeof results); })
        .catch(() => { if (!off) setResults([]); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [row.contactId, query]);
  const nameOf = (c: { first_name?: string | null; last_name?: string | null }) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact';
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: narrow ? 12 : 14, display: 'grid', gridTemplateColumns: narrow ? '1fr' : '2fr 1fr auto', gap: 10, alignItems: 'end', background: 'var(--s2)' }}>
      {row.contactId ? (
        <Field label="Contact">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 8, background: T.card }}>
            <CheckCircle2 size={15} strokeWidth={2} style={{ color: T.ok, flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>👤 {row.name || 'Linked contact'}</span>
            {row.title && <span style={{ color: T.dim }}>· {row.title}</span>}
            <button type="button" onClick={() => { onChange({ ...row, contactId: '', name: '', title: '' }); setQuery(''); }} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: 0 }}>Change</button>
          </div>
        </Field>
      ) : (
        <Field label="Contact">
          <div style={{ position: 'relative' }}>
            <Input autoComplete="off" placeholder="Start typing a contact name…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {results.length > 0 && (
              <div role="listbox" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                {results.map((c) => (
                  <button key={c.id} type="button" role="option"
                    onClick={() => { onChange({ ...row, contactId: c.id, name: nameOf(c), title: c.title || '' }); setResults([]); setQuery(nameOf(c)); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13.5, color: T.text }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s3)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
                    <span aria-hidden>👤</span>
                    <span style={{ fontWeight: 600 }}>{nameOf(c)}</span>
                    {(c.title || c.phone) && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.dim }}>{c.title || c.phone}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>
      )}
      <Field label="Role"><Input placeholder="e.g. Procurement" value={row.role} onChange={(e) => onChange({ ...row, role: e.target.value })} /></Field>
      <button type="button" onClick={onRemove} style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: '0 0 10px' }}>Remove</button>
    </div>
  );
}

function ContactRow({ row, index, onChange, onRemove, canRemove, narrow }: {
  row: LeadContactRow; index: number;
  onChange: (next: LeadContactRow) => void; onRemove: () => void; canRemove: boolean; narrow: boolean;
}) {
  const [results, setResults] = useState<Array<{ id: string; first_name?: string | null; last_name?: string | null; title?: string | null; phone?: string | null; email?: string | null }>>([]);
  useEffect(() => {
    // Don't search once a contact is linked; the rep clears the link to search again.
    if (row.contactId) { setResults([]); return; }
    const term = `${row.firstName} ${row.lastName}`.trim();
    if (term.length < 2) { setResults([]); return; }
    let off = false;
    const t = setTimeout(() => {
      crmContacts.list({ q: term, limit: 8 })
        .then((r) => { if (!off) setResults(((r.data as any[]) || []).filter((c) => c && c.id)); })
        .catch(() => { if (!off) setResults([]); });
    }, 250);
    return () => { off = true; clearTimeout(t); };
  }, [row.contactId, row.firstName, row.lastName]);

  const nameOf = (c: { first_name?: string | null; last_name?: string | null }) =>
    [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact';

  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: narrow ? 12 : 14, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--s2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.dim, textTransform: 'uppercase', letterSpacing: 0.3 }}>Person {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} style={{ background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: 0 }}>
            Remove
          </button>
        )}
      </div>

      {row.contactId ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: T.text }}>
          <CheckCircle2 size={15} strokeWidth={2} style={{ color: T.ok, flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>👤 {[row.firstName, row.lastName].filter(Boolean).join(' ') || 'Linked contact'}</span>
          {row.title && <span style={{ color: T.dim }}>· {row.title}</span>}
          <button
            type="button"
            onClick={() => onChange({ ...row, contactId: '' })}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: T.dim, cursor: 'pointer', fontSize: 12.5, textDecoration: 'underline', padding: 0 }}
          >
            Change
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: narrow ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '10px 16px' }}>
          <Field label="First name">
            <div style={{ position: 'relative' }}>
              <Input
                autoComplete="off"
                placeholder="Start typing to link a contact…"
                value={row.firstName}
                onChange={(e) => onChange({ ...row, firstName: e.target.value })}
              />
              {results.length > 0 && (
                <div role="listbox" style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, right: 0, background: T.panel, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                  {results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      onClick={() => { onChange({ ...row, contactId: c.id, firstName: c.first_name || '', lastName: c.last_name || '', title: c.title || '', phone: c.phone || '', email: c.email || '' }); setResults([]); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 13.5, color: T.text }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--s3)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <span aria-hidden>👤</span>
                      <span style={{ fontWeight: 600 }}>{nameOf(c)}</span>
                      {(c.title || c.phone) && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: T.dim }}>{c.title || c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Last name"><Input value={row.lastName} onChange={(e) => onChange({ ...row, lastName: e.target.value })} /></Field>
          <Field label="Designation"><Input value={row.title} onChange={(e) => onChange({ ...row, title: e.target.value })} /></Field>
          <Field label="Phone"><Input type="tel" inputMode="numeric" value={row.phone} onChange={(e) => onChange({ ...row, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} placeholder="10-digit mobile" /></Field>
          <Field label="Email"><Input type="email" value={row.email} onChange={(e) => onChange({ ...row, email: e.target.value })} placeholder="name@company.com" /></Field>
        </div>
      )}

      <Field label="Requirement" hint="What this person is asking for.">
        <Textarea rows={2} value={row.requirement} onChange={(e) => onChange({ ...row, requirement: e.target.value })} placeholder="e.g. 200 MT TMT bars for a Q3 project" />
      </Field>
    </div>
  );
}

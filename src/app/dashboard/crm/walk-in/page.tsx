'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { crmLeads } from '../../../../lib/crmApi';
import type { AfterSalesTelecaller } from '../../../../types/crm';
import { useAuth } from '../../../../hooks/useAuth';
import { isWalkInExecutive } from '../../../../lib/clientFeatures';
import SignedImage from '../../../../components/shared/SignedImage';

/**
 * Walk-in "Not Purchased" lead capture — the web twin of the Android
 * WalkInLeadCreateScreen. Marketing records a walk-in customer who did NOT
 * purchase, then hands the lead to a telecaller under the "Walk-in" category so
 * it lands in that telecaller's My Calls → Walk-in section with the reason and
 * every captured detail. The "Items Viewed / Shown" section from the original
 * paper form is intentionally omitted per product.
 *
 * The custom_fields key set written here matches the Android + backend contract
 * exactly, so a lead captured on either surface renders identically.
 */

// Option sets — kept in lockstep with Android WalkInLead so a value reads the
// same on every surface.
const REASONS = [
  'Price High', 'Comparing with Other Shops', 'Will Purchase Later',
  'Design Not Available', 'Budget Issue', 'Other',
];
const DISCOUNT_TYPES: Array<[string, string]> = [['per_gram', '₹ per gram'], ['total', 'Total Amount']];

interface WalkInForm {
  name: string;
  phone: string;
  location: string;
  visitDate: string;
  marketingEmployee: string;
  storeBranch: string;
  itemsViewed: string;
  itemsViewedPhotos: string[];
  goldRate: string;
  totalWeight: string;
  estimateAmount: string;
  discountType: string;
  discountValue: string;
  estimatedFinalPrice: string;
  estimateRemarks: string;
  notPurchaseReason: string;
  notPurchaseReasonOther: string;
  nextFollowUpDate: string;
  assignTelecallerId: string;
  sendWhatsappReminder: boolean;
}

const emptyForm = (): WalkInForm => ({
  name: '', phone: '', location: '', visitDate: '', marketingEmployee: '', storeBranch: '',
  itemsViewed: '', itemsViewedPhotos: [],
  goldRate: '', totalWeight: '', estimateAmount: '', discountType: 'per_gram', discountValue: '',
  estimatedFinalPrice: '', estimateRemarks: '', notPurchaseReason: '', notPurchaseReasonOther: '',
  nextFollowUpDate: '', assignTelecallerId: '', sendWhatsappReminder: true,
});

/** Digits-only, last 10 (matches the backend + Android phone normalisation). */
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '').slice(-10);
}

/** The lead's custom_fields for a walk-in capture. Blank values dropped; "Other"
 *  carries its free text. Identical key set to Android WalkInLead.customFields. */
function buildCustomFields(f: WalkInForm): Record<string, unknown> {
  const out: Record<string, unknown> = { campaign: 'Walk-in', purchase_status: 'not_purchased' };
  const put = (k: string, v: string) => { const t = v.trim(); if (t) out[k] = t; };
  put('not_purchase_reason', f.notPurchaseReason);
  if (f.notPurchaseReason === 'Other') put('not_purchase_reason_other', f.notPurchaseReasonOther);
  put('visit_date', f.visitDate);
  put('marketing_employee', f.marketingEmployee);
  put('store_branch', f.storeBranch);
  put('items_viewed', f.itemsViewed);
  const photos = f.itemsViewedPhotos.filter((u) => u.trim());
  if (photos.length) out.items_viewed_photos = photos;
  put('gold_rate', f.goldRate);
  put('total_weight_gm', f.totalWeight);
  put('estimate_amount', f.estimateAmount);
  put('discount_type', f.discountType);
  put('discount_value', f.discountValue);
  put('estimated_final_price', f.estimatedFinalPrice);
  put('estimate_remarks', f.estimateRemarks);
  put('next_follow_up_date', f.nextFollowUpDate);
  out.send_whatsapp_reminder = f.sendWhatsappReminder;
  return out;
}

/** First blocking problem, or null when the form can be saved. */
function validationError(f: WalkInForm): string | null {
  if (!f.name.trim()) return 'Enter the customer name';
  if (normalizePhone(f.phone).length !== 10) return 'Enter a valid 10-digit mobile number';
  if (!f.assignTelecallerId) return 'Assign a telecaller';
  if (!f.notPurchaseReason) return 'Select a reason for not purchasing';
  if (f.notPurchaseReason === 'Other' && !f.notPurchaseReasonOther.trim()) return 'Describe the “Other” reason';
  return null;
}

export default function WalkInLeadPage() {
  const router = useRouter();
  const { user } = useAuth();
  // Resolve the tenant gate after mount (reads the super-admin client picker off
  // localStorage, SSR-unsafe). Starting null avoids a hydration flash.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { setAllowed(isWalkInExecutive(user as any)); }, [user]);

  const [form, setForm] = useState<WalkInForm>(emptyForm);
  const [telecallers, setTelecallers] = useState<AfterSalesTelecaller[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const set = <K extends keyof WalkInForm>(k: K, v: WalkInForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  // Upload each picked image via /api/v1/upload/photo (the shared form-photo
  // endpoint; multer expects field name `photo`) and append the stored URLs to
  // the form. Stored URLs resolve to a signed URL on display via SignedImage.
  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('kinematic_token') : null;
    const orgId = typeof window !== 'undefined' ? (JSON.parse(localStorage.getItem('kinematic_user') || '{}').org_id || '') : '';
    for (const file of Array.from(files)) {
      if (!/^image\//.test(file.type)) { toast.error(`${file.name}: pick an image file`); continue; }
      if (file.size > 8 * 1024 * 1024) { toast.error(`${file.name}: must be under 8 MB`); continue; }
      setUploading((n) => n + 1);
      try {
        const fd = new FormData();
        fd.append('photo', file);
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/upload/photo`, {
          method: 'POST',
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(orgId ? { 'X-Org-Id': orgId } : {}) },
          body: fd,
        });
        const json = await r.json();
        const url = json?.data?.url || json?.url;
        if (!url) throw new Error(json?.error || json?.message || 'Upload failed');
        setForm((p) => ({ ...p, itemsViewedPhotos: [...p.itemsViewedPhotos, url] }));
      } catch (e: any) {
        toast.error(e?.message || `${file.name}: upload failed`);
      } finally {
        setUploading((n) => Math.max(0, n - 1));
      }
    }
  };

  useEffect(() => {
    crmLeads.telecallers()
      .then((r) => setTelecallers(r.data))
      .catch(() => { /* picker just stays empty; validation blocks save */ });
  }, []);

  const err = useMemo(() => validationError(form), [form]);

  const submit = async () => {
    if (saving) return;
    if (err) { toast.error(err); return; }
    setSaving(true);
    try {
      const created = await crmLeads.create({
        first_name: form.name.trim(),
        phone: normalizePhone(form.phone),
        city: form.location.trim() || null,
        status: 'new',
        custom_fields: buildCustomFields(form),
      } as any);
      const leadId = created.data?.id;
      if (!leadId) throw new Error('Could not save the lead');
      // Two-step: a marketing user can't set owner_id on create, so the
      // privileged assign endpoint stamps the telecaller + Walk-in campaign and
      // the optional capture-time follow-up.
      try {
        await crmLeads.assignTelecaller(leadId, {
          telecaller_id: form.assignTelecallerId,
          campaign: 'Walk-in',
          follow_up_date: form.nextFollowUpDate || null,
        });
        toast.success('Walk-in lead saved and assigned to the telecaller');
      } catch {
        toast.warning('Lead saved, but couldn’t assign the telecaller — assign it from the lead.');
      }
      router.push('/dashboard/crm/leads');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save the walk-in lead');
    } finally {
      setSaving(false);
    }
  };

  if (allowed === false) {
    return (
      <div style={{ padding: 24, color: 'var(--text-dim)', fontSize: 14 }}>
        Walk-in lead capture is not enabled for this workspace.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Create Lead (Not Purchased)</h1>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
          Capture a walk-in customer who didn&rsquo;t purchase and hand them to a telecaller. The lead appears in the telecaller&rsquo;s My Calls under the Walk-in category, with the reason highlighted.
        </p>
      </div>

      <Card>
        <SectionTitle>1. Customer Details</SectionTitle>
        <Grid>
          <Field label="Customer name *"><input style={inp()} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Anita Sharma" /></Field>
          <Field label="Mobile number *"><input style={inp()} value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="10-digit mobile" /></Field>
          <Field label="Location"><input style={inp()} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="City / area" /></Field>
        </Grid>
      </Card>

      <Card>
        <SectionTitle>2. Visit Details</SectionTitle>
        <Grid>
          <Field label="Visit date"><input type="date" style={inp()} value={form.visitDate} onChange={(e) => set('visitDate', e.target.value)} /></Field>
          <Field label="Marketing employee"><input style={inp()} value={form.marketingEmployee} onChange={(e) => set('marketingEmployee', e.target.value)} /></Field>
          <Field label="Store branch"><input style={inp()} value={form.storeBranch} onChange={(e) => set('storeBranch', e.target.value)} /></Field>
        </Grid>
      </Card>

      <Card>
        <SectionTitle>3. Items Viewed / Shown</SectionTitle>
        <Field label="Items viewed / shown">
          <textarea style={{ ...inp(), minHeight: 60, resize: 'vertical' }} value={form.itemsViewed} onChange={(e) => set('itemsViewed', e.target.value)} placeholder="e.g. 22K bangles set, diamond pendant" />
        </Field>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>Photos</div>
          {form.itemsViewedPhotos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {form.itemsViewedPhotos.map((url) => (
                <div key={url} style={{ position: 'relative' }}>
                  <SignedImage src={url} alt="Item" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)' }} />
                  <button
                    type="button"
                    onClick={() => set('itemsViewedPhotos', form.itemsViewedPhotos.filter((u) => u !== url))}
                    aria-label="Remove photo"
                    style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 999, border: 'none', background: '#EF4444', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', lineHeight: '22px', padding: 0 }}
                  >×</button>
                </div>
              ))}
            </div>
          )}
          <label style={{ ...ghostBtn(), display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {uploading > 0 ? 'Uploading…' : '📷 Add photos'}
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} disabled={uploading > 0}
              onChange={(e) => { void uploadPhotos(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </Card>

      <Card>
        <SectionTitle>4. Estimate &amp; Discount Offered</SectionTitle>
        <Grid>
          <Field label="Gold rate (₹/gm)"><input type="number" style={inp()} value={form.goldRate} onChange={(e) => set('goldRate', e.target.value)} /></Field>
          <Field label="Total weight (gm)"><input type="number" style={inp()} value={form.totalWeight} onChange={(e) => set('totalWeight', e.target.value)} /></Field>
          <Field label="Estimate amount (₹)"><input type="number" style={inp()} value={form.estimateAmount} onChange={(e) => set('estimateAmount', e.target.value)} /></Field>
          <Field label="Discount given"><input type="number" style={inp()} value={form.discountValue} onChange={(e) => set('discountValue', e.target.value)} /></Field>
          <Field label="Estimated final price (₹)"><input type="number" style={inp()} value={form.estimatedFinalPrice} onChange={(e) => set('estimatedFinalPrice', e.target.value)} /></Field>
        </Grid>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600, marginBottom: 6 }}>Discount type</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DISCOUNT_TYPES.map(([value, label]) => (
              <Chip key={value} selected={form.discountType === value} onClick={() => set('discountType', value)}>{label}</Chip>
            ))}
          </div>
        </div>
        <Field label="Remarks"><textarea style={{ ...inp(), minHeight: 60, resize: 'vertical' }} value={form.estimateRemarks} onChange={(e) => set('estimateRemarks', e.target.value)} /></Field>
      </Card>

      <Card>
        <SectionTitle>5. Reason for Not Purchasing *</SectionTitle>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {REASONS.map((r) => (
            <Chip key={r} selected={form.notPurchaseReason === r} onClick={() => set('notPurchaseReason', r)}>{r}</Chip>
          ))}
        </div>
        {form.notPurchaseReason === 'Other' && (
          <div style={{ marginTop: 10 }}>
            <Field label="Describe the reason"><input style={inp()} value={form.notPurchaseReasonOther} onChange={(e) => set('notPurchaseReasonOther', e.target.value)} /></Field>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>6. Follow Up Details</SectionTitle>
        <Grid>
          <Field label="Next follow-up date"><input type="date" style={inp()} value={form.nextFollowUpDate} onChange={(e) => set('nextFollowUpDate', e.target.value)} /></Field>
          <Field label="Assign telecaller *">
            <select style={inp()} value={form.assignTelecallerId} onChange={(e) => set('assignTelecallerId', e.target.value)}>
              <option value="">{telecallers.length === 0 ? '— No telecallers found —' : '— Choose a telecaller —'}</option>
              {telecallers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.email ? ` (${t.email})` : ''}</option>
              ))}
            </select>
          </Field>
        </Grid>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)', marginTop: 10 }}>
          <input type="checkbox" checked={form.sendWhatsappReminder} onChange={(e) => set('sendWhatsappReminder', e.target.checked)} />
          Send WhatsApp reminder
        </label>
      </Card>

      {telecallers.length === 0 && (
        <div style={{ fontSize: 12, color: '#F59E0B' }}>
          No telecaller users found in this workspace. Create a user with the Telecaller role first.
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={submit} disabled={saving} style={primaryBtn(saving)}>{saving ? 'Saving…' : 'Save as Lead'}</button>
        <button onClick={() => router.push('/dashboard/crm/leads')} disabled={saving} style={ghostBtn()}>Cancel</button>
      </div>
    </div>
  );
}

// ── UI atoms (match the After-Sales data-entry page) ───────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--text-dim)', margin: '0 0 10px' }}>{children}</div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}
function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
      border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
      background: selected ? 'var(--primary)' : 'var(--s1)',
      color: selected ? '#fff' : 'var(--text)',
    }}>{children}</button>
  );
}
function inp(): React.CSSProperties {
  return { background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box' };
}
function primaryBtn(disabled: boolean): React.CSSProperties {
  return { background: disabled ? 'var(--s1)' : 'var(--primary)', color: disabled ? 'var(--text-dim)' : '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer' };
}
function ghostBtn(): React.CSSProperties {
  return { background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' };
}

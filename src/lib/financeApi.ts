import api, { API_BASE_URL } from './api';

const BASE = '/api/v1/finance';

export type Wrapped<T> = { success: boolean; data: T; pagination?: { total: number; page: number; limit: number } };
type Params = Record<string, string | number | boolean | undefined | null>;

const qs = (p?: Params) => {
  const e = Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== 'all');
  return e.length ? `?${e.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};
// Billing data must never sit in the api client's stale-while-revalidate localStorage cache.
const noCache = { noCache: true } as RequestInit;
const get = <T>(path: string) => api.get<Wrapped<T>>(`${BASE}${path}`, noCache);

// ── types ───────────────────────────────────────────────────────────────────
export interface Address { attention?: string | null; line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; pincode?: string | null; country?: string | null; phone?: string | null }

export interface FinanceSettings {
  id: string; business_name: string | null; email: string | null; phone: string | null; website: string | null;
  address_line1: string | null; address_line2: string | null; city: string | null; state: string | null; state_code: string | null;
  pincode: string | null; country: string | null; gstin: string | null; pan: string | null; logo_url: string | null; currency: string;
  fiscal_year_start_month: number;
  invoice_prefix: string; invoice_next_number: number; quote_prefix: string; quote_next_number: number;
  payment_prefix: string; payment_next_number: number; number_padding: number;
  default_payment_terms_days: number; default_notes: string | null; default_terms: string | null;
  bank_details: { account_name?: string | null; bank_name?: string | null; account_number?: string | null; ifsc?: string | null; branch?: string | null; upi_id?: string | null };
  template: { accent_color?: string; show_logo?: boolean; show_bank_details?: boolean; signature_name?: string | null; footer_text?: string | null };
  email_subject_template: string | null; email_body_template: string | null;
}
export type PublicSettings = Pick<FinanceSettings, 'business_name' | 'email' | 'phone' | 'website' | 'address_line1' | 'address_line2' | 'city' | 'state' | 'state_code' | 'pincode' | 'country' | 'gstin' | 'pan' | 'logo_url' | 'currency' | 'bank_details' | 'template'>;

export type GstTreatment = 'registered_regular' | 'registered_composition' | 'unregistered' | 'consumer' | 'overseas' | 'sez';
export interface ContactPerson { salutation?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; work_phone?: string | null; mobile?: string | null; designation?: string | null }

export interface FinanceCustomer {
  id: string; customer_type: 'business' | 'individual'; salutation: string | null; first_name: string | null; last_name: string | null;
  company_name: string | null; display_name: string; email: string | null; work_phone: string | null; mobile: string | null;
  language: string; currency: string; gst_treatment: GstTreatment | null; gstin: string | null; place_of_supply: string | null; pan: string | null;
  tax_preference: 'taxable' | 'exempt'; payment_terms_days: number; billing_address: Address; shipping_address: Address;
  contact_persons: ContactPerson[]; remarks: string | null; portal_enabled: boolean; is_active: boolean; created_at: string;
  outstanding?: number; overdue?: number; total_billed?: number;
}
export type CustomerInput = Partial<Omit<FinanceCustomer, 'id' | 'created_at' | 'outstanding' | 'overdue' | 'total_billed'>> & { display_name: string };

export interface FinanceItem {
  id: string; name: string; item_type: 'goods' | 'service'; unit: string | null; hsn_sac: string | null; tax_preference: 'taxable' | 'exempt';
  gst_rate: number; selling_price: number; description: string | null; is_active: boolean;
}
export type ItemInput = Partial<Omit<FinanceItem, 'id'>> & { name: string };

export type InvoiceStatus = 'draft' | 'sent' | 'partially_paid' | 'paid' | 'void';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'invoiced';
/** `overdue` / `expired` are derived by the server in display_status. */
export type DisplayStatus = InvoiceStatus | QuoteStatus | 'overdue' | 'expired';

export interface DocLine {
  id?: string; item_id?: string | null; name: string; description?: string | null; hsn_sac?: string | null; unit?: string | null;
  quantity: number; rate: number; discount_pct: number; gst_rate: number;
  /** Billing duration in months; rate is per month. null/absent = one-time. */
  duration_months?: number | null;
  taxable_value?: number; cgst?: number; sgst?: number; igst?: number; total?: number;
}
export interface DocRow {
  id: string; number: string; doc_type: 'invoice' | 'quote'; reference_number: string | null; status: string; display_status: DisplayStatus;
  customer_id: string; customer_snapshot: { name?: string; email?: string; gstin?: string; phone?: string; company_name?: string };
  issue_date: string; due_date: string | null; expiry_date: string | null; total: number; amount_paid: number; balance: number;
  sent_at: string | null; created_at: string;
}
export interface DocEvent { id: string; event: string; detail: Record<string, unknown>; actor: string | null; created_at: string }
export interface DocPayment { allocation_id: string; amount: number; id: string; payment_number: string; payment_date: string; mode: string; reference: string | null }
export interface DocDetail extends DocRow {
  subject: string | null; bill_to: Address; ship_to: Address; payment_terms_days: number; place_of_supply: string | null; seller_state_code: string | null;
  subtotal: number; discount_total: number; taxable_value: number; cgst: number; sgst: number; igst: number; tax_total: number;
  adjustment: number; adjustment_label: string | null; round_off: number; notes: string | null; terms: string | null;
  share_token: string; viewed_at: string | null; last_sent_to: string | null; converted_invoice_id: string | null; source_quote_id: string | null;
  items: DocLine[]; events: DocEvent[]; payments: DocPayment[];
}
export interface DocInput {
  customer_id: string; reference_number?: string | null; subject?: string | null; issue_date?: string; due_date?: string | null; expiry_date?: string | null;
  payment_terms_days?: number; place_of_supply?: string | null; bill_to?: Address; ship_to?: Address; items: DocLine[];
  adjustment?: number; adjustment_label?: string | null; notes?: string | null; terms?: string | null;
}
export interface SendInput { to?: string; cc?: string[]; subject?: string; message?: string; attach_pdf?: boolean }
export interface SendResult { document: DocDetail; delivery: { to: string; provider: string; live: boolean }; link: string }

export type PaymentMode = 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'card' | 'other';
export interface PaymentRow {
  id: string; payment_number: string; customer_id: string; payment_date: string; amount: number; unused_amount: number; mode: PaymentMode;
  reference: string | null; notes: string | null; customer?: { id: string; display_name: string; email?: string | null };
  allocations?: Array<{ id: string; amount: number; document: { id: string; number: string; total: number; issue_date: string } }>;
}
export interface PaymentInput {
  customer_id: string; payment_date?: string; amount: number; mode?: PaymentMode; reference?: string | null; notes?: string | null;
  allocations?: Array<{ document_id: string; amount: number }>; auto_apply?: boolean;
}
export interface OpenInvoice { id: string; number: string; balance: number; status: string; issue_date: string; customer_id: string }

export interface DashboardData {
  period: { from: string; to: string; label: string };
  receivables: { total: number; current: number; d1_15: number; d16_30: number; d31_45: number; d45_plus: number; open_invoices: number; overdue_invoices: number };
  totals: { sales: number; receipts: number };
  months: Array<{ month: string; label: string; sales: number; receipts: number }>;
  draft_invoices: number; open_quotes: number;
}
export interface ReportColumn { key: string; label: string; type?: 'text' | 'money' | 'number' | 'date' }
export interface ReportData { title: string; columns: ReportColumn[]; rows: Array<Record<string, unknown>>; totals?: Record<string, unknown>; meta: Record<string, unknown> }
export type ReportName = 'sales-by-customer' | 'sales-by-item' | 'gst-summary' | 'receivables-ageing' | 'payments-received' | 'invoice-details';

// ── import previous invoices ────────────────────────────────────────────────
export interface ImportOptions { create_customers: boolean; allow_total_mismatch: boolean; advance_numbering: boolean }
export interface ImportPreviewInvoice {
  number: string; issue_date: string | null; due_date: string | null; status: 'draft' | 'sent' | 'paid' | 'partially_paid' | 'void';
  customer: string; customer_action: 'match' | 'create' | 'missing'; lines: number; total: number; file_total: number | null;
  paid: number; balance: number; action: 'import' | 'skip_duplicate' | 'error'; problems: string[]; warnings: string[];
}
export interface ImportPreview {
  file: { name: string; rows: number; rows_without_number: number };
  columns: { detected: Array<{ field: string; label: string; header: string }>; ignored: string[] };
  summary: { invoices: number; importable: number; duplicates: number; errors: number; with_warnings: number; new_customers: number; total_value: number; outstanding: number };
  invoices: ImportPreviewInvoice[]; truncated: boolean;
}
export interface ImportResult {
  imported: number; skipped_duplicates: number; failed: Array<{ number: string; reason: string }>;
  customers_created: number; payments_created: number; next_invoice_number: number | null;
}

export interface PublicDoc { document: DocDetail & { display_status: DisplayStatus }; items: DocLine[]; settings: PublicSettings }

function importForm(file: File, options: ImportOptions) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('options', JSON.stringify(options));
  return fd;
}

// ── client ──────────────────────────────────────────────────────────────────
function documents(path: 'invoices' | 'quotes') {
  const b = `/${path}`;
  return {
    list: (p?: Params) => get<DocRow[]>(`${b}${qs(p)}`),
    get: (id: string) => get<DocDetail>(`${b}/${id}`),
    create: (body: DocInput) => api.post<Wrapped<DocDetail>>(`${BASE}${b}`, body),
    update: (id: string, body: DocInput) => api.put<Wrapped<DocDetail>>(`${BASE}${b}/${id}`, body),
    remove: (id: string) => api.delete<Wrapped<{ id: string }>>(`${BASE}${b}/${id}`),
    send: (id: string, body: SendInput) => api.post<Wrapped<SendResult>>(`${BASE}${b}/${id}/send`, body),
    markSent: (id: string) => api.post<Wrapped<DocDetail>>(`${BASE}${b}/${id}/mark-sent`, {}),
    clone: (id: string) => api.post<Wrapped<DocDetail>>(`${BASE}${b}/${id}/clone`, {}),
    shareLink: (id: string) => get<{ url: string; token: string }>(`${b}/${id}/share-link`),
    /** Authenticated PDF download as a Blob. */
    pdf: (id: string) => api.download(`${BASE}${b}/${id}/pdf`),
  };
}

export const financeApi = {
  meta: () => get<{ is_master: boolean; email_provider: string; email_live: boolean }>('/meta'),
  settings: {
    get: () => get<FinanceSettings>('/settings'),
    update: (body: Partial<FinanceSettings>) => api.put<Wrapped<FinanceSettings>>(`${BASE}/settings`, body),
  },
  customers: {
    list: (p?: Params) => get<Array<FinanceCustomer & { outstanding: number }>>(`/customers${qs(p)}`),
    get: (id: string) => get<FinanceCustomer>(`/customers/${id}`),
    create: (body: CustomerInput) => api.post<Wrapped<FinanceCustomer>>(`${BASE}/customers`, body),
    update: (id: string, body: Partial<CustomerInput>) => api.put<Wrapped<FinanceCustomer>>(`${BASE}/customers/${id}`, body),
    remove: (id: string) => api.delete<Wrapped<{ id: string }>>(`${BASE}/customers/${id}`),
    openInvoices: (id: string) => get<OpenInvoice[]>(`/customers/${id}/open-invoices`),
  },
  items: {
    list: (p?: Params) => get<FinanceItem[]>(`/items${qs(p)}`),
    get: (id: string) => get<FinanceItem>(`/items/${id}`),
    create: (body: ItemInput) => api.post<Wrapped<FinanceItem>>(`${BASE}/items`, body),
    update: (id: string, body: Partial<ItemInput>) => api.put<Wrapped<FinanceItem>>(`${BASE}/items/${id}`, body),
    remove: (id: string) => api.delete<Wrapped<{ id: string }>>(`${BASE}/items/${id}`),
  },
  invoices: {
    ...documents('invoices'),
    void: (id: string) => api.post<Wrapped<DocDetail>>(`${BASE}/invoices/${id}/void`, {}),
  },
  quotes: {
    ...documents('quotes'),
    accept: (id: string) => api.post<Wrapped<DocDetail>>(`${BASE}/quotes/${id}/accept`, {}),
    decline: (id: string) => api.post<Wrapped<DocDetail>>(`${BASE}/quotes/${id}/decline`, {}),
    /** Creates a draft invoice from the quote and returns it. */
    convert: (id: string) => api.post<Wrapped<DocDetail>>(`${BASE}/quotes/${id}/convert`, {}),
  },
  payments: {
    list: (p?: Params) => get<PaymentRow[]>(`/payments${qs(p)}`),
    get: (id: string) => get<PaymentRow>(`/payments/${id}`),
    create: (body: PaymentInput) => api.post<Wrapped<PaymentRow>>(`${BASE}/payments`, body),
    update: (id: string, body: Partial<Pick<PaymentInput, 'payment_date' | 'mode' | 'reference' | 'notes'>>) => api.put<Wrapped<PaymentRow>>(`${BASE}/payments/${id}`, body),
    remove: (id: string) => api.delete<Wrapped<{ id: string }>>(`${BASE}/payments/${id}`),
    apply: (id: string, allocations: Array<{ document_id: string; amount: number }>) => api.post<Wrapped<PaymentRow>>(`${BASE}/payments/${id}/apply`, { allocations }),
  },
  importInvoices: {
    /** Parses and validates the file; writes nothing. */
    preview: (file: File, options: ImportOptions) => api.postForm<Wrapped<ImportPreview>>(`${BASE}/import/invoices/preview`, importForm(file, options)),
    /** Imports for real (the server re-validates the same file). */
    commit: (file: File, options: ImportOptions) => api.postForm<Wrapped<ImportResult>>(`${BASE}/import/invoices/commit`, importForm(file, options)),
  },
  reports: {
    dashboard: (p?: { period?: 'this_fy' | 'last_fy' }) => get<DashboardData>(`/reports/dashboard${qs(p)}`),
    run: (name: ReportName, p?: Params) => api.get<Wrapped<ReportData>>(`${BASE}/reports/${name}${qs(p)}`, noCache),
    /** Same filters as run(); returns the CSV file. */
    csv: (name: ReportName, p?: Params) => api.download(`${BASE}/reports/${name}${qs({ ...p, format: 'csv' })}`),
  },
};

// ── public (no login) invoice link ──────────────────────────────────────────
/** Raw fetch on purpose: the customer has no session. `project` comes from the link's ?p= and routes to the right database. */
export async function fetchPublicDoc(token: string, project?: string | null): Promise<PublicDoc> {
  const res = await fetch(`${API_BASE_URL}/api/v1/finance/public/${encodeURIComponent(token)}${project ? `?p=${encodeURIComponent(project)}` : ''}`);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(json?.error?.message || json?.error || 'This link is invalid or has expired.');
  return json.data as PublicDoc;
}
export const publicPdfUrl = (token: string, project?: string | null) =>
  `${API_BASE_URL}/api/v1/finance/public/${encodeURIComponent(token)}/pdf${project ? `?p=${encodeURIComponent(project)}` : ''}`;

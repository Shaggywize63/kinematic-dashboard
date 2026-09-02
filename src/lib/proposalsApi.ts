import api from './api';

// Typed client for the Generate-Proposal API. A rep picks the products a lead
// is interested in; the backend generates an AI-tailored, branded PDF, stores
// it, and returns a signed URL that can be shared by WhatsApp / email / saved.
// Backend base /api/v1/crm (bearer + X-Org-Id / X-Client-Id auto-attached by
// ./api). Responses are wrapped { success, data }.

type Wrapped<T> = { success: boolean; data: T };
const BASE = '/api/v1/crm';

export interface ProposalItemInput {
  product_id?: string | null;
  name: string;
  description?: string | null;
  sku?: string | null;
  unit?: string | null;
  unit_price: number;
  quantity: number;
  discount_pct?: number;
  tax_rate_pct?: number;
}

export interface ProposalItem extends ProposalItemInput { id: string; line_total: number; position: number; }

export interface ProposalSummary {
  id: string;
  proposal_number: string | null;
  title: string | null;
  status: string;
  grand_total: number;
  currency: string;
  created_at: string;
  pdf_path: string | null;
}

export interface ProposalDetail extends ProposalSummary {
  lead_id: string | null;
  cover_note: string | null;
  terms: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  valid_until: string | null;
  pdf_url: string | null;
  items: ProposalItem[];
}

export interface CreateProposalBody {
  title?: string;
  items: ProposalItemInput[];
  terms?: string;
  valid_until?: string | null;
}

export type ShareChannel = 'whatsapp' | 'email' | 'link';

export const proposalsApi = {
  create: (leadId: string, body: CreateProposalBody) =>
    api.post<Wrapped<ProposalDetail>>(`${BASE}/leads/${leadId}/proposals`, body),
  listForLead: (leadId: string) =>
    api.get<Wrapped<ProposalSummary[]>>(`${BASE}/leads/${leadId}/proposals`),
  get: (id: string) =>
    api.get<Wrapped<ProposalDetail>>(`${BASE}/proposals/${id}`),
  share: (id: string, body: { channel: ShareChannel; to?: string }) =>
    api.post<Wrapped<{ channel: string; sent: boolean; pdf_url: string | null }>>(`${BASE}/proposals/${id}/share`, body),
};

export default proposalsApi;

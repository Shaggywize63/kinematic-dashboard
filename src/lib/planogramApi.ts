import api from './api';
import type {
  Planogram,
  Compliance,
  Recognition,
  Capture,
  TrendPoint,
  StoreRanking,
  ChronicGap,
  SkuVisibility,
  RiskForecastRow,
  ExpectedSKU,
  PlanogramCompetitor,
  PlanogramOverview,
  CaptureListItem,
  CapturesListResponse,
  CaptureListParams,
  DetectionFeedbackBody,
} from '../types/planogram';

type Wrapped<T> = { success: boolean; data: T };

/** Build a `?a=b&c=d` query string from a params object, skipping
 *  undefined / null / '' so we never send empty filters. Booleans become
 *  `true`/`false`; numbers are stringified. */
function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

/** Adapt a raw /captures response into the pinned `{ total, captures }` shape.
 *  The current backend returns a bare `Capture[]`; the redesigned endpoint
 *  returns `{ total, captures }`. Normalize both so callers see one shape and
 *  the list populates against real data today. */
function normalizeCapturesResponse(raw: unknown): CapturesListResponse {
  const data = (raw as { data?: unknown })?.data ?? raw;
  // Already the new shape.
  if (data && typeof data === 'object' && Array.isArray((data as { captures?: unknown }).captures)) {
    const d = data as { total?: number; captures: CaptureListItem[] };
    return { total: d.total ?? d.captures.length, captures: d.captures };
  }
  // Legacy bare-array shape — map each joined Capture into a list item.
  if (Array.isArray(data)) {
    const captures = (data as Capture[]).map(captureToListItem);
    return { total: captures.length, captures };
  }
  return { total: 0, captures: [] };
}

/** Map a joined `Capture` row (legacy list shape) into a `CaptureListItem`.
 *  Fields the legacy endpoint doesn't return (city, presence, shelf-share,
 *  needs_review, recovered_count, competitor_present) stay undefined so the UI
 *  simply omits those signals until the richer endpoint ships. */
function captureToListItem(c: Capture): CaptureListItem {
  return {
    id: c.id,
    store_id: c.store_id ?? null,
    store_name: c.store?.name ?? null,
    category: c.planogram?.name ?? null,
    captured_at: c.captured_at,
    fe_name: c.fe?.name ?? null,
    score: c.compliance?.score ?? null,
  };
}

export interface ParsedPlanogramSku {
  sku_id: string;
  sku_name: string;
  shelf_index: number;
  facings: number;
  position?: number;
  weight?: number;
  category?: string | null;
  brand?: string | null;
  expected_price?: number | null;
}

export interface ParsedPlanogram {
  name_suggestion: string;
  category_suggestion: string | null;
  store_format_suggestion: string | null;
  layout: { shelves: Array<{ index: number; capacity?: number }> };
  expected_skus: ParsedPlanogramSku[];
  overall_confidence: number;
  model_version: string;
}

export interface PlanogramAssignment {
  id: string;
  planogram_id: string;
  store_id?: string | null;
  zone_id?: string | null;
  city_id?: string | null;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
}

export interface CreatePlanogramBody {
  name: string;
  category?: string;
  store_format?: string;
  client_id?: string;
  source_url?: string;
  layout?: {
    shelves: Array<{ index: number; capacity?: number }>;
    competitors?: PlanogramCompetitor[];
    category_definition?: string;
  };
  expected_skus: ExpectedSKU[];
}

/**
 * Thin wrapper around the api client for every /api/v1/planograms endpoint.
 * Co-located so dashboard pages get a single import surface.
 */
export const planogramApi = {
  list: () => api.get<Wrapped<Planogram[]>>('/api/v1/planograms'),
  get: (id: string) => api.get<Wrapped<Planogram>>(`/api/v1/planograms/${id}`),
  create: (body: CreatePlanogramBody) =>
    api.post<Wrapped<Planogram>>('/api/v1/planograms', body),
  update: (id: string, body: Partial<CreatePlanogramBody>) =>
    api.patch<Wrapped<Planogram>>(`/api/v1/planograms/${id}`, body),
  remove: (id: string) =>
    api.delete<Wrapped<{ success: true }>>(`/api/v1/planograms/${id}`),

  // Assignments
  listAssignments: (id: string) =>
    api.get<Wrapped<PlanogramAssignment[]>>(`/api/v1/planograms/${id}/assignments`),
  assign: (
    id: string,
    body: {
      store_id?: string;
      zone_id?: string;
      city_id?: string;
      valid_from?: string;
      valid_to?: string | null;
    },
  ) => api.post<Wrapped<PlanogramAssignment>>(`/api/v1/planograms/${id}/assignments`, body),
  unassign: (planogramId: string, assignmentId: string) =>
    api.delete<Wrapped<{ success: true }>>(
      `/api/v1/planograms/${planogramId}/assignments/${assignmentId}`,
    ),

  // AI: parse a brand planogram image into a structured layout
  parseFromImage: (body: { image_base64: string; image_media_type: string }) =>
    api.post<Wrapped<ParsedPlanogram>>('/api/v1/planograms/parse', body),

  // ── Redesigned module: Overview + Captures list ─────────────────────────
  // Mirrors getCapture's URL + auth/org headers (same api client, same base).

  /** Landing-page rollup for the module Overview. Degrades gracefully: the
   *  backend endpoint may not exist yet, so callers should catch + fall back. */
  getOverview: (params: { city?: string; period_days?: number } = {}) =>
    api.get<Wrapped<PlanogramOverview>>(
      `/api/v1/planograms/overview${buildQuery({ city: params.city, period_days: params.period_days })}`,
    ),

  // Captures — filterable list. Returns the normalized `{ total, captures }`
  // shape regardless of which backend version answers.
  listCaptures: (params: CaptureListParams = {}): Promise<Wrapped<CapturesListResponse>> => {
    const query = buildQuery({
      city: params.city,
      store_id: params.store_id,
      needs_review: params.needs_review,
      min_score: params.min_score,
      max_score: params.max_score,
      limit: params.limit,
      offset: params.offset,
    });
    return api
      .get<unknown>(`/api/v1/planograms/captures${query}`)
      .then((raw) => ({ success: true, data: normalizeCapturesResponse(raw) }));
  },
  getCapture: (id: string) =>
    api.get<Wrapped<{ capture: Capture; recognition: Recognition; compliance: Compliance }>>(
      `/api/v1/planograms/captures/${id}`,
    ),

  /** Re-run the AI recognition + compliance scoring on a capture's stored image
   *  and upsert the fresh rows — used to bring older captures up to the current
   *  (v2) analysis. Returns the same `{ capture, recognition, compliance }` shape
   *  as getCapture so a caller can swap its state straight from the response.
   *  Mirrors getCapture's URL + auth/org headers (same api client, same base). */
  reprocessCapture: (id: string) =>
    api.post<Wrapped<{ capture: Capture; recognition: Recognition; compliance: Compliance }>>(
      `/api/v1/planograms/captures/${id}/reprocess`,
      {},
    ),

  /** Detection-level feedback for the review/feedback loop (wired now for the
   *  next phase's capture-detail redesign). Body: {sku_id?, bbox?, reason,
   *  correct_sku_id?, note?}. */
  submitDetectionFeedback: (captureId: string, body: DetectionFeedbackBody) =>
    api.post<Wrapped<{ id: string }>>(
      `/api/v1/planograms/captures/${captureId}/detection-feedback`,
      body,
    ),

  submitFeedback: (
    captureId: string,
    body: {
      corrections: Array<{
        sku_id: string | null;
        action: 'add' | 'remove' | 'relabel';
        bbox?: number[];
        note?: string;
      }>;
      notes?: string;
    },
  ) => api.post<Wrapped<{ id: string }>>(`/api/v1/planograms/captures/${captureId}/feedback`, body),

  // Turn a correct shelf detection into a new reference pack-shot for the SKU:
  // the backend crops that bbox from the capture image and saves it as an
  // additional reference so future scans recognise this product better.
  // Mirrors getCapture's URL + auth/org headers (same api client, same base).
  confirmDetection: (captureId: string, body: { sku_id: string; bbox: number[] }) =>
    api.post<Wrapped<{ ref_image_url: string }>>(
      `/api/v1/planograms/captures/${captureId}/confirm-detection`,
      body,
    ),

  // Analytics
  trend: (days = 30) =>
    api.get<Wrapped<TrendPoint[]>>(`/api/v1/planograms/analytics/trend?days=${days}`),
  storeRanking: (days = 7) =>
    api.get<Wrapped<StoreRanking[]>>(`/api/v1/planograms/analytics/store-ranking?days=${days}`),
  chronicGaps: () =>
    api.get<Wrapped<ChronicGap[]>>('/api/v1/planograms/analytics/chronic-gaps'),
  skuVisibility: (days = 14) =>
    api.get<Wrapped<SkuVisibility[]>>(`/api/v1/planograms/analytics/sku-visibility?days=${days}`),
  riskForecast: () =>
    api.get<Wrapped<RiskForecastRow[]>>('/api/v1/planograms/analytics/risk-forecast'),
};

export default planogramApi;

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
} from '../types/planogram';

type Wrapped<T> = { success: boolean; data: T };

export interface ParsedPlanogramSku {
  sku_id: string;
  sku_name: string;
  shelf_index: number;
  facings: number;
  position?: number;
  weight?: number;
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
  layout?: { shelves: Array<{ index: number; capacity?: number }> };
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

  // Captures
  getCapture: (id: string) =>
    api.get<Wrapped<{ capture: Capture; recognition: Recognition; compliance: Compliance }>>(
      `/api/v1/planograms/captures/${id}`,
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

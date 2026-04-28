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
} from '../types/planogram';

type Wrapped<T> = { success: boolean; data: T };

/**
 * Thin wrapper around the api client for every /api/v1/planograms endpoint.
 * Co-located so dashboard pages get a single import surface.
 */
export const planogramApi = {
  list: () => api.get<Wrapped<Planogram[]>>('/api/v1/planograms'),
  get: (id: string) => api.get<Wrapped<Planogram>>(`/api/v1/planograms/${id}`),
  create: (body: Partial<Planogram>) =>
    api.post<Wrapped<Planogram>>('/api/v1/planograms', body),
  update: (id: string, body: Partial<Planogram>) =>
    api.patch<Wrapped<Planogram>>(`/api/v1/planograms/${id}`, body),
  remove: (id: string) =>
    api.delete<Wrapped<{ success: true }>>(`/api/v1/planograms/${id}`),
  assign: (
    id: string,
    body: { store_id?: string; zone_id?: string; city_id?: string; valid_from?: string; valid_to?: string | null },
  ) => api.post<Wrapped<unknown>>(`/api/v1/planograms/${id}/assignments`, body),

  getCapture: (id: string) =>
    api.get<Wrapped<{ capture: Capture; recognition: Recognition; compliance: Compliance }>>(
      `/api/v1/planograms/captures/${id}`,
    ),

  submitFeedback: (
    captureId: string,
    body: { corrections: Array<{ sku_id: string | null; action: 'add' | 'remove' | 'relabel'; bbox?: number[]; note?: string }>; notes?: string },
  ) => api.post<Wrapped<{ id: string }>>(`/api/v1/planograms/captures/${captureId}/feedback`, body),

  // Analytics
  trend: (days = 30) => api.get<Wrapped<TrendPoint[]>>(`/api/v1/planograms/analytics/trend?days=${days}`),
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

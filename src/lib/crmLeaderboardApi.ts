/**
 * Thin client for GET /api/v1/crm/leaderboard.
 *
 * Kept out of crmApi.ts so the leaderboard's distinct response shape
 * (period + rows, not a flat array) and its (metric/period/from/to) param
 * tuple don't have to thread through the generic `crud<T>` builder.
 */
import api from './api';

export type LeaderboardMetric = 'count' | 'revenue';
export type LeaderboardPeriod = 'mtd' | 'qtd' | 'ytd' | 'custom';

export interface LeaderboardRow {
  user_id: string | null;
  full_name: string;
  avatar_url: string | null;
  email: string | null;
  count: number;
  revenue: number;
  avg_deal_size: number;
  win_rate: number; // 0..1
}

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  period: { type: LeaderboardPeriod; from: string; to: string };
  rows: LeaderboardRow[];
}

type Wrapped<T> = { success: boolean; data: T };

export interface LeaderboardParams {
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  from?: string; // YYYY-MM-DD, required when period='custom'
  to?: string;
}

function qs(params: LeaderboardParams): string {
  const entries: Array<[string, string]> = [
    ['metric', params.metric],
    ['period', params.period],
  ];
  if (params.from) entries.push(['from', params.from]);
  if (params.to) entries.push(['to', params.to]);
  return '?' + new URLSearchParams(entries).toString();
}

export const crmLeaderboard = {
  get: (params: LeaderboardParams) =>
    api.get<Wrapped<LeaderboardResponse>>(`/api/v1/crm/leaderboard${qs(params)}`),
};

export default crmLeaderboard;

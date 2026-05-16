/**
 * Synthetic leaderboard payload for the demo user. Five reps, plausible
 * counts and revenue with a steep drop-off so the medal coloring renders.
 *
 * Imported by demoMocks.ts — kept in a separate file because demoMocks.ts
 * is already very long; this lets us amend the leaderboard mock without
 * touching the rest of that file.
 */
export type DemoLeaderboardMetric = 'count' | 'revenue';
export type DemoLeaderboardPeriod = 'mtd' | 'qtd' | 'ytd' | 'custom';

const REPS = [
  { name: 'Arjun Sharma',  email: 'arjun@demo.kinematic.com',  count: 12, revenue: 28_400_000, avg_deal_size: 2_366_666, win_rate: 0.71 },
  { name: 'Priya Patel',   email: 'priya@demo.kinematic.com',  count: 10, revenue: 22_600_000, avg_deal_size: 2_260_000, win_rate: 0.66 },
  { name: 'Rahul Verma',   email: 'rahul@demo.kinematic.com',  count: 7,  revenue: 14_200_000, avg_deal_size: 2_028_571, win_rate: 0.58 },
  { name: 'Sneha Rao',     email: 'sneha@demo.kinematic.com',  count: 5,  revenue: 6_750_000,  avg_deal_size: 1_350_000, win_rate: 0.50 },
  { name: 'Amit Singh',    email: 'amit@demo.kinematic.com',   count: 3,  revenue: 4_300_000,  avg_deal_size: 1_433_333, win_rate: 0.43 },
];

// Compute MTD bounds at import time — cheap, and gives the UI plausible
// dates so the period label doesn't look stale.
function mtdBounds(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export function demoLeaderboard(params: URLSearchParams) {
  const metric: DemoLeaderboardMetric = (params.get('metric') === 'revenue' ? 'revenue' : 'count');
  const periodParam = params.get('period');
  const period: DemoLeaderboardPeriod = (['mtd', 'qtd', 'ytd', 'custom'] as const).find(p => p === periodParam) ?? 'mtd';
  const from = params.get('from') || mtdBounds().from;
  const to = params.get('to') || mtdBounds().to;

  // Sort by chosen metric; tiebreak by the other so ordering is stable.
  const rows = [...REPS].sort((a, b) => {
    if (metric === 'revenue') return (b.revenue - a.revenue) || (b.count - a.count);
    return (b.count - a.count) || (b.revenue - a.revenue);
  }).map((r, i) => ({
    user_id: `demo-rep-${i + 1}`,
    full_name: r.name,
    avatar_url: null as string | null,
    email: r.email,
    count: r.count,
    revenue: r.revenue,
    avg_deal_size: r.avg_deal_size,
    win_rate: r.win_rate,
  }));

  return {
    success: true,
    data: {
      metric,
      period: { type: period, from, to },
      rows,
    },
  };
}

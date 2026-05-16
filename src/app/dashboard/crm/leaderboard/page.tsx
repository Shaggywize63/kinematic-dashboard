'use client';
/**
 * Standalone Sales Leaderboard page.
 *
 * Kept as a fallback for the deeper top-50 view. The compact top-10 lives
 * on the CRM Overview (see `<SalesLeaderboard compact />` on
 * /dashboard/crm/dashboard). The sub-nav tab was removed; this page is
 * reachable via the "See full leaderboard →" link from the overview.
 *
 * All the render/control logic lives in the SalesLeaderboard component so
 * the two surfaces stay in sync.
 */
import SalesLeaderboard from '../../../../components/crm/SalesLeaderboard';

export default function LeaderboardPage() {
  return <SalesLeaderboard />;
}

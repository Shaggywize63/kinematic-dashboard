// FFM Analytics is now merged into /dashboard/analytics — redirect any
// stale bookmarks instead of 404ing.
import { redirect } from 'next/navigation';

export default function FfmAnalyticsPage() {
  redirect('/dashboard/analytics');
}

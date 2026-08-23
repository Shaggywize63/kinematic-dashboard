import { redirect } from 'next/navigation';

// Cadences & Drips moved into the unified Automations hub (Sequences tab).
// Keep this route as a permanent redirect so old bookmarks / deep links land
// in the right place.
export default function CadencesRedirect() {
  redirect('/dashboard/crm/settings/automations?tab=sequences');
}

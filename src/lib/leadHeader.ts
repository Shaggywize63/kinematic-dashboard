import type { Lead } from '../types/crm';

/**
 * Connected-B2B (Spark & Ray) structured leads carry a backend-computed name —
 * `Account · Plant · Department — Requirement` — shared by the lead header and the
 * list row. Everything else (B2C, other tenants) keeps its person-named title.
 */
export function isStructuredLead(l: Pick<Lead, 'display_name' | 'is_b2c'>): boolean {
  return !l.is_b2c && !!(l.display_name && l.display_name.trim());
}

const clean = (s: unknown) => String(s ?? '').trim();

/**
 * The person on a structured lead, shown beside (never inside) the name: the primary
 * (nodal) contact when the API supplied it, else the lead's own first/last name — unless
 * that is just the company the backend fell back to when no person was captured.
 */
export function leadPersonName(
  l: Pick<Lead, 'first_name' | 'last_name' | 'company' | 'primary_contact'>,
): string | null {
  const primary = clean(l.primary_contact?.name);
  if (primary) return primary;
  const name = [clean(l.first_name), clean(l.last_name)].filter(Boolean).join(' ');
  if (!name) return null;
  if (name.toLowerCase() === clean(l.company).toLowerCase()) return null;
  return name;
}

/** The person's designation for the header chip (primary contact's, else the lead's title). */
export function leadPersonTitle(l: Pick<Lead, 'title' | 'primary_contact'>): string | null {
  return clean(l.primary_contact?.title) || clean(l.title) || null;
}

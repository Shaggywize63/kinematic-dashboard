import { isB2bClientActive } from './b2bClient';
import type { Lead } from '../types/crm';

/** The first requirement line (bullet stripped), truncated for a one-line picker label. */
function firstRequirement(req?: string | null): string {
  if (!req) return '';
  const line = req.split('\n')[0].replace(/^•\s*/, '').trim();
  if (!line) return '';
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
}

/**
 * Label for a lead in an entity picker — e.g. choosing the lead an activity is
 * logged against. On the connected-B2B (Spark & Ray) workspace the **customer's
 * name** is shown **with their requirement**, because one person can have several
 * leads/requirements and the name alone doesn't tell them apart. A structured
 * Spark lead carries no first/last on the row (the form links an existing
 * contact), so the customer name comes from the stamped `contact_name` (leads
 * list) or `primary_contact.name` (single lead GET); the account is the last
 * resort. Every other tenant keeps the previous "Name · phone".
 */
export function leadOptionLabel(
  x: Pick<Lead, 'first_name' | 'last_name' | 'email' | 'phone' | 'requirement' | 'contact_name' | 'company' | 'account_name' | 'primary_contact'>,
): string {
  const own = [x.first_name, x.last_name].filter(Boolean).join(' ').trim();
  // The customer: the lead's own name, else the stamped nodal-contact name.
  const customer = own || x.contact_name?.trim() || x.primary_contact?.name?.trim() || '';
  if (isB2bClientActive()) {
    const req = firstRequirement(x.requirement);
    // The company the lead belongs to — its linked account (stamped) is authoritative; the
    // free-text company is the fallback. Leading with the company lets the rep see WHICH
    // customer a lead is for at a glance, since one person can appear under several companies.
    const company = x.account_name?.trim() || x.company?.trim() || '';
    const person = customer;
    // "Company · Person" so both read on one line; either alone when the other is missing.
    const head = [company, person].filter(Boolean).join(' · ') || x.email || 'Lead';
    return req ? `${head} — ${req}` : head;
  }
  const name = own || x.email || 'Lead';
  return x.phone ? `${name} · ${x.phone}` : name;
}

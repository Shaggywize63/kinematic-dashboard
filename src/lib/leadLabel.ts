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
 * logged against. On the connected-B2B (Spark & Ray) workspace the person's name
 * is shown **with their requirement**, because one person can have several
 * leads/requirements and the name alone doesn't tell them apart. Every other
 * tenant keeps the previous "Name · phone".
 */
export function leadOptionLabel(
  x: Pick<Lead, 'first_name' | 'last_name' | 'email' | 'phone' | 'requirement'>,
): string {
  const name = [x.first_name, x.last_name].filter(Boolean).join(' ') || x.email || 'Lead';
  if (isB2bClientActive()) {
    const req = firstRequirement(x.requirement);
    if (req) return `${name} — ${req}`;
  }
  return x.phone ? `${name} · ${x.phone}` : name;
}

/**
 * Lead-source ordering for the Source dropdown.
 *
 * Business ask (all tenants): the sources named exactly "TATA Steel" and then
 * "Others" should sit at the very bottom of the list, with every other source
 * kept in its existing (server) order. This is a stable sort — only those two
 * named rows move, and "TATA Steel" stays ahead of "Others".
 *
 * Matching is case-insensitive and tolerant of surrounding whitespace so an
 * admin-entered " tata steel " still lands at the bottom.
 */
export function orderLeadSources<T extends { name?: string | null }>(sources: T[]): T[] {
  const rank = (name?: string | null): number => {
    const n = (name || '').trim().toLowerCase();
    if (n === 'tata steel') return 1;
    if (n === 'others') return 2;
    return 0;
  };
  return sources
    .map((s, i) => ({ s, i, r: rank(s.name) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.s);
}

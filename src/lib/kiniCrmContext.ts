import type { KiniContext } from '../types/crm';

export function isCrmRoute(pathname: string): boolean {
  return pathname.startsWith('/dashboard/crm');
}

export function inferEntity(pathname: string): { type: string; id?: string } | null {
  // /dashboard/crm/leads/[id] -> lead
  const m = pathname.match(/\/dashboard\/crm\/(leads|contacts|accounts|deals)\/([^/]+)/);
  if (m) {
    const t = m[1].replace(/s$/, '');
    return { type: t, id: m[2] === 'new' || m[2] === 'import' ? undefined : m[2] };
  }
  const list = pathname.match(/\/dashboard\/crm\/(\w+)/);
  if (list) return { type: list[1] };
  return null;
}

/**
 * Maps a CRM pathname to a coarse "screen" name for the v2 context block.
 * A specific record open → `<entity>_detail`; otherwise the list/section.
 */
export function inferScreen(pathname: string): string | undefined {
  const entity = inferEntity(pathname);
  if (!entity) return undefined;
  if (entity.id) return `${entity.type}_detail`;
  if (/\/(new|import)(\/|$)/.test(pathname)) return `${entity.type}_create`;
  return `${entity.type}_list`;
}

export function buildKiniContext(
  pathname: string,
  orgId?: string | null,
  city?: string | null,
): KiniContext {
  const entity = inferEntity(pathname);
  return {
    // v1 fields (legacy /crm/ai/chat)
    module: 'crm',
    route: pathname,
    entity,
    org_id: orgId || null,
    // v2 fields (/kini/v2/chat buildContextBlock). record_type/record_id are
    // only set when a specific record is open, so KINI treats it as context —
    // not a fence — and still answers about other modules when asked.
    screen: inferScreen(pathname),
    record_type: entity?.id ? entity.type : undefined,
    record_id: entity?.id,
    city: city || undefined,
  };
}

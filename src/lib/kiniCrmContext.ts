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

export function buildKiniContext(pathname: string, orgId?: string | null): KiniContext {
  return {
    module: 'crm',
    route: pathname,
    entity: inferEntity(pathname),
    org_id: orgId || null,
  };
}

// Multi-project routing (client side).
//
// The dashboard lives on a single URL but talks to more than one Supabase
// project (one per customer). A user's project is resolved from their email at
// login (backend GET /api/v1/auth/project-for-email), stored locally, and sent
// back as the X-Kinematic-Project header on every request (see lib/api.ts) so
// the backend authenticates + queries the right project. The browser Supabase
// client (realtime only) also uses the matching URL/anon key.
//
// DEFAULT_PROJECT preserves today's single-project behaviour: an unknown or
// missing key resolves here, and the header is omitted, so existing users are
// unaffected.

export const PROJECT_KEY_STORAGE = 'kinematic_supabase_project';
export const DEFAULT_PROJECT = 'default';

// Known project keys must match the backend registry (lib/projects.ts there).
const KNOWN_PROJECTS = new Set<string>([DEFAULT_PROJECT, 'kinematic']);

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
}

const CONFIGS: Record<string, SupabaseClientConfig> = {
  [DEFAULT_PROJECT]: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  },
  kinematic: {
    url: process.env.NEXT_PUBLIC_KINEMATIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_KINEMATIC_SUPABASE_ANON_KEY || '',
  },
};

export function isKnownProject(key: string | null | undefined): key is string {
  return !!key && KNOWN_PROJECTS.has(key);
}

/** The project the current session belongs to (default outside the browser). */
export function getStoredProjectKey(): string {
  if (typeof window === 'undefined') return DEFAULT_PROJECT;
  try {
    const k = window.localStorage.getItem(PROJECT_KEY_STORAGE);
    return isKnownProject(k) ? k : DEFAULT_PROJECT;
  } catch {
    return DEFAULT_PROJECT;
  }
}

export function setStoredProjectKey(key: string | null | undefined) {
  if (typeof window === 'undefined') return;
  try {
    if (isKnownProject(key) && key !== DEFAULT_PROJECT) {
      window.localStorage.setItem(PROJECT_KEY_STORAGE, key);
    } else {
      window.localStorage.removeItem(PROJECT_KEY_STORAGE);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Supabase URL + anon key for the current session's project, used by the
 * browser realtime client. Falls back to the default project when the selected
 * project has no client config in env (realtime degrades to the default; the
 * data path still routes correctly via the X-Kinematic-Project header).
 */
export function supabaseConfigForCurrentProject(): SupabaseClientConfig {
  const cfg = CONFIGS[getStoredProjectKey()];
  if (cfg && cfg.url && cfg.anonKey) return cfg;
  return CONFIGS[DEFAULT_PROJECT];
}

/**
 * Ask the backend which project an email belongs to. Pure config lookup on the
 * backend (no auth). Always resolves to a known key; defaults on any failure so
 * login never blocks on this.
 */
export async function resolveProjectForEmail(apiBaseUrl: string, email: string): Promise<string> {
  try {
    const res = await fetch(
      `${apiBaseUrl}/api/v1/auth/project-for-email?email=${encodeURIComponent(email)}`,
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (!res.ok) return DEFAULT_PROJECT;
    const json = await res.json();
    const project = (json?.data?.project ?? json?.project) as string | undefined;
    return isKnownProject(project) ? project : DEFAULT_PROJECT;
  } catch {
    return DEFAULT_PROJECT;
  }
}

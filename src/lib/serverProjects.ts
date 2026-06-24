// Multi-project routing (server side — Next API route handlers).
//
// Route handlers that proxy directly to Supabase (edge functions / REST) must
// target the SAME project the caller's session belongs to. The browser sends
// the project key in the X-Kinematic-Project header (see lib/api.ts); these
// handlers read it and pick the matching URL / anon key / service-role key.
// An unknown or missing header → default project (current single-project
// behaviour). Keys come from env only — no project refs/keys are hardcoded.

export const DEFAULT_PROJECT = 'default';
const KNOWN_PROJECTS = new Set<string>([DEFAULT_PROJECT, 'kinematic']);

export interface ServerSupabaseConfig {
  url: string;
  anonKey: string;
  serviceKey: string;
}

const CONFIGS: Record<string, ServerSupabaseConfig> = {
  [DEFAULT_PROJECT]: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  kinematic: {
    url: process.env.NEXT_PUBLIC_KINEMATIC_SUPABASE_URL || '',
    anonKey: process.env.NEXT_PUBLIC_KINEMATIC_SUPABASE_ANON_KEY || '',
    serviceKey: process.env.KINEMATIC_SUPABASE_SERVICE_ROLE_KEY || '',
  },
};

export function projectFromHeaders(headers: Headers): string {
  const key = (headers.get('X-Kinematic-Project') || '').trim().toLowerCase();
  return KNOWN_PROJECTS.has(key) ? key : DEFAULT_PROJECT;
}

export function serverSupabaseConfig(projectKey: string): ServerSupabaseConfig {
  const cfg = CONFIGS[projectKey];
  // Fall back to the default project if the requested one isn't configured.
  if (cfg && cfg.url) return cfg;
  return CONFIGS[DEFAULT_PROJECT];
}

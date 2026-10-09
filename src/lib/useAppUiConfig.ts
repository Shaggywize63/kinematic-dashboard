'use client';
// The signed-in client's app-UI customization (`app_ui_config`, served on /auth/me — the same config the
// mobile apps read; see appCustomization.ts). Null when the client has none, in which case every item is visible.

import { useEffect, useState } from 'react';
import api from './api';
import { getStoredUser } from './auth';
import type { AppCustomization } from './appCustomization';

const pick = (u: unknown): AppCustomization | null => {
  const c = (u as { app_ui_config?: unknown } | null | undefined)?.app_ui_config;
  return c && typeof c === 'object' ? (c as AppCustomization) : null;
};

export function useAppUiConfig(): AppCustomization | null {
  const [cfg, setCfg] = useState<AppCustomization | null>(null);
  useEffect(() => {
    // The session stored at login / by the dashboard shell gives an instant answer; /auth/me (cached and
    // shared with the shell's own call) confirms it, so an admin's change shows up without signing out.
    setCfg(pick(getStoredUser()));
    let off = false;
    api.get<unknown>('/api/v1/auth/me')
      .then((r) => { if (!off) setCfg(pick((r as { data?: unknown } | null)?.data ?? r)); })
      .catch(() => undefined);
    return () => { off = true; };
  }, []);
  return cfg;
}

'use client';
// Who may choose or change a lead's owner.
//
// Opt-in per client by DATA: `crm_settings.config.lead_form.owner_assignment === 'admin_only'`
// (parsed by extractLeadForm → `ownerAdminOnly`). Without it nothing here changes anything — every
// owner control keeps behaving exactly as it did (including the existing data_scope='own' rule on the
// create / edit / detail screens).
//
// With it, only an admin may set an owner. The server enforces the same rule (403 OWNER_ASSIGN_FORBIDDEN
// "Only an admin can assign leads"; a non-admin's new lead is simply owned by themselves), so hiding the
// controls here is the convenience layer — and the page must never *send* an owner change on a non-admin's
// behalf either. The current owner stays on screen as plain text: it is information, not a control.
//
// "Admin" = the roles the backend treats as admin for this, but not a person whose org-role data scope is
// 'own' (a field rep that sits on an admin-tier preset such as sub_admin). The role and scope come from the
// same /auth/me payload the rest of the dashboard reads (stored session first, then the fresh copy).
//
// When the setting cannot be READ (the request fails or is blocked, or the reply has no body to read), "no
// restriction" would be the wrong guess for a client that did turn it on: every owner control would reappear
// for a non-admin. So a failed read falls back, in order, to
//   1. the value this user last read successfully for this client (localStorage, one key per user + client,
//      wiped on sign-out — see clearSession), then
//   2. the restriction ON.
// An admin keeps every control either way, and a successful read behaves exactly as it always did.

import { useEffect, useState } from 'react';
import api, { getRequestClientId } from './api';
import { getStoredUser, OWNER_ASSIGN_CACHE_PREFIX } from './auth';
import { crmSettings } from './crmApi';
import { extractLeadForm } from './crmLeadForm';

/** Roles the backend counts as admin when it decides who may assign lead owners. */
export const OWNER_ADMIN_ROLES = ['admin', 'super_admin', 'main_admin', 'org_admin', 'sub_admin', 'client'] as const;

/** The slice of a user (login payload, /auth/me or the stored session) this decision reads. */
export interface OwnerAccessUser {
  role?: string | null;
  /** Flat copy of the org-role data scope, as login and /auth/me return it. */
  org_role_data_scope?: string | null;
  /** Joined org role, as /auth/me returns it. */
  org_role?: { data_scope?: string | null } | null;
}

/** Is this user an admin for lead-owner assignment? (Used only when the client turned the restriction on.) */
export function isOwnerAdmin(user: OwnerAccessUser | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.role ?? '').toLowerCase().trim().replace(/-/g, '_');
  if (!(OWNER_ADMIN_ROLES as readonly string[]).includes(role)) return false;
  const scope = user.org_role_data_scope ?? user.org_role?.data_scope ?? null;
  return scope !== 'own';
}

/**
 * localStorage key of the last-known setting for the signed-in user within the client scope requests are
 * currently made in. Null when nobody is signed in (nothing to key by, so nothing is read or written).
 */
function lastKnownKey(): string | null {
  const id = getStoredUser()?.id;
  return id ? `${OWNER_ASSIGN_CACHE_PREFIX}${id}:${getRequestClientId() ?? 'org'}` : null;
}

/** The setting this user last read successfully for this client: true / false, or null when never read. */
function readLastKnown(key: string | null): boolean | null {
  if (!key) return null;
  try {
    const v = window.localStorage.getItem(key);
    return v === '1' ? true : v === '0' ? false : null;
  } catch { return null; }
}

function writeLastKnown(key: string | null, adminOnly: boolean): void {
  // Only for the user and client scope the read was made for: if either changed while it was in flight (sign-out,
  // another person signing in, the client picker), the answer belongs to someone else's key.
  if (!key || lastKnownKey() !== key) return;
  try { window.localStorage.setItem(key, adminOnly ? '1' : '0'); } catch { /* storage blocked / full: just not remembered */ }
}

export interface LeadOwnerAccess {
  /**
   * The client's setting and the viewer's identity are both known, so an owner control can be shown or
   * withheld without a flash. Admin-gated rows wait for this (same rule as the field overrides).
   */
  ready: boolean;
  /**
   * The client turned on `lead_form.owner_assignment: 'admin_only'` — or the setting could not be read and
   * the restriction is assumed (see the top of this file).
   */
  adminOnly: boolean;
  /**
   * May this viewer choose / change a lead's owner? Always true once ready when the client has no
   * restriction; with it, true only for an admin. False until `ready`.
   */
  canAssign: boolean;
}

/**
 * Reads the client's owner-assignment setting and the viewer's identity. Both reads are the ones the
 * dashboard already makes (`GET /crm/settings`, `GET /auth/me`), so they share the API client's cache and
 * in-flight de-duplication — no extra requests on screens that load them anyway.
 */
export function useLeadOwnerAccess(): LeadOwnerAccess {
  const [adminOnly, setAdminOnly] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [user, setUser] = useState<OwnerAccessUser | null>(null);
  const [userFresh, setUserFresh] = useState(false);

  useEffect(() => {
    let off = false;
    const key = lastKnownKey();
    crmSettings.get()
      // A reply with no body at all throws here (nothing to read `.data` from) and counts as a failed read, like
      // a rejected request. Any reply that has a body is a read: no flag in it means no restriction, as ever.
      .then((r) => extractLeadForm(r.data).ownerAdminOnly)
      .then(
        (flag) => {
          writeLastKnown(key, flag);
          if (!off) setAdminOnly(flag);
        },
        // Could not read the setting: last-known for this user + client, else assume the restriction is on.
        // (Being wrong on the cautious side hides a control the server would have allowed; the other way round
        // shows one it will refuse. The server enforces either way.)
        () => { if (!off) setAdminOnly(readLastKnown(key) ?? true); },
      )
      .finally(() => { if (!off) setSettingsReady(true); });

    // The stored session answers at once; /auth/me confirms it (a stored profile can predate org_role_data_scope).
    setUser(getStoredUser() as OwnerAccessUser | null);
    api.get<{ data?: OwnerAccessUser } & OwnerAccessUser>('/api/v1/auth/me')
      .then((r) => { if (!off) setUser(((r as { data?: OwnerAccessUser })?.data ?? r) as OwnerAccessUser); })
      .catch(() => { /* keep the stored session */ })
      .finally(() => { if (!off) setUserFresh(true); });
    return () => { off = true; };
  }, []);

  // With a restriction on, an admin is only recognised from the fresh profile: the stored one may lack the
  // data scope, and a restricted control must never flash up for someone who is not allowed it.
  const ready = settingsReady && (!adminOnly || userFresh);
  const canAssign = ready && (!adminOnly || isOwnerAdmin(user));
  return { ready, adminOnly, canAssign };
}

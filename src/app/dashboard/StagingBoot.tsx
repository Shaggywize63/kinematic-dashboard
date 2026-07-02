'use client';
import { useEffect } from 'react';
import { getActingAs, setActingAs } from '../../lib/api';

// Dedicated staging deployment support. When this build is deployed as the
// staging site, set the env var NEXT_PUBLIC_STAGING_ORG_ID (and optionally
// NEXT_PUBLIC_STAGING_NAME) to the staging org's id. On load, the app then
// auto-scopes the (super-admin) session into that staging org via the existing
// acting-as/impersonation path — so the staging URL is "always in staging".
// The production deployment leaves the env unset and behaves normally.
let booted = false;

export default function StagingBoot() {
  useEffect(() => {
    if (booted) return;
    const org = process.env.NEXT_PUBLIC_STAGING_ORG_ID;
    if (!org) return;            // production build: no-op
    booted = true;
    // Already scoped (to staging or a client) → don't override.
    if (getActingAs()?.org_id) return;
    setActingAs({ org_id: org, name: process.env.NEXT_PUBLIC_STAGING_NAME || 'Staging' });
    // Re-scope every request/refetch to the staging org.
    window.location.reload();
  }, []);
  return null;
}

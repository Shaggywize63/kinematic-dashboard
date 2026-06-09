// CRM feature gates keyed off the caller's org. Used to roll out new
// relationship UIs to Horizon (sagar@horizontechstudio.com's org) without
// disturbing Tata Tiscon's existing flow.

export const HORIZON_ORG_ID = '00000000-0000-0000-0000-000000000001';

export function isHorizonOrg(orgId: string | null | undefined): boolean {
  return orgId === HORIZON_ORG_ID;
}

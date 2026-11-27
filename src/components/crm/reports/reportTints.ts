/**
 * One tint per report tile / chart heading / avatar in the New design (Aurora). `tintFor(key)` is a stable pick from a
 * fixed palette, so the same label always gets the same colour across renders and reloads. The values are only ever
 * used as the `--tint` of a glass chip / tile (aurora.css `.km-lz`, aurora-reports.css `.km-kpi` …), which derives its
 * wash, edge and glow from it — so they stay legible in both themes.
 */
export const REPORT_TINTS = ['#3E9EFF', '#10B981', '#F59E0B', '#A855F7', '#06B6D4', '#EC4899', '#14B8A6', '#F43F5E'] as const;

export function tintFor(key: string): string {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return REPORT_TINTS[h % REPORT_TINTS.length];
}

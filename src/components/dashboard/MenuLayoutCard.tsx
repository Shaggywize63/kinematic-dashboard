'use client';
import { useMemo, type ReactNode } from 'react';
import { LayoutGrid, List, PanelLeft } from 'lucide-react';
import { Card, Eyebrow, Segmented, T } from '../ui';
import { getStoredUser } from '../../lib/auth';
import { useNavPrefs, DEFAULT_NAV_LAYOUT, type NavLayout } from '../../lib/navPrefs';

/**
 * Settings control that lets each user pick how the left navigation menu is
 * laid out. The choice is persisted in per-user NavPrefs (localStorage); the
 * dashboard shell subscribes to the same prefs, so a change here updates the
 * live sidebar immediately (no reload) via navPrefs' same-tab sync event.
 *
 * This lives in Settings (not only the sidebar's "Customise menu") on purpose:
 * the Icon-rail layout hides the sidebar's search + customise row, so Settings
 * is the layout's always-reachable home (its own icon survives in the rail).
 */
const OPTIONS: { value: NavLayout; label: string; icon: ReactNode; blurb: string }[] = [
  { value: 'workspace', label: 'Workspace', icon: <LayoutGrid size={14} strokeWidth={1.8} />, blurb: 'A switcher scopes the menu to one area at a time — tidiest for large accounts.' },
  { value: 'classic', label: 'Full list', icon: <List size={14} strokeWidth={1.8} />, blurb: 'Every section expanded at once, with labels — the traditional full sidebar.' },
  { value: 'rail', label: 'Icon rail', icon: <PanelLeft size={14} strokeWidth={1.8} />, blurb: 'A narrow icon-only rail of every page — most screen space for your work.' },
];

export default function MenuLayoutCard() {
  // Resolved once on mount — the signed-in user id keys the per-user prefs.
  const userId = useMemo(() => getStoredUser()?.id ?? null, []);
  const { prefs, save } = useNavPrefs(userId);
  const layout = prefs.layout ?? DEFAULT_NAV_LAYOUT;
  const current = OPTIONS.find((o) => o.value === layout) ?? OPTIONS[0];

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Eyebrow>Menu layout</Eyebrow>
          <div style={{ fontSize: 13, color: T.dim }}>How the left navigation is arranged. Saved just for you on this browser.</div>
        </div>
        <Segmented
          value={layout}
          onChange={(v) => save({ ...prefs, layout: v })}
          options={OPTIONS.map((o) => ({
            value: o.value,
            label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{o.icon}{o.label}</span>,
          }))}
        />
      </div>
      <div style={{ fontSize: 12.5, color: T.mute }}>{current.blurb}</div>
    </Card>
  );
}

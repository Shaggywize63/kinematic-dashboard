'use client';
import React from 'react';
import { APP_CUSTOMIZATION_SECTIONS, isItemVisible, type AppCustomization, type AppItem } from '../../lib/appCustomization';

// Per-client "App Customization" panel for the Client Management editor.
// Renders one toggle per customizable menu / bottom-tab / CRM-More item.
// A toggle turned OFF force-hides that item in the mobile apps for this client;
// ON (default) defers to the app's built-in gate. Persists as `app_ui` on the
// client save (clients.settings.app_ui → /auth/me `app_ui_config`).

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const sectionCard: React.CSSProperties = {
  background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12,
};
const sectionHead: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
};
const grid: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 };
const linkBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', color: 'var(--textSec)', cursor: 'pointer',
  fontSize: 11, fontWeight: 600, textDecoration: 'underline', padding: 0,
};

function Chip({ item, on, onToggle }: { item: AppItem; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={on ? 'Visible — click to hide' : 'Hidden — click to show'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
        background: on ? 'color-mix(in srgb, var(--primary) 12%, transparent)' : 'var(--s2)',
        color: on ? 'var(--text)' : 'var(--textTert)',
        fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
        background: on ? 'var(--primary)' : 'transparent',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>}
      </span>
      <span style={{ textDecoration: on ? 'none' : 'line-through' }}>{item.label}</span>
    </button>
  );
}

export default function AppCustomizationPanel({
  value,
  onChange,
}: {
  value: AppCustomization;
  onChange: (next: AppCustomization) => void;
}) {
  const setItem = (section: keyof AppCustomization, id: string, on: boolean) => {
    const sec = { ...(value[section] || {}) };
    sec[id] = on;
    onChange({ ...value, [section]: sec });
  };
  const setAll = (section: keyof AppCustomization, items: AppItem[], on: boolean) => {
    const sec: Record<string, boolean> = { ...(value[section] || {}) };
    for (const it of items) sec[it.id] = on;
    onChange({ ...value, [section]: sec });
  };

  return (
    <div style={wrap}>
      <div style={{ fontSize: 11.5, color: 'var(--textTert)', lineHeight: 1.5 }}>
        Turn an item <strong>off</strong> to hide it in the mobile apps for this client. Items left on
        follow the app’s normal rules (a screen still needs its module/package enabled to appear).
        Applies to both Android and iOS on next login.
      </div>
      {APP_CUSTOMIZATION_SECTIONS.map(({ key, label, items }) => {
        const hiddenCount = items.filter((it) => !isItemVisible(value, key, it.id)).length;
        return (
          <div key={key} style={sectionCard}>
            <div style={sectionHead}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                {label}
                {hiddenCount > 0 && (
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--textTert)' }}>
                    {hiddenCount} hidden
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button type="button" style={linkBtn} onClick={() => setAll(key, items, true)}>Show all</button>
                <button type="button" style={linkBtn} onClick={() => setAll(key, items, false)}>Hide all</button>
              </div>
            </div>
            <div style={grid}>
              {items.map((it) => (
                <Chip
                  key={it.id}
                  item={it}
                  on={isItemVisible(value, key, it.id)}
                  onToggle={() => setItem(key, it.id, !isItemVisible(value, key, it.id))}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

# Live Tracking Page — Integration Notes

This branch (`claude/unify-apps-live-tracking-9j97F`) adds the
`<LowBatteryKpi>`, `<LowBatteryAlert>`, and `<LowBatteryFilter>`
presentational components in
`src/components/live-tracking/LowBattery.tsx`.

`src/app/dashboard/live-tracking/page.tsx` (42 KB) is intentionally not
overwritten in this commit — instead the three diffs below wire the new
components in without churn.

The page already renders `battery_percentage` and the device fields
(`device_model`, `device_brand`, `os_version`) on every FE. The backend
patch on this branch (`PATCH_NOTES_LIVE_TRACKING.md` in the `kinematic`
repo) makes the device fields actually flow back from
`/api/v1/analytics/live-locations`. iOS heartbeats now also populate
those columns (see `kinematic-ios` notes), so the dashboard finally has
parity for iOS + Android.

---

## 1. Import the components and add local state

At the top of `src/app/dashboard/live-tracking/page.tsx`:

```tsx
import { LowBatteryAlert, LowBatteryFilter, LowBatteryKpi, LOW_BATTERY }
  from '../../../components/live-tracking/LowBattery';
```

Inside `export default function LiveTrackingPage()`, alongside the other
`useState` hooks:

```tsx
const [lowBatteryOnly,  setLowBatteryOnly]  = useState(false);
const [batteryAlertOff, setBatteryAlertOff] = useState(false);
```

---

## 2. Render the KPI tile

In the existing KPI strip (`{[ ... ].map((s,i) => ...)}`), add one more
entry just before `Outlets`:

```tsx
<LowBatteryKpi fes={fes} />
```

Either keep the existing styled `<div>` for the other tiles and add this
one as a sibling, or convert each entry to render through `LowBatteryKpi`
for consistency.

---

## 3. Render the alert banner

Inside the page wrapper (right above or below the existing `error` banner)
add:

```tsx
<LowBatteryAlert
  fes={fes}
  dismissed={batteryAlertOff}
  onDismiss={() => setBatteryAlertOff(true)}
/>
```

The component returns `null` when there are no critical FEs, so it's safe
to mount unconditionally.

---

## 4. Render the filter chip

Inside the filter row (next to the layer toggles), add:

```tsx
<LowBatteryFilter
  active={lowBatteryOnly}
  count={fes.filter(LOW_BATTERY.isWarning).length}
  onToggle={() => setLowBatteryOnly(v => !v)}
/>
```

Then in the `filteredFEs` calculation, add one more clause:

```tsx
const filteredFEs = fes.filter(fe => {
  // ...existing search / status / zone checks...
  const matchBattery = !lowBatteryOnly || LOW_BATTERY.isWarning(fe);
  return !!matchSearch && !!matchStatus && !!matchZone && matchBattery;
});
```

(The same `matchBattery` clause should be added to `filteredSups` if you
want supervisors filtered too.)

---

## Result

- A supervisor watching the Live Tracking page sees an explicit
  **Low Battery** count in the KPI strip.
- Critical situations (FE under 10% during a shift) trigger a dismissible
  red banner naming the affected FEs.
- A single click on **Low battery only** narrows the FE list and the map
  pins to the FEs that need attention.
- Battery-percentage and device-info badges in the popup / detail panel
  continue to work unchanged.

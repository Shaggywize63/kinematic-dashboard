# Unify Apps + Live-Tracking + Outlet-API Speed (branch overview)

This branch ships across all four Kinematic repos. The branch name is
identical (`claude/unify-apps-live-tracking-9j97F`) so a coordinated PR
flow is straightforward.

## What this branch addresses

1. **Unify iOS and Android.** Today the two apps are out of parity in
   what they post on a heartbeat — Android sends device info + battery,
   iOS sends only battery to a different endpoint. This branch lines
   them up on `PATCH /api/v1/users/status` with the same JSON shape.
2. **Live tracking of FEs and battery on the dashboard.** The dashboard's
   `live-tracking` page already shows battery; this branch adds explicit
   *low-battery* surfacing (KPI tile, alert banner, filter chip) and
   surfaces the device fields that the backend stored but never exposed.
3. **Make outlet APIs feel fast.** A 30-second response cache on the
   read-heavy `mobile-home` / `route-plan/me` / `stores` /
   `management/executives` endpoints, plus an offline fallback and a
   tuned dispatcher / connection pool on Android.

## Per-repo summary

### `shaggywize63/kinematic` (backend)
- `PATCH_NOTES_LIVE_TRACKING.md` — small diff to
  `src/controllers/analytics.controller.ts` adding `device_model`,
  `device_brand`, `os_version`, and `last_location_updated_at` to the
  `getLiveLocations` SELECT and response.

### `shaggywize63/kinematic-app` (Android)
- `NetworkModule.kt` — 10 MB OkHttp on-disk cache scoped to the read-heavy
  outlet/home endpoints, 30 s `Cache-Control: public, max-age=30` for
  cacheable GETs only, an offline fallback that serves the last cached
  response (up to 1 day) when the device is offline, a tuned dispatcher
  (32/16) and connection pool (8 idle / 5 min keepalive), and tighter
  connect/read/write timeouts.
- `ConnectivityObserver.kt` — adds a synchronous `@Volatile lastKnown`
  property so the offline interceptor can consult network state without
  suspending.

### `shaggywize63/kinematic-ios` (iOS)
- `Services/LiveTrackingDeviceInfo.swift` — new `DeviceInfoSnapshot`,
  `UserStatusUpdate`, `currentBatteryPercentage()` helpers that mirror
  the Android `UserStatusUpdate` payload. Fed into a heartbeat via
  `UserStatusUpdate.heartbeat(lat:lng:battery:)`.
- `Services/OutletCache.swift` — 30 s in-memory TTL cache mirroring
  the Android OkHttp HTTP cache. Wraps `getMobileHome`,
  `fetchMyRoutePlan`, `getStores`, `getExecutives`.
- `Services/PATCH_NOTES_LIVE_TRACKING.md` — exact diffs that wire the
  two helpers into `KinematicRepository` inside `KinematicApp.swift`
  (62 KB, deliberately not overwritten in this commit).

### `shaggywize63/kinematic-dashboard`
- `src/components/live-tracking/LowBattery.tsx` — three small
  presentational components: `LowBatteryKpi`, `LowBatteryAlert`,
  `LowBatteryFilter`, plus a shared `LOW_BATTERY` predicate.
- `src/app/dashboard/live-tracking/PATCH_NOTES_LOW_BATTERY.md` —
  three-step wiring diff for `live-tracking/page.tsx`.

## Behavior after the branch is merged

- A heartbeat from either iOS or Android writes
  `users.battery_percentage`, `users.device_model`, `users.device_brand`,
  `users.os_version`, and `users.last_location_updated_at`. The
  `live-locations` endpoint forwards them to the dashboard. The
  dashboard's existing popup + FE detail panel renders them.
- A supervisor on the dashboard sees:
  - **Low Battery** count in the KPI strip.
  - A red **Critical battery** banner naming any checked-in FE under 10 %.
  - A **Low battery only** filter chip that narrows the list and the map.
  - The same battery / device / "Live Now" badges per FE that already
    existed, now driven by real backend data on iOS too.
- An FE on either app sees their assigned outlets within one frame on
  the second-and-later visits to the home screen, because the four hot
  outlet endpoints are now cached for 30 s. Offline FEs see the last
  cached snapshot for up to a day.

## Branch name

All four repos use `claude/unify-apps-live-tracking-9j97F`. Open four
PRs targeting `main` and merge in this order:

1. `kinematic` (backend) — purely additive, safe to deploy first.
2. `kinematic-dashboard` — depends on backend response shape.
3. `kinematic-app` (Android) — independent of dashboard / backend.
4. `kinematic-ios` (iOS) — depends on backend `users/status` route
   (already live).

/**
 * A minimal in-page stand-in for the Google Maps JS SDK (the real one needs a billed key + network).
 * It records what the page asks of it on `window.__gm` — markers and polylines (with a `removed` flag once
 * `setMap(null)` is called), info-window opens, viewport fits, zooms, styles and geocodes — so specs can
 * assert on what the Live Trailing page draws. Inject with `page.addInitScript(FAKE_MAPS)`.
 */
export const FAKE_MAPS = `
(() => {
  const gm = { map: null, markers: [], polylines: [], info: null, fit: 0, zooms: [], styles: [], opens: 0, geocodes: [] };
  window.__gm = gm;
  class Evented {
    constructor() { this._l = {}; }
    addListener(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); return { remove() {} }; }
    fire(ev, ...a) { (this._l[ev] || []).forEach((f) => f(...a)); }
  }
  class Map extends Evented {
    constructor(el, o) { super(); this.o = o; this.zoom = o.zoom; this.center = o.center; gm.map = this; gm.styles.push(o.styles); }
    setOptions(o) { if (o.styles) gm.styles.push(o.styles); }
    getZoom() { return this.zoom; }
    setZoom(z) { this.zoom = z; gm.zooms.push(z); this.fire('zoom_changed'); }
    setCenter(c) { this.center = c; }
    fitBounds() { gm.fit++; }
  }
  class Marker extends Evented {
    constructor(o) { super(); this.o = o; this.removed = false; gm.markers.push(this); }
    setMap(m) { if (!m) this.removed = true; }
    getPosition() { return this.o.position; }
  }
  class InfoWindow extends Evented {
    constructor() { super(); gm.info = this; this.content = ''; this.at = null; }
    setContent(c) { this.content = c; }
    open(map, m) { this.at = m; gm.opens++; }
    close() { this.at = null; }
  }
  class LatLngBounds {
    constructor() { this.p = []; }
    extend(p) { this.p.push(p); }
    _b() { const la = this.p.map((x) => x.lat || x.lat()), ln = this.p.map((x) => x.lng || x.lng());
      return { n: Math.max(...la), s: Math.min(...la), e: Math.max(...ln), w: Math.min(...ln) }; }
    getNorthEast() { const b = this._b(); return { lat: b.n, lng: b.e, equals: (o) => o.lat === b.n && o.lng === b.e }; }
    getSouthWest() { const b = this._b(); return { lat: b.s, lng: b.w }; }
    getCenter() { const b = this._b(); return { lat: (b.n + b.s) / 2, lng: (b.e + b.w) / 2 }; }
  }
  class Polyline { constructor(o) { this.o = o; this.removed = false; gm.polylines.push(this); } setMap(m) { if (!m) this.removed = true; } }
  class DirectionsService { route(_r, cb) { cb(null, 'ZERO_RESULTS'); } }
  class Geocoder {
    async geocode({ location }) {
      gm.geocodes.push(location);
      return { results: [{
        formatted_address: 'Plot 7, 80 Feet Rd, Koramangala, Bengaluru, Karnataka 560034, India',
        types: ['street_address'],
        address_components: [
          { long_name: '80 Feet Road', types: ['route'] },
          { long_name: 'Koramangala', types: ['sublocality_level_1', 'sublocality'] },
          { long_name: 'Bengaluru', types: ['locality'] },
        ],
      }] };
    }
  }
  window.google = { maps: {
    Map, Marker, InfoWindow, LatLngBounds, Polyline, DirectionsService, Geocoder,
    SymbolPath: { CIRCLE: 0 }, ControlPosition: { RIGHT_BOTTOM: 1 }, TravelMode: { DRIVING: 'DRIVING' },
    event: { trigger() {} },
    importLibrary: async (name) => (name === 'geocoding' ? { Geocoder } : {}),
  } };
})();
`;

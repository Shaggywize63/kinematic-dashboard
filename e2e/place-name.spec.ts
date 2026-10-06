import { test, expect } from '@playwright/test';
import { pickPlace, formatLatLng, formatLatLngShort, googleMapsUrl } from '../src/lib/placeName';

/**
 * Pure-function checks for the Live Trailing place-name helpers (no browser,
 * no Google Maps): how a geocoder result becomes the labels a manager reads.
 */
const comp = (long_name: string, ...types: string[]) => ({ long_name, types });

test.describe('pickPlace', () => {
  test('builds a full address and a short "street, area, city" label', () => {
    const p = pickPlace([{
      formatted_address: '12, 80 Feet Rd, Koramangala, Bengaluru, Karnataka 560034, India',
      types: ['street_address'],
      address_components: [
        comp('12', 'street_number'), comp('80 Feet Road', 'route'),
        comp('Koramangala', 'sublocality_level_1', 'sublocality'), comp('Bengaluru', 'locality'),
        comp('Karnataka', 'administrative_area_level_1'),
      ],
    }]);
    expect(p?.full).toBe('12, 80 Feet Rd, Koramangala, Bengaluru, Karnataka 560034, India');
    expect(p?.short).toBe('80 Feet Road, Koramangala, Bengaluru');
  });

  test('skips a bare plus-code result in favour of a real address', () => {
    const p = pickPlace([
      { formatted_address: 'GQ2V+R4 Bengaluru, Karnataka, India', types: ['plus_code'], address_components: [] },
      { formatted_address: 'Indiranagar, Bengaluru, Karnataka, India', types: ['sublocality'],
        address_components: [comp('Indiranagar', 'sublocality_level_1'), comp('Bengaluru', 'locality')] },
    ]);
    expect(p?.full).toBe('Indiranagar, Bengaluru, Karnataka, India');
    expect(p?.short).toBe('Indiranagar, Bengaluru');
  });

  test('strips a leading plus-code when it is the only result', () => {
    const p = pickPlace([{ formatted_address: 'GQ2V+R4, Hosur, Tamil Nadu, India', types: ['plus_code'], address_components: [] }]);
    expect(p?.full).toBe('Hosur, Tamil Nadu, India');
    expect(p?.short).toBe('Hosur, Tamil Nadu, India');
  });

  test('does not repeat a name that appears at two levels', () => {
    const p = pickPlace([{
      formatted_address: 'Mumbai, Maharashtra, India', types: ['locality'],
      address_components: [comp('Mumbai', 'sublocality_level_1'), comp('Mumbai', 'locality')],
    }]);
    expect(p?.short).toBe('Mumbai');
  });

  test('returns null for no results', () => {
    expect(pickPlace([])).toBeNull();
    expect(pickPlace(null)).toBeNull();
    expect(pickPlace([{ formatted_address: '', address_components: [] }])).toBeNull();
  });
});

test.describe('coordinate formatting', () => {
  test('full precision for the detail view, short for lists', () => {
    expect(formatLatLng(12.9716, 77.5946)).toBe('12.971600, 77.594600');
    expect(formatLatLngShort(12.971612, 77.594634)).toBe('12.9716, 77.5946');
    expect(formatLatLng(-33.8688, 151.2093)).toBe('-33.868800, 151.209300');
  });

  test('google maps link carries the exact point', () => {
    expect(googleMapsUrl(12.9716, 77.5946)).toBe('https://www.google.com/maps?q=12.9716%2C77.5946');
  });
});

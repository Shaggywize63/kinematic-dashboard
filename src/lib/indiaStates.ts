// Centroids for Indian states + union territories. Used by LeadsGeoMap to
// aggregate leads at low zoom (whole-country view) before drilling into city
// markers. Coords are rounded to two decimals — sufficient for placing the
// state-count chip near the geographic centre of each state.

export interface StateCentroid {
  name: string;
  lat: number;
  lng: number;
  // approximate display zoom when the search panel "flies" to this state
  zoom?: number;
}

export const INDIA_STATES: StateCentroid[] = [
  { name: 'Andhra Pradesh',                   lat: 15.91, lng: 79.74, zoom: 7 },
  { name: 'Arunachal Pradesh',                lat: 28.22, lng: 94.73, zoom: 7 },
  { name: 'Assam',                            lat: 26.20, lng: 92.94, zoom: 7 },
  { name: 'Bihar',                            lat: 25.10, lng: 85.31, zoom: 7 },
  { name: 'Chhattisgarh',                     lat: 21.28, lng: 81.87, zoom: 7 },
  { name: 'Goa',                              lat: 15.30, lng: 74.12, zoom: 9 },
  { name: 'Gujarat',                          lat: 22.26, lng: 71.19, zoom: 7 },
  { name: 'Haryana',                          lat: 29.06, lng: 76.09, zoom: 8 },
  { name: 'Himachal Pradesh',                 lat: 31.10, lng: 77.17, zoom: 8 },
  { name: 'Jharkhand',                        lat: 23.61, lng: 85.28, zoom: 7 },
  { name: 'Karnataka',                        lat: 15.32, lng: 75.71, zoom: 7 },
  { name: 'Kerala',                           lat: 10.85, lng: 76.27, zoom: 7 },
  { name: 'Madhya Pradesh',                   lat: 22.97, lng: 78.66, zoom: 6 },
  { name: 'Maharashtra',                      lat: 19.75, lng: 75.71, zoom: 6 },
  { name: 'Manipur',                          lat: 24.66, lng: 93.91, zoom: 8 },
  { name: 'Meghalaya',                        lat: 25.47, lng: 91.37, zoom: 8 },
  { name: 'Mizoram',                          lat: 23.16, lng: 92.94, zoom: 8 },
  { name: 'Nagaland',                         lat: 26.16, lng: 94.56, zoom: 8 },
  { name: 'Odisha',                           lat: 20.95, lng: 85.10, zoom: 7 },
  { name: 'Punjab',                           lat: 31.15, lng: 75.34, zoom: 7 },
  { name: 'Rajasthan',                        lat: 27.02, lng: 74.22, zoom: 6 },
  { name: 'Sikkim',                           lat: 27.53, lng: 88.51, zoom: 9 },
  { name: 'Tamil Nadu',                       lat: 11.13, lng: 78.66, zoom: 7 },
  { name: 'Telangana',                        lat: 18.11, lng: 79.02, zoom: 7 },
  { name: 'Tripura',                          lat: 23.94, lng: 91.99, zoom: 9 },
  { name: 'Uttar Pradesh',                    lat: 26.85, lng: 80.95, zoom: 6 },
  { name: 'Uttarakhand',                      lat: 30.07, lng: 79.02, zoom: 8 },
  { name: 'West Bengal',                      lat: 22.99, lng: 87.85, zoom: 7 },
  // Union Territories
  { name: 'Andaman and Nicobar Islands',      lat: 11.74, lng: 92.66, zoom: 7 },
  { name: 'Chandigarh',                       lat: 30.73, lng: 76.78, zoom: 11 },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', lat: 20.18, lng: 73.02, zoom: 9 },
  { name: 'Delhi',                            lat: 28.65, lng: 77.23, zoom: 10 },
  { name: 'Jammu and Kashmir',                lat: 33.78, lng: 76.58, zoom: 7 },
  { name: 'Ladakh',                           lat: 34.15, lng: 77.58, zoom: 7 },
  { name: 'Lakshadweep',                      lat: 10.57, lng: 72.64, zoom: 9 },
  { name: 'Puducherry',                       lat: 11.94, lng: 79.83, zoom: 10 },
];

// Centroid + a default-zoom of the whole country. Used when the search input
// is cleared so the map snaps back to the full India view.
export const INDIA_CENTRE = { lat: 22.0, lng: 80.0, zoom: 5 };

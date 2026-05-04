import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LocationFilterState {
  state: string | null;
  city: string | null;
  setState: (state: string | null) => void;
  setCity: (city: string | null) => void;
  clear: () => void;
  asParams: () => { state?: string; city?: string };
}

export const useCrmLocationFilter = create<LocationFilterState>()(
  persist(
    (set, get) => ({
      state: null,
      city: null,
      setState: (state) => set({ state, city: null }),
      setCity: (city) => set({ city }),
      clear: () => set({ state: null, city: null }),
      asParams: () => {
        const { state, city } = get();
        const params: { state?: string; city?: string } = {};
        if (state) params.state = state;
        if (city) params.city = city;
        return params;
      },
    }),
    { name: 'crm:location-filter' }
  )
);

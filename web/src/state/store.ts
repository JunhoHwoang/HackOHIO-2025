import { create } from 'zustand'

type Filters = {
  permit?: string
  payment?: string
  showADA?: boolean
}

type AppState = {
  userLocation?: { lat: number; lng: number }
  setUserLocation: (p: { lat: number; lng: number }) => void
  filters: Filters
  setFilters: (f: Partial<Filters>) => void
  selectedLotId?: string
  setSelectedLotId: (id?: string) => void
  lotSnapshots: Record<
    string,
    {
      counts: { total: number; occupied: number; open: number; unknown: number }
      observedAt: string
    }
  >
  setLotSnapshots: (snapshots: Record<string, { counts: { total: number; occupied: number; open: number; unknown: number }; observedAt: string }>) => void
}

export const useApp = create<AppState>((set) => ({
  filters: {},
  setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
  setUserLocation: (p) => set({ userLocation: p }),
  setSelectedLotId: (id) => set({ selectedLotId: id }),
  lotSnapshots: {},
  setLotSnapshots: (snapshots) =>
    set((state) => ({
      lotSnapshots: { ...state.lotSnapshots, ...snapshots },
    })),
}))

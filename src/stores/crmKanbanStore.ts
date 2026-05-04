import { create } from 'zustand';
import type { Deal } from '../types/crm';

interface KanbanState {
  deals: Record<string, Deal[]>; // stage_id -> deals
  loading: boolean;
  error: string | null;
  setDeals: (byStage: Record<string, Deal[]>) => void;
  moveDealOptimistic: (dealId: string, fromStageId: string, toStageId: string) => void;
  rollbackMove: (dealId: string, fromStageId: string, toStageId: string) => void;
  setLoading: (v: boolean) => void;
  setError: (e: string | null) => void;
}

export const useCrmKanbanStore = create<KanbanState>((set, get) => ({
  deals: {},
  loading: false,
  error: null,
  setDeals: (byStage) => set({ deals: byStage }),
  moveDealOptimistic: (dealId, fromStageId, toStageId) => {
    const state = get();
    const next = { ...state.deals };
    const from = (next[fromStageId] || []).slice();
    const idx = from.findIndex((d) => d.id === dealId);
    if (idx === -1) return;
    const [deal] = from.splice(idx, 1);
    const moved: Deal = { ...deal, stage_id: toStageId };
    next[fromStageId] = from;
    next[toStageId] = [moved, ...(next[toStageId] || [])];
    set({ deals: next });
  },
  rollbackMove: (dealId, fromStageId, toStageId) => {
    const state = get();
    const next = { ...state.deals };
    const to = (next[toStageId] || []).slice();
    const idx = to.findIndex((d) => d.id === dealId);
    if (idx === -1) return;
    const [deal] = to.splice(idx, 1);
    const restored: Deal = { ...deal, stage_id: fromStageId };
    next[toStageId] = to;
    next[fromStageId] = [restored, ...(next[fromStageId] || [])];
    set({ deals: next });
  },
  setLoading: (v) => set({ loading: v }),
  setError: (e) => set({ error: e }),
}));

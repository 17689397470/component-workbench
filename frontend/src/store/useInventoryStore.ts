import { create } from 'zustand';
import { ComponentItem, InventoryStats, ViewMode, GridDensity } from '../types/component';
import { componentApi } from '../api/componentApi';
import { useToastStore } from './useToastStore';

interface InventoryState {
  components: ComponentItem[];
  stats: InventoryStats | null;
  loading: boolean;
  searchQuery: string;
  categoryFilter: string;
  lowStockOnly: boolean;
  locationFilter: string;
  viewMode: ViewMode;
  gridDensity: GridDensity;
  dashboardCollapsed: boolean;
  selectedComponentId: number | null;
  isEntryDrawerOpen: boolean;
  isTaobaoModalOpen: boolean;
  isBackupModalOpen: boolean;

  // Actions
  fetchComponents: () => Promise<void>;
  fetchStats: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: string) => void;
  setLowStockOnly: (val: boolean) => void;
  setLocationFilter: (location: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setGridDensity: (density: GridDensity) => void;
  toggleGridDensity: () => void;
  toggleDashboardCollapsed: () => void;
  setSelectedComponentId: (id: number | null) => void;
  setEntryDrawerOpen: (open: boolean) => void;
  setTaobaoModalOpen: (open: boolean) => void;
  setBackupModalOpen: (open: boolean) => void;
  adjustQuantity: (id: number, delta: number) => Promise<void>;
}

export const useInventoryStore = create<InventoryState>((set, get) => {
  const initialViewMode = (localStorage.getItem('bom_inventory_view_mode') as ViewMode) ||
    (typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'table');
  const initialDensity = (localStorage.getItem('bom_inventory_grid_density') as GridDensity) || 'single';

  return {
    components: [],
    stats: null,
    loading: false,
    searchQuery: '',
    categoryFilter: '',
    lowStockOnly: false,
    locationFilter: '',
    viewMode: initialViewMode,
    gridDensity: initialDensity,
    dashboardCollapsed: false,
    selectedComponentId: null,
    isEntryDrawerOpen: false,
    isTaobaoModalOpen: false,
    isBackupModalOpen: false,

    fetchComponents: async () => {
      set({ loading: true });
      try {
        const { searchQuery, categoryFilter, lowStockOnly, locationFilter } = get();
        const res = await componentApi.getAll({
          q: searchQuery,
          category: categoryFilter,
          low_stock: lowStockOnly,
          location: locationFilter,
        });
        if (res.success) {
          set({ components: res.data });
        }
      } catch (err: any) {
        useToastStore.getState().showToast(err.message || '加载元器件失败', 'error');
      } finally {
        set({ loading: false });
      }
    },

    fetchStats: async () => {
      try {
        const res = await componentApi.getStats();
        if (res.success) {
          set({ stats: res.data });
        }
      } catch (err) {
        // 忽略统计轻微失败
      }
    },

    setSearchQuery: (query) => {
      set({ searchQuery: query });
      get().fetchComponents();
    },

    setCategoryFilter: (category) => {
      set({ categoryFilter: category });
      get().fetchComponents();
    },

    setLowStockOnly: (val) => {
      set({ lowStockOnly: val });
      get().fetchComponents();
    },

    setLocationFilter: (location) => {
      set({ locationFilter: location });
      get().fetchComponents();
    },

    setViewMode: (mode) => {
      localStorage.setItem('bom_inventory_view_mode', mode);
      set({ viewMode: mode });
    },

    setGridDensity: (density) => {
      localStorage.setItem('bom_inventory_grid_density', density);
      set({ gridDensity: density });
    },

    toggleGridDensity: () => {
      const next = get().gridDensity === 'single' ? 'double' : 'single';
      localStorage.setItem('bom_inventory_grid_density', next);
      set({ gridDensity: next });
    },

    toggleDashboardCollapsed: () => {
      set((s) => ({ dashboardCollapsed: !s.dashboardCollapsed }));
    },

    setSelectedComponentId: (id) => set({ selectedComponentId: id }),
    setEntryDrawerOpen: (open) => set({ isEntryDrawerOpen: open }),
    setTaobaoModalOpen: (open) => set({ isTaobaoModalOpen: open }),
    setBackupModalOpen: (open) => set({ isBackupModalOpen: open }),

    adjustQuantity: async (id, delta) => {
      try {
        // 乐观更新 (Optimistic UI Update) - 带来丝滑就地微调手感
        set((state) => ({
          components: state.components.map((c) =>
            c.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c
          ),
        }));

        await componentApi.adjustQuantity(id, delta);
        get().fetchStats();
      } catch (err: any) {
        useToastStore.getState().showToast('库存调整失败: ' + err.message, 'error');
        get().fetchComponents(); // 回滚重拉
      }
    },
  };
});

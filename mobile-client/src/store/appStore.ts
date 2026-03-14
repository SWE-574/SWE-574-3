import { create } from "zustand";

/**
 * Example app-level UI state. Add more slices or stores as needed.
 * Usage: const { searchQuery, setSearchQuery } = useAppStore();
 */
interface AppState {
  /** Optional: persist last search across HomeScreen remounts */
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  /** Optional: last selected quick filter id */
  quickFilterId: string;
  setQuickFilterId: (id: string) => void;

  /** Reset store (e.g. on logout) */
  reset: () => void;
}

const initialState = {
  searchQuery: "",
  quickFilterId: "all",
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,
  setSearchQuery: (q) => set({ searchQuery: q }),
  setQuickFilterId: (id) => set({ quickFilterId: id }),
  reset: () => set(initialState),
}));

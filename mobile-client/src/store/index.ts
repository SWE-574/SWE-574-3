/**
 * Zustand stores – global client state.
 * Add new stores here or in separate files and re-export.
 *
 * Usage in components:
 *   import { useAppStore } from '../store';
 *   const { searchQuery, setSearchQuery } = useAppStore();
 *
 * Optional: persist with zustand/middleware (e.g. persist from 'zustand/middleware')
 */

export { useAppStore } from "./appStore";

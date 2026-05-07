import { create } from 'zustand'

const STORAGE_KEY = 'hive_dashboard_tour_v1'

function readSeen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

function writeSeen(value: 'done' | 'skipped') {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, value)
  } catch {
    /* ignore quota / privacy errors */
  }
}

interface TourState {
  /** True while the dashboard tour overlay is active. */
  isOpen: boolean
  /** Increments every time the tour is started, used to remount Joyride. */
  runId: number
  /** True if the user has finished or skipped the tour at least once. */
  hasSeen: boolean
  /** Open the tour (used by the help icon and the auto-open effect). */
  startTour: () => void
  /** Close the tour and mark it as completed/skipped. */
  endTour: (reason: 'done' | 'skipped') => void
}

export const useTourStore = create<TourState>()((set, get) => ({
  isOpen: false,
  runId: 0,
  hasSeen: readSeen(),
  startTour: () => set({ isOpen: true, runId: get().runId + 1 }),
  endTour: (reason) => {
    writeSeen(reason)
    set({ isOpen: false, hasSeen: true })
  },
}))

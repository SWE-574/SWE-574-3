import { create } from 'zustand';

// Lightweight foreground toast store for #370. Push notifications received
// while the app is open are pushed in here; the InAppNotificationToast
// component above the navigator subscribes and renders the head of the queue.

export interface ForegroundToast {
  id: string;
  title: string;
  body?: string;
  /** When tapped, navigate using the same notification deep-link routing. */
  payload?: {
    type: string;
    notification_id?: string;
    related_handshake?: string | null;
    related_service?: string | null;
  };
}

interface ToastState {
  queue: ForegroundToast[];
  push: (toast: ForegroundToast) => void;
  shift: () => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  queue: [],
  push: (toast) =>
    set((state) => ({
      // Cap the queue so a flood of pushes can't pile up indefinitely.
      queue: [...state.queue.slice(-4), toast],
    })),
  shift: () => set((state) => ({ queue: state.queue.slice(1) })),
  clear: () => set({ queue: [] }),
}));

/**
 * Connectivity store. Single source of truth for whether the device is online.
 *
 * Backed by `expo-network`'s native listener so the value reflects OS-level
 * connectivity changes (airplane mode, Wi-Fi/cellular off) without polling.
 *
 * The hook in `src/hooks/useConnectivity.ts` is the typical entry point for
 * components. Non-React code (the API client gate) should use
 * `getConnectivitySnapshot()` for a synchronous read.
 *
 * Boot is optimistic: until the first listener event arrives we assume the
 * device is online so the UI does not flash an offline banner during launch.
 */
import { create } from "zustand";
import * as Network from "expo-network";

interface ConnectivityState {
  isOnline: boolean;
  isInternetReachable: boolean;
  /** Unix epoch ms of the last status transition. Useful for resync logic. */
  lastChangeAt: number;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({
  isOnline: true,
  isInternetReachable: true,
  lastChangeAt: Date.now(),
}));

let initialized = false;

/**
 * Idempotent. Subscribe once at app startup (e.g. inside AuthProvider).
 * Subsequent calls are no-ops.
 */
export function initConnectivity(): void {
  if (initialized) return;
  initialized = true;

  const apply = (state: {
    isConnected?: boolean;
    isInternetReachable?: boolean;
  }) => {
    // Treat `undefined` (boot indeterminacy) as online so the UI does not
    // flash a false offline state. A real `false` from the OS still wins.
    const isConnected = state.isConnected !== false;
    const isReachable = state.isInternetReachable !== false;
    const isOnline = isConnected && isReachable;

    useConnectivityStore.setState((prev) => {
      if (
        prev.isOnline === isOnline &&
        prev.isInternetReachable === isReachable
      ) {
        return prev;
      }
      return {
        isOnline,
        isInternetReachable: isReachable,
        lastChangeAt: Date.now(),
      };
    });
  };

  Network.getNetworkStateAsync().then(apply).catch(() => {
    /* swallow — keep optimistic default */
  });
  Network.addNetworkStateListener(apply);
}

export function getConnectivitySnapshot(): {
  isOnline: boolean;
  isInternetReachable: boolean;
} {
  const { isOnline, isInternetReachable } = useConnectivityStore.getState();
  return { isOnline, isInternetReachable };
}

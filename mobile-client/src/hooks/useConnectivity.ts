/**
 * Subscribe to OS-level connectivity changes.
 *
 * Returns the current `{ isOnline, isInternetReachable, lastChangeAt }` and
 * triggers re-render only when those values change.
 *
 * Components can call this freely; bootstrap is idempotent.
 */
import { useEffect } from "react";
import {
  initConnectivity,
  useConnectivityStore,
} from "../store/connectivityStore";

export function useConnectivity() {
  useEffect(() => {
    initConnectivity();
  }, []);

  const isOnline = useConnectivityStore((s) => s.isOnline);
  const isInternetReachable = useConnectivityStore(
    (s) => s.isInternetReachable,
  );
  const lastChangeAt = useConnectivityStore((s) => s.lastChangeAt);

  return { isOnline, isInternetReachable, lastChangeAt };
}

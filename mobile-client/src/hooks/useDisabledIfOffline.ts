/**
 * UI affordance for the mutation gate. The API client already rejects
 * mutating requests when offline (OfflineMutationError); this hook just lets
 * screens dim/disable the corresponding button so the user does not even
 * tap and get a toast.
 *
 * The connectivity store is the single source of truth — same one the API
 * client gate consults.
 */
import { useConnectivityStore } from "../store/connectivityStore";

export interface DisabledIfOffline {
  disabled: boolean;
  reason: string | null;
}

const REASON = "You are offline. This action will be available again when you reconnect.";

export function useDisabledIfOffline(): DisabledIfOffline {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  return {
    disabled: !isOnline,
    reason: isOnline ? null : REASON,
  };
}

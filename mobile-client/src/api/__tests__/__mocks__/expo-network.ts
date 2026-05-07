// Jest mock for expo-network. The real module is a TurboModule so it cannot
// be imported in Node. Tests can override the listener payload by calling
// `__setNetworkState` to simulate online/offline transitions.

let _state: { isConnected?: boolean; isInternetReachable?: boolean } = {
  isConnected: true,
  isInternetReachable: true,
};
const _listeners: Array<(s: typeof _state) => void> = [];

export const NetworkStateType = {
  NONE: "NONE",
  UNKNOWN: "UNKNOWN",
  CELLULAR: "CELLULAR",
  WIFI: "WIFI",
};

export async function getNetworkStateAsync() {
  return { ..._state, type: _state.isConnected ? NetworkStateType.WIFI : NetworkStateType.NONE };
}

export function addNetworkStateListener(cb: (s: typeof _state) => void) {
  _listeners.push(cb);
  return {
    remove() {
      const i = _listeners.indexOf(cb);
      if (i >= 0) _listeners.splice(i, 1);
    },
  };
}

export function useNetworkState() {
  return { ..._state };
}

// Test-only helpers (not part of the real expo-network surface).
export function __setNetworkState(next: { isConnected?: boolean; isInternetReachable?: boolean }) {
  _state = { ..._state, ...next };
  for (const l of [..._listeners]) l(_state);
}

export function __resetNetworkState() {
  _state = { isConnected: true, isInternetReachable: true };
  _listeners.length = 0;
}

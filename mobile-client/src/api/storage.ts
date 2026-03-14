/**
 * Persistent token storage for auth (access + refresh).
 * Uses expo-secure-store to avoid AsyncStorage native module issues in Expo and to keep tokens secure.
 */

import * as SecureStore from "expo-secure-store";

const AUTH_ACCESS_KEY = "thehive_auth_access";
const AUTH_REFRESH_KEY = "thehive_auth_refresh";

export interface StoredTokens {
  access: string;
  refresh: string;
}

export async function getStoredTokens(): Promise<StoredTokens | null> {
  try {
    const [access, refresh] = await Promise.all([
      SecureStore.getItemAsync(AUTH_ACCESS_KEY),
      SecureStore.getItemAsync(AUTH_REFRESH_KEY),
    ]);
    if (access && refresh) return { access, refresh };
    return null;
  } catch {
    return null;
  }
}

export async function setStoredTokens(tokens: StoredTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(AUTH_ACCESS_KEY, tokens.access),
    SecureStore.setItemAsync(AUTH_REFRESH_KEY, tokens.refresh),
  ]);
}

export async function clearStoredTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(AUTH_ACCESS_KEY),
    SecureStore.deleteItemAsync(AUTH_REFRESH_KEY),
  ]);
}

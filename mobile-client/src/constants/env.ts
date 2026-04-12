type ExpoExtra = {
  apiUrl?: string;
  mapboxToken?: string;
};

function getExpoConstants():
  | {
      expoConfig?: {
        extra?: ExpoExtra;
      };
    }
  | undefined {
  try {
    return require("expo-constants").default;
  } catch {
    return undefined;
  }
}

function getExpoExtra(): ExpoExtra {
  return (getExpoConstants()?.expoConfig?.extra ?? {}) as ExpoExtra;
}

export function getApiUrl(): string {
  return (
    getExpoExtra().apiUrl ||
    process.env.EXPO_PUBLIC_API_URL ||
    "https://apiary.selmangunes.com/api"
  );
}

export function getMapboxToken(): string | undefined {
  return (
    getExpoExtra().mapboxToken ||
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN ||
    process.env.VITE_MAPBOX_TOKEN ||
    undefined
  );
}

export function normalizeRuntimeUrl(
  value?: string | null,
): string | null | undefined {
  if (value == null) return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  let apiUrl: URL;
  try {
    apiUrl = new URL(getApiUrl());
  } catch {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `${apiUrl.origin}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (!["localhost", "127.0.0.1", "10.0.2.2"].includes(parsed.hostname)) {
      return trimmed;
    }
    parsed.hostname = apiUrl.hostname;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

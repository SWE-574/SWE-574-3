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
    if (trimmed.startsWith("/hive-media/")) {
      const mediaUrl = new URL(trimmed, apiUrl.origin);
      const shouldUseLocalMinioPort =
        apiUrl.protocol === "http:" && apiUrl.hostname !== "apiary.selmangunes.com";
      if (shouldUseLocalMinioPort) {
        mediaUrl.port = "9000";
      }
      return mediaUrl.toString();
    }
    return `${apiUrl.origin}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    const runtimeOnlyHosts = new Set([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "10.0.2.2",
      "minio",
      "backend",
    ]);
    if (!runtimeOnlyHosts.has(parsed.hostname)) {
      return trimmed;
    }
    parsed.protocol = apiUrl.protocol;
    parsed.hostname = apiUrl.hostname;
    const isMediaUrl = parsed.pathname.startsWith("/hive-media/");
    const shouldUseLocalMinioPort =
      isMediaUrl && apiUrl.protocol === "http:" && apiUrl.hostname !== "apiary.selmangunes.com";
    parsed.port = shouldUseLocalMinioPort ? parsed.port || "9000" : apiUrl.port;
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

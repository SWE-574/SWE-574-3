const fs = require("fs");
const path = require("path");
const baseConfig = require("./app.json");

type EnvMap = Record<string, string>;

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readRootEnv(): EnvMap {
  const rootEnvPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(rootEnvPath)) {
    return {};
  }

  const content = fs.readFileSync(rootEnvPath, "utf8");
  const env: EnvMap = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) continue;

    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1);
    env[key] = stripQuotes(value);
  }

  return env;
}

const rootEnv = readRootEnv();
const mobileConfig = baseConfig.expo;

const apiUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  rootEnv.EXPO_PUBLIC_API_URL ||
  "https://apiary.selmangunes.com/api";

const mapboxToken =
  rootEnv.EXPO_PUBLIC_MAPBOX_TOKEN || rootEnv.VITE_MAPBOX_TOKEN || "";

// #370 — let CI/EAS point at the Firebase credential file outside the repo.
// app.json's androidFile/iosFile defaults still apply when these env vars
// are absent, which is the local-dev path documented in CLAUDE.md.
const androidFirebaseFile =
  process.env.EXPO_GOOGLE_SERVICES_JSON ||
  rootEnv.EXPO_GOOGLE_SERVICES_JSON;
const iosFirebaseFile =
  process.env.EXPO_GOOGLE_SERVICES_PLIST ||
  rootEnv.EXPO_GOOGLE_SERVICES_PLIST;

const androidConfig = {
  ...(mobileConfig.android ?? {}),
  ...(androidFirebaseFile ? { googleServicesFile: androidFirebaseFile } : {}),
};
const iosConfig = {
  ...(mobileConfig.ios ?? {}),
  ...(iosFirebaseFile ? { googleServicesFile: iosFirebaseFile } : {}),
};

module.exports = {
  ...mobileConfig,
  ios: iosConfig,
  android: androidConfig,
  plugins: [
    ...(mobileConfig.plugins ?? []),
    "@react-native-community/datetimepicker",
  ],
  extra: {
    ...(mobileConfig.extra ?? {}),
    apiUrl,
    mapboxToken,
    envSource: "root-dotenv",
  },
};

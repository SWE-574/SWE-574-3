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

module.exports = {
  ...mobileConfig,
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

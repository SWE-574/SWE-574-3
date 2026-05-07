// Metro configuration for The Hive mobile client.
//
// Why this exists: MapScreen loads `assets/leaflet.html` via
// `require("...leaflet.html")` + `Asset.fromModule().downloadAsync()`.
// Metro's default `assetExts` does not include `html`, so the require
// never produces a valid asset reference and `downloadAsync()` rejects
// with ERR_UNABLE_TO_DOWNLOAD_ASSET. Adding `html` here registers it
// as a bundled asset.

const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("html")) {
  config.resolver.assetExts.push("html");
}

module.exports = config;

const { withPodfile } = require("expo/config-plugins");

/**
 * Expo config plugin that adds `use_modular_headers!` to the iOS Podfile.
 * Required for @react-native-firebase Swift pods that depend on modules
 * without module maps (e.g. GoogleUtilities).
 */
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (podfileConfig) => {
    const podfile = podfileConfig.modResults.contents;

    if (!podfile.includes("use_modular_headers!")) {
      podfileConfig.modResults.contents = podfile.replace(
        /platform :ios/,
        "use_modular_headers!\nplatform :ios"
      );
    }

    return podfileConfig;
  });
};

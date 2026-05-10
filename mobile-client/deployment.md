# Deployment Guide

This document describes how to build and deploy **The Hive** mobile app using [Expo Application Services (EAS)](https://docs.expo.dev/build/introduction/).

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [EAS CLI](https://docs.expo.dev/build/setup/#install-the-eas-cli): `npm install -g eas-cli`
- An [Expo account](https://expo.dev/signup)
- Project linked to EAS: the app is already configured with `extra.eas.projectId` in `app.json`

Log in and confirm the project is linked:

```bash
eas login
eas project:info
```

## Build Profiles

Defined in `eas.json`:

| Profile       | Purpose                    | Distribution   | Notes                          |
|---------------|----------------------------|----------------|--------------------------------|
| `development` | Local dev with dev client  | Internal       | Uses development client build  |
| `preview`     | Internal testing (ad-hoc) | Internal       | For testers, no store needed   |
| `production`  | Store or production APK    | Store / APK   | Auto-increment version; APK on Android |

## Building

Two paths: EAS Cloud (default, recommended) and a local gradle build for Android (no EAS account needed).

Run all commands from `mobile-client/`.

### npm scripts (preferred)

```bash
npm run build:android          # EAS cloud, production APK
npm run build:android:local    # Local gradle release APK (android/app/build/outputs/apk/release/)
npm run build:ios              # EAS cloud, production iOS
npm run build:preview          # EAS cloud, preview build (Android + iOS)
```

`make` wrappers exist at the repo root: `make mobile-build-android`, `make mobile-build-android-local`, `make mobile-build-ios`, `make mobile-build-preview`.

### Direct EAS commands

```bash
eas build -p android --profile production    # APK
eas build -p android --profile preview
eas build -p android --profile development

eas build -p ios --profile production
eas build -p ios --profile preview
eas build -p ios --profile development
```

Production Android builds are configured to output an **APK** (`eas.json` → `build.production.android.buildType: "apk"`).

### Local Android build (no EAS)

```bash
cd mobile-client
npm run build:android:local
```

Produces an unsigned-but-installable release APK at `mobile-client/android/app/build/outputs/apk/release/app-release.apk`. Requires Android SDK, JDK 17, and the `android/` folder populated by `npm run prebuild` (already in the repo). Useful for sideloading on a test device without going through EAS.

### iOS notes

iOS builds require an [Apple Developer account](https://developer.apple.com/) and proper credentials. EAS can manage them: run the build and follow the prompts, or configure [credentials in EAS](https://docs.expo.dev/app-signing/managed-credentials/). Local iOS release builds are out of scope here — use `eas build` or open `mobile-client/ios/thehive.xcworkspace` in Xcode.

## Versioning

- **App version** is taken from `app.json` (`expo.version`).
- **Build number / version code** is managed remotely by EAS (`appVersionSource: "remote"` in `eas.json`) and auto-incremented for the `production` profile (`autoIncrement: true`).

To bump the user-facing version, update `version` in `app.json` (e.g. `"1.0.0"` → `"1.1.0"`), then run a new production build.

## Submitting to Stores

After a production build completes, submit the same build (or a new one) to the stores.

### Android (Google Play)

```bash
eas submit --platform android --profile production
```

Select the build to submit when prompted. Ensure a **Play Console** app is created and the first release is set up (e.g. internal or production track).

### iOS (App Store / TestFlight)

```bash
eas submit --platform ios --profile production
```

Select the build and target (App Store or TestFlight). Requires App Store Connect app and bundle ID `com.apiary.thehive` to match `app.json`.

## Environment and Secrets

If the app needs API keys or environment variables for production:

1. In [Expo dashboard](https://expo.dev) → your project → **Secrets**, add variables (e.g. `API_BASE_URL`).
2. Reference them in `eas.json` under the build profile, e.g.:

   ```json
   "production": {
     "env": {
       "API_BASE_URL": "@API_BASE_URL"
     },
     ...
   }
   ```

Then create a secret named `API_BASE_URL` in the dashboard so EAS injects it at build time.

## Quick Reference

| Task              | Command                                              |
|-------------------|------------------------------------------------------|
| Production Android APK (cloud) | `npm run build:android` |
| Production Android APK (local) | `npm run build:android:local` |
| Production iOS     | `npm run build:ios`             |
| Preview build (both)| `npm run build:preview`          |
| Submit Android     | `eas submit --platform android --profile production`|
| Submit iOS         | `eas submit --platform ios --profile production`     |
| Build status       | [expo.dev](https://expo.dev) → project → Builds      |

## Troubleshooting

- **Credentials errors (iOS)**  
  Use `eas credentials` to inspect or reset signing credentials, or let EAS create them during the first build.

- **Build fails on EAS**  
  Check the build log on expo.dev. Common fixes: ensure `node` version matches your local setup, lockfile is committed, and no required secrets are missing.

- **Version / build number**  
  EAS increments the build number automatically for production. To reset or change behavior, adjust `eas.json` or the version in `app.json` and re-run the build.

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

All builds run on EAS servers. Run from the project root (e.g. `the-hive/`).

### Android

```bash
# Production APK (e.g. for direct install or store)
eas build -p android --profile production

# Preview build for internal testers
eas build -p android --profile preview

# Development build (with dev client)
eas build -p android --profile development
```

Production Android builds are configured to output an **APK** (`eas.json` → `build.production.android.buildType: "apk"`).

### iOS

```bash
# Production (App Store or TestFlight)
eas build -p ios --profile production

# Preview (internal / ad-hoc)
eas build -p ios --profile preview

# Development
eas build -p ios --profile development
```

iOS builds require an [Apple Developer account](https://developer.apple.com/) and proper credentials. EAS can manage them: run the build and follow the prompts, or configure [credentials in EAS](https://docs.expo.dev/app-signing/managed-credentials/).

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

Select the build and target (App Store or TestFlight). Requires App Store Connect app and bundle ID `com.diclenaz.thehive` to match `app.json`.

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
| Production Android APK | `eas build -p android --profile production`    |
| Production iOS     | `eas build -p ios --profile production`             |
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

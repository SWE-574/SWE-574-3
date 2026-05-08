# Mobile client (Expo / React Native)

The Hive's mobile client. Same backend as the web frontend.

## Running locally

You need the rest of the stack running first. From the repo root:

```bash
make env       # one-time, generates .env
make dev       # backend + infra (Postgres/Redis/MinIO) + web frontend
```

Then in `mobile-client/`:

```bash
npm install
npm run ios       # iOS simulator -> http://localhost:8000
npm run android   # Android emulator -> http://10.0.2.2:8000
npm run device    # physical device on the same LAN (run `npm run ios` or
                  # `npm run android` once first to install the dev client)
```

`npm run ios` and `npm run android` both run `expo run:<platform>`, which
rebuilds and installs the native dev client when needed and is a fast no-op
when nothing native has changed. After that, JS edits hot-reload as usual.

The Android emulator can't see `localhost` on the host, which is why it uses
`10.0.2.2` (the emulator's gateway). iOS simulator runs on the host, so plain
`localhost:8000` works and we talk to the Daphne backend directly without
going through the nginx Docker stack.

If `EXPO_PUBLIC_API_URL` isn't set (no `.env` and you didn't use one of the
scripts above), the app will throw at startup with a hint instead of silently
pointing somewhere unexpected.

## Push notifications

Push goes through Expo end-to-end. The client gets an `ExponentPushToken[...]`
via `expo-notifications`; the backend sends through `exponent-server-sdk` and
Expo forwards to FCM (Android) or APNs (iOS) using Expo's credentials. No
local Firebase config files are needed for development or for the EAS-built
production app.

## Tests

```bash
npm test
```

Jest is scoped to `src/` and only picks up `__tests__/**/*.test.ts`.

## Native builds

`android/` and `ios/` are committed (Expo prebuild output). If you change
plugins or anything in `app.json`/`app.config.ts` that affects native code,
regenerate with:

```bash
npm run prebuild   # expo prebuild --clean
```

# Maestro flows

End-to-end smoke flows for the mobile app, run with [Maestro](https://maestro.mobile.dev).

These are the *automated* slice of the QA pass. The longer tail of screens lives in `mobile-client/docs/manual-test-plan.md`.

## Prereqs

- Install Maestro: `curl -Ls "https://get.maestro.mobile.dev" | bash`
- An Android emulator or iOS simulator running with the dev client installed (run `npm run android` or `npm run ios` from `mobile-client/`)
- The backend running and reachable from the device — `make dev` from the repo root is the simplest path

## Test account

Most flows need a logged-in user. The demo seed gives you `elif@demo.com` / `demo123` after `make setup-demo`. Override per-run with env vars:

```bash
maestro test -e TEST_EMAIL=elif@demo.com -e TEST_PASSWORD=demo123 .maestro/handshake/request.yaml
```

## Running

```bash
# Single flow
maestro test .maestro/auth/login.yaml

# A whole folder
maestro test .maestro/handshake/

# Tagged subset
maestro test --include-tags=smoke .maestro/
```

## Tags

- `smoke` — the bare-minimum signal for "is the app even usable"
- `auth` — login/register
- `handshake` — handshake request/accept/decline + QR
- `post` — service creation

## What's covered here

| Flow | What it checks |
|---|---|
| `auth/login.yaml` | Sign in with email/password lands on Home feed |
| `auth/register.yaml` | New-account flow reaches the verification gate |
| `browse/home-to-detail.yaml` | Tap a service card, land on detail, see the title |
| `post/post-offer.yaml` | Create an Offer from the Post tab |
| `handshake/request.yaml` | Send a handshake from a service detail |
| `handshake/accept.yaml` | Owner accepts a pending request from the chat thread |
| `handshake/decline.yaml` | Owner declines a pending request |
| `qr/organizer-display.yaml` | Event organizer sees the QR token modal |
| `qr/participant-manual-entry.yaml` | Participant joins via manual code (camera-less path) |

## What's NOT covered (and why)

- **QR camera scan** — Maestro can't drive a real camera. Tested manually per the plan doc.
- **Push notifications received in background** — depends on FCM/APNs, tested manually.
- **Map/location** — needs Mapbox token and device GPS; tested manually.

## Selectors

Flows match by visible text because the app doesn't have systematic `testID`s yet. If a label changes, the matching flow needs an update. When/if testIDs land, swap the matchers over — Maestro handles both.

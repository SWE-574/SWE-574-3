# Maestro flows

End-to-end smoke flows for the mobile app, run with [Maestro](https://maestro.mobile.dev).

These are the *automated* slice of the QA pass. The remaining tail (push notifications, image gallery picker, airplane-mode banner, deep links, real camera scan) lives in `mobile-client/docs/manual-test-plan.md` and is unavoidable manual work.

## Prereqs

- Install Maestro: `brew install --formula mobile-dev-inc/tap/maestro` (the cask installs the GUI, not the CLI — use `--formula`)
- A **production-style** Expo build installed on the emulator/simulator (e.g. an EAS preview build, or `npm run android -- --variant=release`). The dev client launcher swallows `clearState: true` because clearing storage drops the Metro URL — so most flows fail against `npm run android`/`npm run ios` even with Metro running.
- The backend running and reachable from the device — `make dev` from the repo root is the simplest path
- Demo data seeded — `make setup-demo` from the repo root

## Test account

Most flows need a logged-in user. The demo seed gives you `elif@demo.com` / `demo123` after `make setup-demo`. The second-party flows (handshake accept/decline, QR participant) use `cem@demo.com`. Override per-run with env vars:

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

# Lint without running (handy for CI fast-fail)
for f in $(find .maestro -name '*.yaml'); do maestro test --dry-run "$f"; done
```

## Tags

- `smoke` — the bare-minimum signal for "is the app even usable"
- `auth` — login/register/logout
- `handshake` — handshake request/accept/decline + QR
- `qr` — QR organiser display + participant manual entry
- `post` — service creation
- `forum` — forum feed + create topic
- `messages` — conversation list + P2P chat
- `profile` — profile home / edit / achievements / followers / notifications / calendar / commitments / time activity
- `map` — Map tab boot

## What's covered

| Flow | Manual-plan section | What it checks |
|---|---|---|
| `auth/login.yaml` | (smoke) | Sign in with email/password lands on Home feed |
| `auth/register.yaml` | (smoke) | New-account flow registers and lands on Home (the app currently auto-signs-in on success, no verification gate yet) |
| `browse/home-to-detail.yaml` | (smoke) | Tap a service card, land on detail, see the Request CTA |
| `post/post-offer.yaml` | (smoke) | Create an Offer from the Post tab |
| `handshake/request.yaml` | (smoke) | Send a handshake from a service detail |
| `handshake/accept.yaml` | (smoke) | Owner accepts a pending request from the chat thread |
| `handshake/decline.yaml` | (smoke) | Owner declines a pending request |
| `qr/organizer-display.yaml` | (smoke) | Event organizer sees the QR token modal |
| `qr/participant-manual-entry.yaml` | (smoke) | Participant joins via manual code (camera-less path) |
| `forum/feed.yaml` | §1.1 | Forum tab opens and either shows topics or the empty state |
| `forum/create-topic.yaml` | §1.3 | Create a topic and see it land back on the feed |
| `messages/conversation-list.yaml` | §2.1 | Messages tab opens |
| `messages/p2p-chat.yaml` | §2.2 | Send a message into the first thread, see it render |
| `map/map-loads.yaml` | §3.1 | Map tab opens without crashing the WebView |
| `profile/profile-home.yaml` | §4.1 | Profile tab opens and the overflow menu is reachable |
| `profile/edit-profile.yaml` | §4.2 | Open Edit profile sheet and save a change |
| `profile/achievements.yaml` | §4.3 | Open the achievements grid |
| `profile/follow-list.yaml` | §4.4 | Open the followers list |
| `profile/notifications.yaml` | §4.5 | Open the notifications list |
| `profile/calendar.yaml` | §4.7 | Open the calendar |
| `profile/my-commitments.yaml` | §4.8 | Open "My commitments" |
| `profile/time-activity.yaml` | §4.9 | Open "Time activity" |
| `cross/logout.yaml` | §5.4 | Log out lands on the Login screen |
| `cross/cold-start.yaml` | §5.1 | Relaunch after stopApp returns to a signed-in Home feed |

## What's NOT covered (and why)

- **QR camera scan** — Maestro can't drive a real camera. Tested manually per the plan doc. The manual-entry fallback IS covered.
- **Push notifications received in background** — depends on FCM/APNs, tested manually.
- **Map markers/clusters inside the WebView** — Mapbox renders inside a WebView whose internal nodes are not exposed to Maestro's accessibility tree. Tab-level boot is automated, marker interaction is manual.
- **Airplane mode / offline banner / draft preservation** — Maestro can't toggle radios; tested manually.
- **Image gallery attachment** — drives the native system gallery picker, which Maestro can interact with but the picker UI differs across iOS/Android versions enough to be brittle. Tested manually.
- **Deep links** — covered ad-hoc per release.

## Selectors

Flows match by visible text because the app doesn't have systematic `testID`s yet. A few places where text is dynamic (lists, overflow menus, profile bell) reference `id:` matchers with `optional: true` — those will be exercised once the matching `testID` props land in the screen code. If a label changes, the matching flow needs an update.

## Known fragility

- `clearState: true` resets Expo dev-client storage, including the Metro URL. Run against a release build (EAS preview, or `--variant=release`) — otherwise the dev launcher swallows the flow.
- `${RANDOM}` is not expanded by Maestro (it's a bash builtin). Use static suffixes and override per-run with `-e VAR=value`.
- `assertVisible` does not accept a `timeout` property in Maestro 2.5.x. Use `extendedWaitUntil` when you need a wait window.
- `tapOn: "X"` shorthand cannot carry sibling properties (`optional`, `index`, etc.). Use the long form (`tapOn: { text: "X", optional: true }`).

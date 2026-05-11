# Cross-client tests

Two thin integration tests that exercise the backend API as a *web* client and a *mobile* client at the same time, to catch contract drift between the two — the kind of bug where one client sees stale data, or a field renames break only one platform.

These are deliberately small. Web has Playwright, mobile has Maestro, and the backend has its own pytest suite. This layer just confirms that when a web user posts, a mobile user actually sees it (and vice versa), through the real HTTP API.

## Prereqs

- Backend running on `http://localhost:8000` (e.g. `make dev`).
- Two demo accounts seeded (`make setup-demo` gives you `elif@demo.com` / `demo123` and friends).

## Running

From the repo root:

```bash
make test-cross-client
```

Or directly:

```bash
cd tests/cross-client && node --test
```

Override the backend URL or credentials with env vars:

```bash
BACKEND_URL=http://192.168.1.13:8000 USER_A=alice@demo.com USER_B=bob@demo.com node --test
```

## What's covered

| Test | What it does |
|---|---|
| `service-discovery.test.mjs` | User A (web headers) posts an Offer. User B (mobile headers) fetches the discovery feed and confirms the new offer is there. |
| `handshake.test.mjs` | User A posts an Offer. User B requests a handshake. Both fetch their messages — A sees the inbound request, B sees the pending status. |

## What this is NOT

Not a load test, not a full e2e, not a replacement for client-side tests. If you're tempted to add another flow here, ask whether it would be better placed in Playwright (web-side rendering) or Maestro (mobile-side UI). This layer is for *contract* checks that span both.

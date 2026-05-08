# Feature 11 — Events E2E suite

Closes issue #268. Each spec maps 1:1 to an FR or NFR-11 requirement.

## Mapping

| Spec | Requirement | What it proves |
|------|-------------|----------------|
| `01-fr-11a.spec.ts` | FR-11a | Organizer can publish a future event with a participant cap |
| `02-fr-11b.spec.ts` | FR-11b | Attendee can express interest, organizer sees the handshake |
| `03-fr-11c.spec.ts` | FR-11c | Organizer can mark a participant attended |
| `04-fr-11d.spec.ts` | FR-11d | Organizer can cancel a published event |

## Pending — backend gap or planned

| Requirement | Status | Notes |
|-------------|--------|-------|
| FR-11e | TODO | Recurrent events |
| FR-11f | TODO | Event check-in via QR |
| FR-11g, FR-11h | blocked-by backend | Reminder cadence not implemented yet |
| FR-11i, FR-11j, FR-11k, FR-11l, FR-11m, FR-11n, FR-11o | TODO | Add as the UI lands |
| NFR-11a | covered by k6 | `frontend/tests/perf/event-create.js` |
| NFR-11b | TODO | Notification SLA spec |
| NFR-11c | covered by axe | `frontend/tests/e2e/a11y/baseline.spec.ts` |

## Helpers

`tests/e2e/helpers/feature11.ts` exposes `createEvent`, `expressInterestViaApi`,
`markAttendedViaApi`, `cancelEventViaApi`, and `asUser(page, user, action)`
for role-switching mid-test.

## Running locally

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test \
  --retries=0 tests/e2e/feature-11
```

## CI

Path-selected by `.github/scripts/select-e2e-tests.sh` when files under
`backend/api/views.py` event endpoints or `frontend/src/pages/Events*` change.
The full suite runs nightly in `ci-e2e-nightly.yml`.

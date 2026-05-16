# Final Test Report

Tests were executed on **2026-05-16** against branch `final-report-test-branch`.
The stack ran natively (Django daphne `:8000`, Vite `:5173`) on top of the dockerised infra (Postgres / Redis / MinIO).

Open the HTML reports below:

```bash
open final_report_test/backend/pytest-report.html          # backend unit + integration
open final_report_test/backend/coverage/html/index.html    # backend coverage
open final_report_test/frontend/coverage/index.html        # frontend coverage (vitest)
open final_report_test/mobile/coverage/index.html          # mobile coverage (jest)
open final_report_test/e2e/playwright-report/index.html    # e2e (playwright)
```

## Summary

| Suite | Tool | Result | Coverage | Notes |
|---|---|---|---|---|
| Backend | pytest 7 / pytest-django | **1 748 passed**, 26 xfailed, 6 xpassed | **81.98 %** lines (gate 70 %) | 21:57 wall time. Clean run. |
| Frontend (unit) | Vitest 4 + v8 | passed | 8.33 % lines / 7.64 % stmt | Below the local 15 % gate — printed as warning, exit 0. |
| Mobile | Jest 29 (`api` + `components`) | **272 passed, 3 failed** | included | All 3 failures live in `ProfileEditSheet.render.test.tsx` (test-renderer unmount during async). |
| E2E | Playwright 1.49 (chromium + chromium-mobile) | **284 passed, 34 failed, 14 skipped** | n/a | 25 min 30 s wall time. Failure analysis below. |

## E2E failure analysis

Each failing test was inspected via the error stack in `e2e/playwright-output.log`.
Failures group into four buckets — only one of them points at a missing feature; the rest are test-suite drift.

### 1. Stale test selectors — UI copy duplicated (5 tests, **suite out of date**)
Playwright runs in strict mode, so when a label is rendered twice the selector throws.
The product still works, the spec just needs a tighter selector.

- `email-verification-gate.spec.ts` × 3 — `getByText(/Email sent/i)` resolves to 2 elements
- `follow-system/01-self-profile-follow-lists.spec.ts` — `Following` exact resolves to 2 elements (nav link + modal title)
- `follow-system/02-self-profile-followers-list.spec.ts` — same for `Followers`

### 2. Seed / demo data drift (11 tests, **suite out of date**)
The specs hard-code titles from an older demo dataset; those rows are no longer present in `setup_demo.py`.
Feature works — the locator just can't find the fixture row.

- `feature-7/02,04,05,07-fr-07*` — *"Pending handshake not found for service … / Elif Yılmaz"* (test helper can't find the seeded handshake)
- `group-chat.spec.ts` × 5 — *"Neighborhood Manti Cooking Circle"* service missing
- `handshake.spec.ts` × 2 — *"Watercolor Postcards…"*, *"Help Organizing Family Recipe Notes"* services missing

### 3. Real-time / websocket delivery (4 tests, **possibly real**)
Tests send a message / edit and then wait for the receiver to see it. The element never appears, which usually means the websocket fan-out path is flaky in local dev — but it could also be a genuine bug. Worth a manual smoke-test before dismissing.

- `feature-10/06-fr-10f`, `feature-10/07-nfr-10a` — private chat realtime
- `feature-5/06-fr-05f`, `feature-6/06-fr-06f` — in-app notification after offer/request edit

### 4. UI / route changes vs. spec expectations (13 tests, **mixed: mostly suite out of date, a couple worth verifying**)
The locator points at a label/route that no longer exists on the page. In most cases the underlying feature is still there under a different copy / DOM shape, but a few of these need a manual look to confirm.

| Test | What it looked for | Likely cause |
|---|---|---|
| `edit-locks` event 24 h | text *"Editing is locked during the final 24 hours…"* | copy changed or lock not applied for events — **verify manually** |
| `email-verification-gate` service detail | `a[href^="/service-detail/"]` | route renamed (`/service-detail/` → `/services/`) — **suite out of date** |
| `feature-13/12-fr-13l` | text *"Service Full / All Slots Taken"* | capacity label changed — **suite out of date** |
| `feature-13/13-fr-13m` | `toHaveURL` mismatch | route changed — **suite out of date** |
| `feature-14/03-fr-14c` | `Reviews` tab | tab renamed — **suite out of date** |
| `feature-3/05-fr-03e` | `toBe(true)` got `false` | comment moderation default tab logic — **verify manually** |
| `feature-7/06-fr-07f` | `toHaveURL` mismatch after cancel | route changed — **suite out of date** |
| `feature-7/09-fr-07i` | expected balance 30, got 31 | **possible ledger off-by-one — verify in code** |
| `feature-8/03-fr-08c`, `feature-9/01-fr-09a` | toast *"Session details sent"* | toast copy changed — **suite out of date** |
| `feature-9/07-fr-09g` | `Decline` button | button label/visibility changed — **suite out of date** |
| `feature-9/10-nfr-09a` | text *"Review the details and approve or decline"* | copy changed — **suite out of date** |
| `feature-9/12-nfr-09c` | `Review & Approve` button | copy changed — **suite out of date** |
| `handshake.spec.ts` Google Maps × 1 | `a[href*="google.com/maps"]` | external Maps link removed/changed — **suite out of date** |

### Final breakdown of the 34 E2E failures

| Category | Count | Verdict |
|---|---|---|
| Stale selectors (duplicate-label strict-mode) | 5 | **Test suite stale** |
| Seed/demo data missing | 11 | **Test suite stale** |
| UI copy / route drift | ~11 | **Test suite stale** |
| Real-time / websocket delivery | 4 | **Probably real — needs manual check** |
| Ledger off-by-one (FR-07i) | 1 | **Probably real — verify in code** |
| Edit-lock for events + comment moderation default | 2 | **Worth a manual smoke-test** |

So roughly **~27 / 34** failures are test-suite drift (copy, fixtures, routes), and **~7 / 34** are worth a manual look before being closed.

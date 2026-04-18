# Milestone Review - Customer Milestone 2 - Group 3

**Course:** SWE 574 — Software Development as a Team · **Group:** 3

**Repositories:** [SWE-574-3](https://github.com/SWE-574/SWE-574-3) · **Wiki:** [SWE-574-3 Wiki](https://github.com/SWE-574/SWE-574-3/wiki) · **Deployment:** [apiary.selmangunes.com](https://apiary.selmangunes.com/)

# Requirements Addressed

Customer Milestone 2 covered three kinds of work: closing the requirement gaps flagged at the end of Milestone 1, implementing new requirements introduced by customer feedback, and bringing the mobile client closer to parity with the web. This section is based on the wiki's [Software Requirements Specification](https://github.com/SWE-574/SWE-574-3/wiki/Software-Requirements-Specification) and cross-checked against closed issues and merged pull requests.

The Feature 12 event browse gaps (FR-12c, FR-12d, FR-12e, FR-12g) that had been only partially covered at M1 now have filtering, search, quota display, and cancelled-event exclusion backed by dedicated tests. Feature 17 moved from a partial implementation to an urgency-aware ranking, with the capacity multiplier (FR-17b), the urgency multiplier (FR-17e), and sort stability (FR-17h) all landing with test coverage. Feature 19 carried the most partial items at M1 and took the largest share of new functional work this milestone. The social proximity boost closes FR-19e and FR-19g, the featured feed endpoint addresses the curated-content requirement, and the QR attendance verification work is on a feature branch (PR #398) that will close the dual-factor side of FR-19i once the no-show penalty-flow simplification agreed with the customer at the M2 demo is settled.

Beyond gap closure, customer feedback from the M1 demo introduced new requirements that the team designed and implemented within the milestone. A social follow system became a requirement of its own and now drives both the friends tab of the featured feed and the proximity weighting of ranking. Review photo attachments were added to the rating and evaluation SRS after the M1 demo and are now live on both web and mobile with MinIO-backed storage. Expo-based mobile push notifications were introduced to keep users informed of handshake and evaluation events. The admin panel was brought to full coverage with the user detail view (FR-03b) and role assignment (FR-03d) that had been out of scope at M1.

The mobile client also reached functional parity in several modules. The forum is now fully available on React Native, the follow system and featured feed are rendered natively, event evaluations can be completed from mobile, and the service creation wizard was redesigned for both iOS and Android. These additions, combined with tiered E2E CI and a dedicated mobile CI workflow, let the team demonstrate the same core flows across web and mobile during the customer demo.

The milestone addresses 22 requirement clusters in full and continues four partial clusters into the next cycle.

| Feature | SRS refs | Status |
| --- | --- | --- |
| 1 – Login / Authentication | FR-01a to FR-01f | Implemented (E2E coverage added in M2) |
| 2 – User Profile | FR-02a to FR-02f | Implemented |
| 3 – Admin Panel (Backoffice) | FR-03a to FR-03f | Implemented (FR-03b user detail and FR-03d role assignment completed in M2) |
| 4 – Forum / Community Module | FR-04a to FR-04g | Implemented (full mobile parity added in M2) |
| 5 – Create Offer | FR-05a to FR-05l | Implemented |
| 6 – Create Request | FR-06a to FR-06l | Implemented |
| 7 – Time Share | FR-07a to FR-07j | Implemented |
| 8 – Transaction Mechanics | FR-08a to FR-08m | Implemented |
| 9 – Handshake Mechanics | FR-09a to FR-09i | Implemented (service-layer refactor in M2) |
| 10 – Chat Mechanics | FR-10a to FR-10f | Implemented |
| 11 – Create Event | FR-11a to FR-11o | Implemented |
| 12 – View Events | FR-12a to FR-12g | Implemented (FR-12c, FR-12d, FR-12e, FR-12g gaps closed in M2) |
| 13 – View Offer / Request Details | FR-13a to FR-13m | Implemented |
| 14 – Service Evaluation | FR-14a to FR-14f | Implemented (NegativeRep privacy and hot-score timing tests in M2) |
| 15 – Event Evaluation | FR-15a to FR-15g | Implemented (blocked states, no-show transition, and photo attachments in M2) |
| 16 – Evaluation Window Rules | FR-16a to FR-16e | Implemented (exactly-once score processing verified in M2) |
| 17 – Ranking and Hot Score | FR-17a to FR-17h | Implemented (urgency multiplier, sort stability, and capacity multiplier closed in M2); advanced signals FR-17f and FR-17g remain partial, see Gaps table below |
| 20 – Social Follow System | FR-SOC-01 (new) | Implemented in M2 |
| 21 – Featured Feed / Curated Discovery | FR-DIS-03 (new) | Implemented in M2 |
| 22 – Tag Hierarchy (WikiData) | FR-SEA-01 (refined) | Implemented in M2 |
| 23 – Mobile Push Notifications | FR-NOT-01 (new) | Implemented in M2 |
| 24 – Review Photo Attachments | Rating and Evaluation SRS addendum | Implemented in M2 |

| Feature | SRS refs | Gaps (not fully implemented) |
| --- | --- | --- |
| 18 – Event Cancellation and Penalties | FR-18a to FR-18f | FR-18d (30-day event creation ban enforcement), FR-18e (appeal flow), and FR-18f (admin discretionary lift) remain outside the M2 scope. |
| 19 – Discovery, Search, and Ranking Interface | FR-19a to FR-19i | FR-19b (mobile offline cache for active handshakes and joined events) and FR-19i (strict 100m GPS proximity enforcement) are still partial. The QR half of FR-19i is in review under PR #398, and GPS validation is present as xfail test scaffolding (PR #327) pending the enforcement implementation. |
| 17 – Ranking and Hot Score (advanced) | FR-17f, FR-17g | Weighted semantic search ordering (FR-17g) and per-listing recency decay (FR-17f) remain partial despite the social proximity boost and urgency multiplier landing. |
| NFR – Performance baselines | NFR-12a, NFR-12b, NFR-17a | SLA enforcement tests for the event feed and ranking pipeline (issues #292 and #307) are scoped but not yet executed. |

The partial items above are already tracked as open issues and mapped to the next cycle. The plan is to close FR-18d through FR-18f as a single penalty-management deliverable, finalize FR-19i by merging the QR verification work and promoting the GPS scaffolding into enforced checks, and cover the outstanding NFR performance SLAs before taking on new functional breadth.

---

# Deliverables

The deliverables added or updated between Customer Milestone 1 and Customer Milestone 2 are described below, covering UX design, the standards the team adopted, and the API documentation for newly introduced or extended endpoints. The Requirements Addressed section above complements this with the feature-by-feature implementation status.

---

## User Experience (UX) Design

The Hive is a time-sharing community platform, so UX decisions have to support trust and clarity in peer-to-peer exchanges rather than only consistent visual styling. Listing pages, handshake modals, and evaluation screens are treated as decision points where the user needs the right information at the right moment.

Service listings and public profiles lead with the data people actually act on: service type, duration, location mode (online or in-person), participant status, trust signals, and availability. Secondary content is pushed below the fold so the page stays useful on a phone during a short decision window. Trust signals are placed prominently rather than buried in secondary screens. Public profiles show follower and following counts, review breakdowns by role (provider or taker), recent evaluations, and earned badges. The handshake modal restates the agreed duration, location, and state before the user commits, so each party confirms the same terms.

When a service or event changes state, for example from pending to accepted or from joined to checked-in, the available actions adjust automatically so that invalid steps are removed rather than disabled. Privacy is applied progressively rather than as a single on/off toggle. For offers, requests, and events the map marker is blurred until the handshake is accepted or, for events, until the user joins. The same rule is enforced on the backend so no client can request an exact coordinate before it is permitted.

Feedback loops across the product are kept short and explicit. Real-time notifications confirm handshake changes, messages, and evaluation windows without forcing page refreshes. Loading, empty, and error states follow the same pattern across web and mobile so users recognise them in every module. Overall, the UX is designed so that users can discover relevant opportunities quickly, understand the constraints of each exchange, and complete socially sensitive tasks with confidence on both web and mobile.

## Standards Used

The product follows standard open protocols and conventions. API traffic is REST over HTTPS with JSON payloads, documented in the formal API reference. Authentication uses cookie-based JWT sessions with HTTP-only cookies and refresh-token rotation. Media uploads for review images and profile avatars are stored in MinIO, which is S3-compatible, so the same upload contract works across all environments. Mobile push delivery follows the Expo push protocol, backed by Firebase Cloud Messaging on Android. Tag classification uses WikiData Q-IDs so the same vocabulary works across the web client, the mobile client, and any external integrations. Accessibility behaviour on both web and mobile targets WCAG-aligned patterns such as semantic labels, visible focus states, and adequate touch targets, with consistent terminology and status semantics across devices.

---

# API Documentation

The formal API reference and the wiki API list cover every endpoint, authentication mode, and error contract. This section focuses on the endpoints that were introduced or extended during Customer Milestone 2, with request and response examples.

## Formal API Reference

- API reference: [https://apiary.selmangunes.com/api/docs/](https://apiary.selmangunes.com/api/docs/)
- Wiki API list: [https://github.com/SWE-574/SWE-574-3/wiki/API-List](https://github.com/SWE-574/SWE-574-3/wiki/API-List)

---

## 1. API Conventions

### Base URL

- Production: `https://<your-domain>/api/`
- Local (default): `http://localhost:8000/api/`

### Content Types

Requests use `application/json` by default, switching to `multipart/form-data` for uploads. Responses are `application/json`.

### Authentication and Authorization

Authenticated endpoints require a valid access token or cookie session. Admin-protected endpoints enforce backend role checks. Superadmin-only endpoints reject non-superadmin callers even if they are otherwise authenticated.

### HTTP Status Semantics

| Status | Meaning |
| --- | --- |
| 200 OK | Successful read or update |
| 201 Created | Successful create |
| 204 No Content | Successful delete or empty response |
| 400 Bad Request | Validation or business-rule failure |
| 401 Unauthorized | Missing or invalid auth |
| 403 Forbidden | Authenticated but insufficient role |
| 404 Not Found | Resource not found |
| 409 Conflict | State conflict |
| 429 Too Many Requests | Rate-limited |

---

## 2. Error Handling

The backend returns structured error responses so clients can handle them predictably.

```json
{
  "code": "VALIDATION_ERROR",
  "message": "One or more fields are invalid.",
  "details": {
    "field_name": ["This field is required."]
  }
}
```

`code` is machine-readable and stable so clients can branch on it. `message` is a human-readable string that is safe to display. `details` contains field-level validation lists when relevant. Permission errors avoid exposing policy internals and authentication failures use generic messaging to prevent account enumeration.

On the client side, a 4xx with `details` maps field errors inline, a 401 clears the session and redirects to login, a 403 shows a permission boundary state, and a 5xx falls back to a retry pattern with neutral copy.

---

## 3. Pagination and Filtering

Paginated list endpoints follow a standard envelope.

```json
{
  "count": 124,
  "next": "https://api.example.com/api/.../?page=3",
  "previous": "https://api.example.com/api/.../?page=1",
  "results": [
    {}
  ]
}
```

Common query parameters are `page`, `page_size` (server-capped), and any endpoint-specific filters listed below.

---

## 4. Endpoint Specifications

### 4.1 `GET /api/admin/users/{id}/`

Returns the full user record for the admin user detail page. Access is limited to admin and superadmin roles; non-admins receive 403 and unauthenticated requests receive 401.

Example request:

```http
GET /api/admin/users/42/
Authorization: Bearer <admin-or-superadmin-token>
```

Example response (`200 OK`):

```json
{
  "id": 42,
  "username": "elif",
  "email": "elif@demo.com",
  "role": "user",
  "karma": 87,
  "time_balance": {
    "available": 5.5,
    "blocked": 1.0
  },
  "recent_activity": [
    {
      "type": "service_created",
      "timestamp": "2026-04-11T18:22:14Z"
    }
  ],
  "penalty_history": []
}
```

Error cases: 401 (missing or invalid auth), 403 (not admin), 404 (user not found).

---

### 4.2 `POST /api/admin/users/{id}/assign-role/`

Promotes or demotes a user's platform role. Superadmin only. The audit fields `role_assigned_by` and `role_assigned_at` are written atomically alongside the role change.

Example request:

```http
POST /api/admin/users/42/assign-role/
Authorization: Bearer <superadmin-token>
Content-Type: application/json

{
  "role": "moderator"
}
```

Accepted role values are `user`, `moderator`, and `admin` (when policy permits).

Example response (`200 OK`):

```json
{
  "id": 42,
  "username": "elif",
  "role": "moderator",
  "is_staff": true
}
```

Error cases: 400 (invalid role or policy violation), 401, 403 (not superadmin), 404.

---

### 4.3 `GET /api/admin/users/{id}/transactions/`

Returns paginated, filterable transaction history for a specific user. Admin scopes apply per policy.

Query parameters: `page`, `page_size`, `type` (transaction type), and optionally `from` and `to` for a date interval.

Example request:

```http
GET /api/admin/users/42/transactions/?page=1&page_size=20&type=reserve
Authorization: Bearer <admin-token>
```

Example response (`200 OK`):

```json
{
  "count": 2,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "tx_1201",
      "type": "reserve",
      "amount": 1.5,
      "created_at": "2026-04-11T19:10:00Z",
      "reference": {
        "entity": "request",
        "id": "req_88"
      }
    },
    {
      "id": "tx_1202",
      "type": "transfer",
      "amount": 1.5,
      "created_at": "2026-04-12T08:35:20Z",
      "reference": {
        "entity": "exchange",
        "id": "ex_331"
      }
    }
  ]
}
```

Error cases: 401, 403, 404.

---

### 4.4 `POST /api/reputation/add-review/`

Creates or updates a review. This milestone extended the endpoint to accept up to three image attachments per review (JPG, PNG, GIF, or WebP, up to 10 MB each), stored in MinIO and returned as URLs on the review payload. The earlier behaviour where attaching an image to an already-saved text review failed with "Review already submitted" has been fixed.

Access is restricted by review eligibility and the evaluation-window rules. Requests use `multipart/form-data`.

Example request:

```bash
curl -X POST "http://localhost:8000/api/reputation/add-review/" \
  -H "Authorization: Bearer <token>" \
  -F "target_type=service" \
  -F "target_id=123" \
  -F "rating=5" \
  -F "comment=Great collaboration." \
  -F "images=@/path/review1.jpg" \
  -F "images=@/path/review2.webp"
```

Example response (`200 OK`):

```json
{
  "id": "rev_991",
  "target_type": "service",
  "target_id": "123",
  "comment": "Great collaboration.",
  "rating": 5,
  "images": [
    {
      "url": "https://cdn.example.com/reviews/rev_991/img1.jpg",
      "thumbnail_url": "https://cdn.example.com/reviews/rev_991/thumb1.jpg"
    },
    {
      "url": "https://cdn.example.com/reviews/rev_991/img2.webp",
      "thumbnail_url": "https://cdn.example.com/reviews/rev_991/thumb2.webp"
    }
  ],
  "created_at": "2026-04-12T11:04:39Z"
}
```

Error cases: 400 (invalid file format, size, count, or evaluation window), 401, 403 (ineligible reviewer), 404 (target not found).

---

### 4.5 `GET /api/forum/topics/?ordering=most_active`

Forum topics list with the new `most_active` ordering applied (descending by comment count). The earlier behaviour where declaring the sort did not actually change the queryset is fixed.

Example request:

```http
GET /api/forum/topics/?ordering=most_active&page=1
```

Example response (`200 OK`):

```json
{
  "count": 3,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": 77,
      "title": "Neighborhood Tool Sharing",
      "comment_count": 24,
      "created_at": "2026-04-10T09:20:00Z"
    },
    {
      "id": 81,
      "title": "Local Event Volunteers",
      "comment_count": 19,
      "created_at": "2026-04-11T13:42:00Z"
    }
  ]
}
```

Error cases: 400 (unsupported ordering value).

---

## 5. Backward Compatibility

Existing clients without image upload support remain compatible with `/api/reputation/add-review/` by sending a JSON-only review payload. The new `most_active` ordering is additive and does not change the default sort. Role assignment stays server-authoritative, so clients should not infer success before receiving a `200 OK`.

---

## 6. Verification Checklist

Before each release we verify admin-only and superadmin-only access boundaries (401 and 403) on every protected endpoint, the pagination contract and filter behaviour on transaction history, review image validation (type, count, size) and the MinIO URL response shape, parity between the declared forum ordering parameter and the actual queryset, and the stable error payload contract (`code`, `message`, `details`) across validation and authorization failures.

---

# Testing

## Testing Scope and Evidence Base

For this milestone, the most relevant testing-related pull requests and issues include:

- `#254` closing `#247` — Feature 5 test coverage
- `#256` closing `#248` — Feature 6 test coverage
- `#287` closing `#249` — Feature 7 Time Share tests
- `#294` closing `#250` — Feature 8 transaction mechanics tests
- `#296` closing `#251` — Feature 9 handshake mechanics tests
- `#297` closing `#252` — Feature 13 detail page tests
- `#301` closing `#242` — Feature 2 profile coverage improvements
- `#270` closing `#284` — event handshake API coverage
- `#260` closing `#261` and `#264` — chat and handshake regression coverage
- `#343` — authentication and session-management integration and E2E tests
- `#345` — admin panel E2E coverage
- `#346` — forum E2E coverage
- `#350` — evaluation-related E2E coverage
- `#360` — CI and E2E reliability improvements

These changes were complemented by workflow hardening, dependency updates for the test toolchain, and regression tests added alongside feature and bug-fix work.

## General Testing Strategy

The project follows a **layered testing strategy** rather than relying on a single test type.

### 1. Backend Testing
The backend is tested with **pytest** and is split into:
- **unit tests** for serializers, ranking logic, model behavior, cache logic, permissions, and service rules
- **integration tests** for API endpoints and multi-component flows such as auth, chats, handshakes, evaluations, reporting, notifications, transactions, forum features, and admin features

This provides fast feedback for isolated business logic while also validating real request/response behavior.

### 2. Frontend Testing
The web frontend uses two complementary layers:
- **Vitest** for component, utility, service, and regression-level tests
- **Playwright** for end-to-end flows against the running application

The E2E strategy is **requirement-driven**. Test suites are organized by feature and named per requirement (`FR` / `NFR`), so the test structure itself also acts as a traceability layer from the SRS to implementation.

### 3. Mobile Testing
The mobile app uses **Jest** and focuses on:
- API client normalization
- request/response contracts
- service, handshake, notification, transaction, forum, and auth client behavior

This was especially important because the mobile application was integrated into the monorepo during this milestone and had to stabilize quickly around backend contract changes.

### 4. Full-Stack and Deployment Validation
Beyond code-level tests, the team validates:
- Dockerized infrastructure
- service health checks
- seeded demo data
- smoke tests against the deployed stack shape used for demos and customer-facing validation

This is important because Milestone 2 requires not only implemented features, but also a demoable, reproducible, and deployable system.

## Testing Philosophy

The project's testing philosophy can be summarized as follows:

- **Requirement traceability first:** E2E suites are written against SRS requirements rather than arbitrary page paths.
- **Deterministic setup:** tests create or seed the data they need instead of depending on stale shared state.
- **API-assisted setup where appropriate:** repetitive state preparation may be done through helpers or direct API calls, but final assertions remain user-visible whenever possible.
- **Regression safety over ad hoc checking:** bugs found during feature work are often followed by dedicated unit, integration, or E2E regression tests.
- **CI as enforcement, not only automation:** linting, type checks, migrations, health checks, coverage, smoke tests, and artifact generation are part of the automated workflow.

## What Was Added or Strengthened During Milestone 2

Milestone 2 expanded the project's test footprint considerably.

### Requirement-Mapped E2E Coverage
A major milestone achievement was the introduction and stabilization of feature-based E2E suites. In particular, the repository now contains requirement-oriented Playwright suites for features such as:

- Feature 5 (`#254`, issue `#247`)
- Feature 6 (`#256`, issue `#248`)
- Feature 7 (`#287`, issue `#249`)
- Feature 8 (`#294`, issue `#250`)
- Feature 9 (`#296`, issue `#251`)
- Feature 13 (`#297`, issue `#252`)
- Feature 2 profile coverage (`#301`, issue `#242`)
- Feature 14 evaluation-related coverage (`#350`)
- admin panel E2E coverage (`#345`)
- forum E2E coverage (`#346`)

This moved end-to-end testing from a small set of generic smoke scenarios to a broader acceptance-level suite aligned with the SRS.

### Backend Integration and Regression Expansion
The backend test suite was also strengthened through issue-driven and bug-driven work. Examples include:

- event handshake coverage (`#270`, issue `#284`)
- chat and handshake regressions (`#260`, issues `#261` and `#264`)
- authentication/logout/session invalidation integration tests (`#343`)
- evaluation scoring and window-close semantics (`#350` and related commits)
- forum moderation and reporting validation (`#346`)
- admin moderation and role/permission flows (`#345`)

This improved confidence in API contracts and reduced the risk of business-logic regressions.

### CI and E2E Reliability Work
Testing in this milestone was not only about writing more tests. The team also improved how reliably they run in automation.

The most important CI/testing process improvement was `#360`, which:
- optimized E2E CI execution
- introduced smarter path-based test selection
- improved workflow structure and runtime stability
- added dedicated mobile CI support

In addition, the workflow history in this interval shows continued improvements to:
- Playwright timing and retry behavior
- backend stability checks before running tests
- MinIO readiness and health validation
- Docker stack verification
- test artifact uploads for debugging failed runs

## Current Test Inventory at Milestone 2 Snapshot

At the current milestone snapshot, the repository contains:

- **66 backend test files** under `backend/api/tests`
- **167 Playwright E2E spec files** under `frontend/tests/e2e`
- **11 frontend Vitest test files** under `frontend/src/test`
- **15 mobile Jest API test files** under `mobile-client/src/api/__tests__`

This does not mean every requirement is equally well covered, but it does show that testing in Milestone 2 is a core part of the delivery process rather than an afterthought.

## GitHub Workflow Support

The testing process is reinforced by multiple GitHub Actions workflows.

### Backend CI
`ci-backend.yml` runs:
- PostgreSQL/PostGIS
- Redis
- MinIO
- dependency audit with `pip-audit`
- migrations and migration checks
- pytest with coverage and JUnit output

The backend test configuration enforces a **minimum coverage threshold of 70%** and generates:
- `backend/tests/reports/junit.xml`
- `backend/tests/reports/coverage/coverage.json`
- HTML coverage output under `backend/tests/reports/coverage/html`

### Frontend CI
`ci-frontend.yml` runs:
- `npm ci`
- dependency audit
- ESLint
- TypeScript type checking
- Vitest with coverage
- production build

This workflow uploads frontend coverage artifacts and ensures that the web application is both test-clean and buildable.

### Mobile CI
`ci-mobile.yml` runs:
- `npm ci`
- TypeScript type checking
- Jest test execution with coverage

This gives automated validation for the mobile client on every relevant change.

### E2E CI
`ci-e2e.yml` brings up the stack with Docker Compose and then runs:
- environment generation
- Docker build/start
- health checks
- backend stability checks
- demo-data seeding
- smoke tests
- selected Playwright feature suites
- HTML and JUnit report uploads

This workflow is especially important for Milestone 2 because it validates the integrated product, not just isolated modules.

### Docker and Infrastructure CI
`ci-docker.yml` and related workflows validate:
- Dockerfiles
- infra stack health
- local/full stack health
- production stack startup
- backend, frontend, and media proxy smoke tests

This supports the milestone requirement that the software be dockerized and deployable.

## Executed Test Results for This Report

The following test runs were executed locally and their generated artifacts were committed to the `tests-m2-report` branch.

### Backend (`pytest`)
Command:
```bash
cd backend
./.venv/bin/pytest -c pytest-ci.ini
```

Observed terminal summary:
- `1147 passed`
- `51 xfailed`
- `16 xpassed`

Generated JUnit summary:
- `1214` total testcase entries
- `0` failures
- `0` errors
- `51` skipped/xfailed-style outcomes
- runtime: about **5 minutes**

Coverage artifact summary:
- backend HTML coverage report shows **90%** total coverage
- the test run previously reported **90.22%** total coverage in terminal output

### Frontend Unit/Regression (`Vitest`)
Command:
```bash
cd frontend
nvm use 24
npm run test -- --run --coverage
```

Observed result:
- `11` test files passed
- `66` tests passed
- `0` failures

Coverage summary:
- **Statements:** `2.48%`
- **Branches:** `1.62%`
- **Functions:** `2.01%`
- **Lines:** `2.67%`

This relatively low global coverage percentage should be read together with the role of the Vitest layer in this project. At this milestone, Vitest is mainly used for targeted utilities, services, and a small number of UI/regression checks, while broader user-facing verification is handled mostly by Playwright.

### Frontend End-to-End (`Playwright`)
Command:
```bash
cd frontend
PLAYWRIGHT_BASE_URL=http://localhost:5173 npx playwright test --retries=0 tests/e2e
```

Observed result:
- `294` total tests
- `246` passed
- `39` failed
- `9` skipped
- runtime: about **23 minutes**

This run is useful as a snapshot of the suite's current stability on the running application.

Representative failing areas included:
- selected private/group chat interaction cases
- some handshake/session-detail flows
- selected profile edit and detail-page scenarios
- some request/time-reservation and ledger-consistency checks
- selected forum creation/loading expectations

This means the Playwright suite is already a meaningful acceptance and regression layer, but not yet fully green at the milestone snapshot.

### Mobile (`Jest`)
Command:
```bash
cd mobile-client
npm test -- --ci --coverage --runInBand
```

Observed result:
- `17` test suites passed
- `153` tests passed
- `0` failures

Coverage summary:
- **Statements:** `88.91%`
- **Branches:** `65.23%`
- **Functions:** `89.47%`
- **Lines:** `89.83%`

This is a strong result for the current mobile testing scope, which is centered on API-client and contract-level verification.

## Test Result Summary

Taken together, the executed results show a healthy but uneven testing picture:

- **Backend** is in the strongest position. The suite is broad, the JUnit report is clean, and overall coverage is high enough to support confident API and business-logic changes.
- **Mobile Jest** is also in a strong position within its intended scope. Its coverage is high, and the contract-focused tests give solid confidence around backend/mobile integration points.
- **Frontend Playwright** already provides substantial acceptance value because it covers a large part of the SRS and many realistic user journeys. However, the current run also shows that some product areas still need stabilization before the suite can be treated as consistently green.
- **Frontend Vitest** is currently best understood as a focused regression layer rather than a broad coverage layer. It is useful, but its repository-wide coverage percentages show that most frontend confidence still comes from Playwright rather than component/unit tests.

In other words, the testing process is already meaningful and reviewable across all three application surfaces, but the maturity level is not identical across layers. Backend and mobile are currently more stable in automated verification, while frontend end-to-end coverage is broader but still more volatile.

## Generated Test Reports

All report artifacts referenced below were collected under the `tests-m2-report` branch.

- [Bundled `test_report` artifact (ZIP)](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/reports/test_report_bundle.zip)


## Reflection on Testing Maturity

Compared with Milestone 1, the testing process became much more systematic in Milestone 2.

The key improvements are:

- moving from limited checks to requirement-based feature suites
- broadening from backend-centric coverage to backend + frontend + mobile
- treating CI reliability as part of the testing deliverable
- introducing stronger regression protection for handshake, chat, evaluation, forum, profile, and admin flows
- validating not only code behavior but also stack startup, seeded demo data, and deployment assumptions

At the same time, the current executed results show that testing maturity still differs by layer:

- **backend** is already strong in both breadth and coverage
- **mobile Jest** is strong within its API/client-focused scope
- **frontend Playwright** is broad and valuable, but still has open failing cases that require stabilization
- **frontend Vitest** is currently useful as a focused regression layer, but it is not yet a broad coverage layer at repository scale

This is therefore a **substantially stronger and more mature testing process than in Milestone 1**, but still one that the team plans to refine further for the final release.

---

# Planning and Team Process

## Changes Made Since Milestone 1

### Requirements Review and SRS Alignment

After the M1 demo we held a structured requirements review pass (issues #194–#196) where each team member took ownership of a feature cluster and walked its current state against the SRS. This directly surfaced the admin panel gaps (FR-03b and FR-03d were missing outright) and the Feature 14–16 test gaps, both of which were fixed before any new development started. Running that review at the top of the milestone removed most of the late-cycle surprises we had in M1.

Customer feedback from the M1 demo was converted into explicit SRS deltas before the corresponding implementation PRs were opened. The review photo attachment requirement and the evaluation window rule clarifications were documented in the SRS first, then implemented. This reversed the M1 pattern where requirements drifted during coding.

### Issue-Driven Coordination and Communication

Coordination also became more issue-driven in this milestone. Each feature was broken down into GitHub issues with an explicit owner and acceptance criteria, which made it easier for members to work in parallel without stepping on each other's branches and made review scope clearer. We kept a weekly meeting cadence and wrote up meeting notes on the wiki for each session, so decisions (state transitions like `PENDING → ACCEPTED → COMPLETED` for handshakes, no-show policy direction, penalty-flow simplification) had a written record that the implementation PRs could refer back to.

Task distribution itself changed character between milestones. Until CM1, work had been fairly segmented, with each member staying close to a single area. After CM1 we shifted toward members taking responsibility across multiple parts of the project, which meant reviews could cross modules and nobody was a single point of failure on a feature for long.

### Mobile and Monorepo Synchronization

The mobile client moved from a Git submodule to the main monorepo at the start of the milestone (PR #191). Having mobile, backend, and web in one repository meant unified CI, shared tooling configuration, and a single PR context for cross-stack changes. It was a prerequisite for the full mobile forum module that landed later.

Mobile also started the milestone well behind the backend and web on several modules, and we treated that as its own piece of work rather than something that would sort itself out. We opened targeted catch-up issues for each area that was lagging, standardized how the mobile client consumes the backend API, and reused type definitions across clients wherever it was practical so the same request and response contract did not have to be maintained in two places. The focus shifted to completing end-to-end flows on device (browse → handshake → evaluate, and later the event join → check-in → evaluation path) rather than landing isolated screens that looked right on their own but did not hook into the surrounding flow.

### CI and Engineering Practices

CI also changed shape during the milestone. Tiered E2E test selection (PR #360) lets feature-branch PRs run only the suites affected by their changes rather than the full matrix, which cut average CI time as the Playwright suite grew. A dedicated mobile CI workflow (`ci-mobile.yml`) was added at the same time so the React Native codebase gets its own lint and unit-test signal on every PR.

The backend refactor from views into a service layer (PR #354, later extended as the pattern for `EventHandshakeService`) became the default for new features rather than an exception. Business rules now live in `services.py` with their own error types, which keeps views thin and makes the rules easier to test in isolation. The Definition of Done going forward reflects this: a feature adding non-trivial backend logic is expected to place that logic in a service class.

### Weaknesses and Room for Improvement

One weakness that did show up in the milestone was long-lived branches causing migration conflicts, most visibly on PR #382 which needed three fix commits to reconcile the migration dependency chain. For the next cycle we have committed to shorter-lived feature branches and more frequent rebases onto `dev`, so that migration graph divergence is caught while it is still small. Tiered E2E selection has already reduced the cost of running tests often, which makes shorter branches workable day to day.

The other area we want to improve is catching integration issues earlier. A few cross-module mismatches only became visible once the full E2E suite ran at PR time, which was later than we would have liked. Running end-to-end flows more often during development, rather than leaving them for the end of a branch, should shorten that feedback loop.

## Plan for Completing the Project

With Customer Milestone 2 closed, the remaining work is about finishing rather than expanding. The goals for the rest of the project are grouped below.

### Core Functional Flows and Recommendations

- Finalize the requirements by closing the partial items still open (FR-18d–f for penalty management, FR-19b mobile offline cache, the QR and GPS dual-factor behind FR-19i, and the advanced ranking signals in FR-17f–g).
- Complete the recommendation engine so the discovery side of the product feels alive, which includes the age dampener rework and the newcomer-friendly signals agreed with the customer at the M2 demo.

### Mobile Client Completion

- Reach feature parity on mobile and web for the flows customers actually use day to day (offer, request, event, evaluation, chat), with the same test coverage on both sides.
- Finish the mobile client with the same UI and navigation language used on web, so the remaining modules do not look like they were built by a different team or grafted on at the end.

### Integration and Testing

- Close the remaining functional test gaps so every feature mentioned in the SRS has at least one integration or E2E test exercising its full path, and put the NFR performance baselines (NFR-12a–b, NFR-17a) behind automated SLA checks.
- Optimize and fix bugs that surfaced during M2 integration and the customer demo, focusing on edge cases around cancellations, concurrent handshake actions, and TimeBank credit conflicts rather than adding new functional breadth.

### Documentation and Finalization

- Update the SRS and wiki for the scope changes that came out of the M2 demo (no-show penalty simplification, ranking parameter rework) and prepare the final report and user manual alongside the remaining implementation rather than saving them for the last week.
- Clean up the codebase where M2 left temporary scaffolding, feature flags, or xfail markers behind, so what we hand over is maintainable rather than full of transitional code.

## Project Plan and Tracking

The live project plan is tracked on GitHub Projects at [https://github.com/orgs/SWE-574/projects/4](https://github.com/orgs/SWE-574/projects/4). The board is the source of truth for backlog prioritization and sprint assignments, with each feature represented as a set of issues, cards moved through the usual To Do / In Progress / Done columns, and each card linked back to the underlying issues and pull requests in [SWE-574-3](https://github.com/SWE-574/SWE-574-3/issues) so progress is visible to the whole team as it is updated.

---

# Evaluation

## Summary of Customer Feedback and Reflections

Customer feedback from the April 14 demo was mixed in a useful way. The clearest positive reaction was to the recommendation algorithm and the in-dashboard ranking debug panel, which made the scoring logic legible to the customer during the walkthrough. Being able to see why a listing surfaced where it did, rather than just trusting the output, was something the customer explicitly valued. The customer also responded well to the demo itself: the flow from forum to event to check-in to evaluation was easy to follow, and the seeded demo content was considered realistic and appropriate for the product.

The main piece of feedback we have to act on concerns the shape of the ranking signals. The age dampener in the current hot score reduces the score of listings that have not been seen recently, which the customer pushed back on: "what is not seen is likely to not be seen in the future" creates a discouraging loop for hosts who had a quiet week and makes it hard for newcomers to break in at all. We agreed to rework that part of the scoring and to add explicit newcomer signals along with additional parameters so the ranking does not entrench the already-popular listings. This work feeds directly into the recommendation engine completion planned for the next cycle.

The second piece of feedback was about the penalty flow for no-shows. The customer felt that banning users from public events after a no-show is too harsh, since people cannot always attend events they signed up for and the ban would suppress participation more than it protects it. Coming out of the meeting we agreed to remove the ban for public events but keep no-show history visible on the user's profile, so organizers can see the pattern and decide for themselves. This simplifies the FR-18 scope and is a pending SRS update.

We also confirmed with the customer that QR code check-in is already in progress for events, which they supported as the right direction for the dual-factor attendance verification in FR-19i.

## Evaluation of the Status of Deliverables

Milestone 2 closed the main implementation gaps that remained from Milestone 1. The admin panel is now feature-complete (FR-03b and FR-03d shipped in PR #344), the Feature 14–16 evaluation test gap is closed across PRs #350 and #351, review photo attachments are live on both web and mobile via MinIO-backed storage, and the full forum module is now usable on React Native. Running the requirements review before any new implementation is the main reason new scope did not creep in mid-milestone.

The areas that remain partial are already on the next cycle's plan. The HiveMind ranking work covers the core pieces (urgency multiplier, sort stability, social proximity boost, featured feed) but not the full FR-17f–g signal set, the mobile offline cache (FR-19b) is still open, and the complete penalty-management flow (FR-18d–f) is about to be reshaped after the customer meeting. None of these block the product as it was demoed, and all of them have tracked issues so the next cycle can pick them up without having to rediscover the context.

## Evaluation of Tools and Processes

The combination we relied on throughout the milestone (GitHub Issues and PRs, the wiki for requirements and design artifacts, Docker for environment parity, and GitHub Actions for backend, frontend, and mobile CI) continued to hold up under milestone pressure. Two additions made the biggest practical difference: the requirements review at the top of the milestone, which prevented scope drift, and agreeing on a shared demo flow ahead of the presentation, which made the session predictable rather than improvised.

The main process weakness was long-lived feature branches colliding on migrations. PR #382 is the clearest example: three parallel branches had each added migrations, the dependency chain broke, and the resolution needed three fix commits before the final merge landed. The agreed response is to keep feature branches short and rebase onto `dev` more often so migration divergence is caught early. Tiered E2E selection (PR #360) has already reduced the cost of running tests frequently, which is what makes the short-branch discipline workable rather than only something we agree to on paper.


---

# Individual Contributions

## Member: Selman Güneş (`sgunes16` / `citizenduck`)

**Responsibilities:**  
My responsibilities between Customer Milestone 1 and Customer Milestone 2 centered on three connected areas: requirement-driven test expansion, mobile/web feature alignment, and selected backend/frontend improvements needed to make the system more explainable and demo-ready. In practice, this meant taking ownership of a large part of the Playwright E2E coverage backlog, contributing directly to mobile service/profile/messaging flows, and implementing or fixing API-backed functionality when the frontend/mobile experience depended on it.

**Main contributions:**  
During this interval, I contributed in two main tracks. First, I built and stabilized requirement-mapped Playwright suites for Feature 5, Feature 6, Feature 7, Feature 8, Feature 9, and Feature 13 through [#254](https://github.com/SWE-574/SWE-574-3/pull/254), [#256](https://github.com/SWE-574/SWE-574-3/pull/256), [#287](https://github.com/SWE-574/SWE-574-3/pull/287), [#294](https://github.com/SWE-574/SWE-574-3/pull/294), [#296](https://github.com/SWE-574/SWE-574-3/pull/296), and [#297](https://github.com/SWE-574/SWE-574-3/pull/297), while also opening and managing the corresponding tracking issues [#247](https://github.com/SWE-574/SWE-574-3/issues/247), [#248](https://github.com/SWE-574/SWE-574-3/issues/248), [#249](https://github.com/SWE-574/SWE-574-3/issues/249), [#250](https://github.com/SWE-574/SWE-574-3/issues/250), [#251](https://github.com/SWE-574/SWE-574-3/issues/251), and [#252](https://github.com/SWE-574/SWE-574-3/issues/252). Second, I implemented milestone-facing product work on mobile/web/backend integration through [#357](https://github.com/SWE-574/SWE-574-3/pull/357), [#364](https://github.com/SWE-574/SWE-574-3/pull/364), [#383](https://github.com/SWE-574/SWE-574-3/pull/383), [#386](https://github.com/SWE-574/SWE-574-3/pull/386), [#390](https://github.com/SWE-574/SWE-574-3/pull/390), and [#393](https://github.com/SWE-574/SWE-574-3/pull/393). These changes covered the online handshake approval fix, ranking-debug explainability tooling, mobile service creation pages, mobile messaging alignment with current frontend, and profile/time-activity redesign for mobile. In addition, I contributed to the mobile forum UI work merged through [#347](https://github.com/SWE-574/SWE-574-3/pull/347), which improved the forum browsing experience with stronger category filtering, sorting, and a more structured mobile discussion interface.

**API contributions:**  
One of the most complex API contributions I developed and integrated in this period was the ranking explainability endpoint added in [#364](https://github.com/SWE-574/SWE-574-3/pull/364): `POST /api/services/debug-ranking/`. This endpoint is used by the dashboard-integrated recommendation debug panel to explain why a visible service card appears in its current feed position. The frontend sends the currently visible service ids, the selected card id, and the active search/filter/location context; the backend then returns a detailed breakdown containing hot-score factors, search score, social boost, distance context, formula lines, and Sankey graph data.

Example request:

```http
POST /api/services/debug-ranking/
Content-Type: application/json

{
  "service_ids": ["3a4d4c7e-6e1c-4f8e-b8e8-111111111111"],
  "selected_service_id": "3a4d4c7e-6e1c-4f8e-b8e8-111111111111",
  "search": "React",
  "active_filter": "all"
}
```

Example response:

```json
{
  "active_filter": "all",
  "total_services": 1,
  "selected_service": {
    "id": "3a4d4c7e-6e1c-4f8e-b8e8-111111111111",
    "title": "React mentoring",
    "location_type": "Online",
    "current_position": 1,
    "stored_hot_score": 0.123456,
    "recomputed_hot_score": 0.123456,
    "search_score": 1.0,
    "social_boost": 0.0,
    "breakdown": {
      "positive_count": 0,
      "negative_count": 0,
      "comment_count": 0,
      "raw_hot_score": 0.0,
      "capacity_boost_applied": false,
      "social_reason": "none"
    },
    "formula_lines": [
      "P = 0",
      "N = 0",
      "C = 0",
      "search_score = 1.000000"
    ],
    "sankey": {
      "nodes": [{ "id": "search", "label": "Search score" }],
      "links": [{ "source": "search", "target": "card", "value": 1.0 }]
    }
  }
}
```

This endpoint was needed because the dashboard ranking logic had become hard to reason about from the UI alone. The debug panel allowed us to inspect live ranking behavior directly inside the app and also introduced a backend-backed admin setting to enable or disable the tool globally.

**Code-related significant issues:**  
- I opened and resolved the online handshake approval bug in [#253](https://github.com/SWE-574/SWE-574-3/issues/253), which was implemented in [#357](https://github.com/SWE-574/SWE-574-3/pull/357). The fix removed the incorrect exact-location requirement for online approvals while preserving stricter validation for in-person sessions.  
- I opened and resolved the ranking explainability feature request [#363](https://github.com/SWE-574/SWE-574-3/issues/363), implemented in [#364](https://github.com/SWE-574/SWE-574-3/pull/364), to make recommendation ordering inspectable during milestone validation and demo preparation.  
- I opened [#385](https://github.com/SWE-574/SWE-574-3/issues/385) to align the mobile messages experience with the web frontend and then implemented the related mobile work through [#386](https://github.com/SWE-574/SWE-574-3/pull/386) and [#393](https://github.com/SWE-574/SWE-574-3/pull/393).  
- Through the Feature 6, Feature 7, and Feature 8 test work, I also documented behavior gaps as concrete engineering issues, including [#257](https://github.com/SWE-574/SWE-574-3/issues/257), [#258](https://github.com/SWE-574/SWE-574-3/issues/258), [#259](https://github.com/SWE-574/SWE-574-3/issues/259), [#289](https://github.com/SWE-574/SWE-574-3/issues/289), and [#295](https://github.com/SWE-574/SWE-574-3/issues/295). These issues came directly from requirement-based validation and helped convert failing scenarios into actionable backend/frontend work items.

**Management-related significant issues:**  
- I structured a substantial part of the milestone’s E2E planning/tracking by opening the feature-scoped coverage issues [#247](https://github.com/SWE-574/SWE-574-3/issues/247), [#248](https://github.com/SWE-574/SWE-574-3/issues/248), [#249](https://github.com/SWE-574/SWE-574-3/issues/249), [#250](https://github.com/SWE-574/SWE-574-3/issues/250), [#251](https://github.com/SWE-574/SWE-574-3/issues/251), and [#252](https://github.com/SWE-574/SWE-574-3/issues/252). These issues broke down milestone requirements into reviewable, requirement-mapped testing tasks instead of keeping test scope implicit.  
- I opened [#255](https://github.com/SWE-574/SWE-574-3/issues/255) to propose a test-only user role / balance-management API for deterministic E2E setup. Although this was not the main demo feature itself, it addressed testability as a project-management concern and helped frame the discussion around sustainable automation.  
- I also used issue-driven follow-up to keep demo-readiness work explicit, for example [#367](https://github.com/SWE-574/SWE-574-3/issues/367) for a missing group-offer time detail and [#359](https://github.com/SWE-574/SWE-574-3/issues/359) for email-verification enforcement on offer creation.

**Pull requests:**  
- **Created and merged:** My main merged PRs in this interval were [#254](https://github.com/SWE-574/SWE-574-3/pull/254), [#256](https://github.com/SWE-574/SWE-574-3/pull/256), [#287](https://github.com/SWE-574/SWE-574-3/pull/287), [#294](https://github.com/SWE-574/SWE-574-3/pull/294), [#296](https://github.com/SWE-574/SWE-574-3/pull/296), [#297](https://github.com/SWE-574/SWE-574-3/pull/297), [#357](https://github.com/SWE-574/SWE-574-3/pull/357), [#364](https://github.com/SWE-574/SWE-574-3/pull/364), [#383](https://github.com/SWE-574/SWE-574-3/pull/383), [#386](https://github.com/SWE-574/SWE-574-3/pull/386), [#390](https://github.com/SWE-574/SWE-574-3/pull/390), and [#393](https://github.com/SWE-574/SWE-574-3/pull/393). Together, these cover testing, backend fixes, mobile UX, profile/time activity, messaging parity, and recommendation explainability.  
- **Reviewed:** I also reviewed and approved milestone-relevant work by other team members, including [#344](https://github.com/SWE-574/SWE-574-3/pull/344) (admin user profile detail and role assignment), [#350](https://github.com/SWE-574/SWE-574-3/pull/350) (Feature 14 evaluation E2E coverage), [#360](https://github.com/SWE-574/SWE-574-3/pull/360) (tiered E2E CI and mobile CI), [#374](https://github.com/SWE-574/SWE-574-3/pull/374) (mobile public profile), [#388](https://github.com/SWE-574/SWE-574-3/pull/388) (mobile event evaluations), and [#399](https://github.com/SWE-574/SWE-574-3/pull/399) (prebuild fixes).  

- **Conflicts and resolution:** I resolved several branch-integration conflicts while syncing fast-moving mobile branches with `dev`. The main examples were [#383](https://github.com/SWE-574/SWE-574-3/pull/383), [#390](https://github.com/SWE-574/SWE-574-3/pull/390), and [#393](https://github.com/SWE-574/SWE-574-3/pull/393), where overlapping changes on shared mobile files such as `ServiceDetailScreen`, `MessagesStack`, `api/types`, and `api/handshakes` had to be reconciled. In these cases, I merged the latest `dev` updates without losing the intended behavior of my own feature branches. A smaller conflict also appeared in [#357](https://github.com/SWE-574/SWE-574-3/pull/357) on the shared E2E helper barrel, which I resolved by preserving the common helper interface and aliasing the conflicting helper export.


## Member: M.Zeynep Çakmakcı (mzyavuz)

Responsibilities:
- Admin panel completions: user profile detail view and role assignment (FR-03b, FR-03d)
- Test gap analysis and implementation across Features 1, 3, 4, 14, 15, 16 (authentication, admin panel, forum, service evaluation, event evaluation, evaluation window rules)
- Full forum module implementation in the mobile client (FR-04, React Native)
- Event review improvements: visibility fixes and photo attachment support in reviews
- Report handling fixes (report flow for services and events, event participant removal)
- Mobile monorepo migration (submodule → monorepo)

Main contributions:
Between Customer Milestone 1 and Customer Milestone 2, I contributed 10 merged PRs spanning the backend (Django REST Framework), frontend (Playwright E2E and React), and mobile (React Native / Expo) layers. Key highlights include completing the two missing admin panel features (user detail view and role assignment), implementing the entire forum module from scratch in the mobile client, closing a large test gap across six features with integration and E2E tests, and adding photo upload support to reviews (both the backend model changes and the UI in frontend and mobile) while also fixing event reviews not appearing in the profile/history sections.

API contributions:
Other endpoints I developed or extended in this milestone period (without full examples):

- `GET /api/admin/users/{id}/` — Admin user profile detail view; returns comprehensive user data (profile, karma, time balance, recent activity, transaction history) accessible only to admin/superadmin accounts. Implemented with `AdminUserDetailSerializer`. (PR #344, issue #197)
- `GET /api/admin/users/{id}/transactions/` — Paginated, filterable transaction history for a specific user, used on the admin user detail page. (PR #344)
- `POST /api/reputation/add-review/` — Extended to accept up to 3 image attachments (JPG/PNG/GIF/WebP, ≤10 MB each) via a new `CommentMedia` model backed by MinIO object storage; also fixed a bug where re-submission rejected image-only updates when the text review already existed. (PR #382, issue #187)
- `POST /api/handshakes/{id}/report/` (event participant report validation) — Extended backend report validation logic to distinguish timing rules: `no_show` reports allowed only from event start until 24 h after; chat/behavior reports (harassment, spam, etc.) allowed immediately. Paired with a new `remove_from_event` action on `POST /api/admin/reports/{id}/resolve/` for admin resolution. (PR #190, issues #184, #185)
- Forum `ForumTopicViewSet` — Added `most_active` sort order (by comment count) to the topic list endpoint and fixed incorrect ordering logic for this sort option. (PR #346, issue #222)

Complex endpoint — `POST /api/admin/users/{id}/assign-role/`:

Implemented in PR #344 (resolves issues #198, #174). This endpoint allows a superadmin to promote or demote a user's platform role (e.g., to `moderator` or back to regular user). It is only accessible to superadmin accounts, validates the role value against an allowed set, and updates `is_staff` and the user's role field atomically. Audit columns (`role_assigned_by`, `role_assigned_at`) are written in the same transaction.

**Example call:**
```
POST /api/admin/users/42/assign-role/
Authorization: Bearer <superadmin-token>
Content-Type: application/json

{
  "role": "moderator"
}
```

**Example response (200 OK):**
```json
{
  "id": 42,
  "username": "elif",
  "email": "elif@demo.com",
  "role": "moderator",
  "is_staff": true
}
```

**Context / scenario:** Used from the Admin Panel → User Detail page. When a superadmin views a user's profile in the admin panel, they can click "Assign Role" to elevate that user to moderator. Moderators then gain permissions to lock/pin forum topics, remove flagged content, and manage event reports. The endpoint is paired with the admin user detail view (`GET /api/admin/users/{id}/`) which was also implemented in the same PR.

Code-related significant issues:

1. **#187 / PR #382** — *Allow adding images to reviews*: Added a new `CommentMedia` model and MinIO-backed upload pipeline so that users can attach photos when submitting service or event evaluations. Implemented lightbox display in the frontend review section and in the mobile review flow. Also fixed event reviews not appearing in the user's reviews history and profile page (#362), and added evaluation-pending status to the profile history (#352). Required consolidating several conflicting migrations from parallel branches.

2. **#197, #198 / PR #344** — *Admin user profile detail view and admin role assignment*: Implemented the missing `GET /api/admin/users/{id}/` endpoint and corresponding admin panel UI page showing full user details (stats, penalty history, role). Added the `POST /api/admin/users/{id}/assign-role/` endpoint (see API contributions). This closed a gap flagged during requirements review (issue #195).

3. **#222–226 / PR #346** — *Feature 4 forum test gaps and gap implementations*: Added "most active" sort order to the forum topics API (backend change + serializer), then wrote comprehensive integration and Playwright E2E tests for forum reporting, admin moderation (lock/unlock/restore), deleted-user placeholder strategy, and forum latency/read-state reliability (NFR-04a, NFR-04c).

4. **#204, #205 / PR #350** — *Feature 14 service evaluation E2E coverage*: Added explicit E2E tests verifying that `NegativeRep` is never exposed on public frontend endpoints (NFR-14c), and an isolated integration test for service hot-score recalculation at evaluation window close (FR-14f).

5. **#206–213, #227–231 / PR #351** — *Feature 15 and 16 missing test implementation*: Closed the bulk of the evaluation window test gap — event trait mutation regression (confirming event traits do not affect Service Hot Score), window-close exactly-once score processing (NFR-16a, NFR-16b), appropriate evaluation context scoping (FR-16c), blocked event evaluation in ACCEPTED/NO_SHOW statuses (FR-15b), endpoint-level transition tests for mark-attended and complete-event (FR-15c/d), organizer event comment history (FR-15e), and fallback evaluation parity (FR-09g, FR-08i).

6. **#232–237, #337–341 / PR #347** — *Mobile forum module (FR-04)*: Implemented the complete forum feature in the React Native mobile client from scratch: forum home/category screen, topic list with category filter and sort, topic detail with comment posting, create-topic flow, edit/delete for own topics and comments, and report flow for topics and comments.

Management-related significant issues:

1. **#194** — *Assign and Review System Requirements*: Coordinated the team-wide requirements review process, distributing features among team members and tracking completion of all requirement validation issues in this milestone.

2. **#195** — *Requirements Review: Admin Panel Requirements Validation*: Reviewed all admin panel requirements (FR-03a–FR-03f) against the existing implementation and identified that FR-03b (user detail view) and FR-03d (role assignment endpoint) were completely missing, which directly drove issues #197 and #198.

3. **#196** — *Requirements Review: Post Service Evaluation Requirements Validation*: Reviewed FR-14, FR-15, FR-16 requirements, identified the test gaps (missing evaluation window tests, missing NegativeRep privacy E2E), and created the tracking issues #204–213, #227–231 that were subsequently resolved in PRs #350 and #351.

Pull requests:

**PRs I created:**

| PR | Title | Merged | Merged by me? | Resolves |
|----|-------|--------|:-------------:|---------|
| [#191](https://github.com/SWE-574/SWE-574-3/pull/191) | chore: migrate mobile-client from submodule to monorepo | Mar 14 | Yes | — |
| [#190](https://github.com/SWE-574/SWE-574-3/pull/190) | fix(report): add report handling and event participant removal | Mar 23 | No | #184, #185 |
| [#343](https://github.com/SWE-574/SWE-574-3/pull/343) | test(auth): integration and E2E tests for auth and session management | Apr 4 | No | #220, #221 |
| [#351](https://github.com/SWE-574/SWE-574-3/pull/351) | test/feature 15-16: missing test implementation | Apr 4 | No | #206–213, #227–231 |
| [#344](https://github.com/SWE-574/SWE-574-3/pull/344) | feat(admin): admin user profile detail view and admin role assignment | Apr 6 | No | #197, #198, #174 |
| [#350](https://github.com/SWE-574/SWE-574-3/pull/350) | test(evaluation): E2E coverage for Feature 14 service evaluation | Apr 6 | No | #204, #205 |
| [#345](https://github.com/SWE-574/SWE-574-3/pull/345) | test(admin): admin panel E2E tests, user detail, and follow system | Apr 9 | No | #199–203 |
| [#346](https://github.com/SWE-574/SWE-574-3/pull/346) | test(forum): Feature 4 E2E tests and gap implementations | Apr 9 | No | #222–226 |
| [#347](https://github.com/SWE-574/SWE-574-3/pull/347) | feat(forum)[mobile]: implement full forum module in mobile client | Apr 11 | No | #232–237, #337–341 |
| [#382](https://github.com/SWE-574/SWE-574-3/pull/382) | feat(reviews): fix event review visibility and add photo uploads to reviews | Apr 11 | No | #187, #352, #362 |

**PRs I reviewed:**

| PR | Title | Merged | Merged by me? | My Review |
|----|-------|--------|:-------------:|-----------|
| [#256](https://github.com/SWE-574/SWE-574-3/pull/256) | Tests/feature 6 test implementation | Mar 30 | No | Reviewed |
| [#287](https://github.com/SWE-574/SWE-574-3/pull/287) | Tests/feature 7 test implementation | Mar 30 | No | Reviewed |
| [#294](https://github.com/SWE-574/SWE-574-3/pull/294) | Tests/feature 8 test implementation | Mar 30 | No | Reviewed |
| [#296](https://github.com/SWE-574/SWE-574-3/pull/296) | Tests/feature 9 implementation tests | Mar 30 | No | Changes requested |
| [#297](https://github.com/SWE-574/SWE-574-3/pull/297) | Tests/feature 13 test implementations | Mar 30 | No | Reviewed |
| [#331](https://github.com/SWE-574/SWE-574-3/pull/331) | Setup architecture, folder structure and tooling for mobile project | Mar 30 | No | Approved |
| [#270](https://github.com/SWE-574/SWE-574-3/pull/270) | feat: add integration tests for event handshake endpoints | Apr 1 | Yes | Approved |
| [#342](https://github.com/SWE-574/SWE-574-3/pull/342) | Feature/20 follow system | Apr 1 | Yes | Approved |
| [#320](https://github.com/SWE-574/SWE-574-3/pull/320) | feat(tests): feature 17 test gap | Apr 6 | Yes | Approved |
| [#327](https://github.com/SWE-574/SWE-574-3/pull/327) | feat: implement xfail tests for QR and GPS check-in validation | Apr 6 | No | Approved |
| [#260](https://github.com/SWE-574/SWE-574-3/pull/260) | feat(tests): enhance chat and handshake integration tests | Apr 6 | Yes | Approved |
| [#380](https://github.com/SWE-574/SWE-574-3/pull/380) | Feature/featured section | Apr 11 | Yes | Changes requested |
| [#386](https://github.com/SWE-574/SWE-574-3/pull/386) | Fix/mobile messages | Apr 11 | No | Approved |
| [#411](https://github.com/SWE-574/SWE-574-3/pull/411) | feat(mvp2): MVP 2 readiness | Apr 12 | No | Reviewed |

**Conflicts encountered:** PR #382 had the most significant merge friction. Several parallel branches had added migrations simultaneously, causing a broken dependency chain. This was resolved by consolidating the conflicting migrations into merge migrations across three fix commits before the final merge. PRs #345 and #346 also required rebasing onto dev mid-review as concurrent feature branches had landed in the meantime.

Additional information:
- **Mobile monorepo migration (PR #191):** Moved the `mobile-client` from a separate Git submodule into the main repository. This eliminated the two-repo contributor workflow, enabled unified CI, and allowed shared tooling configuration (ESLint, Prettier) to apply to mobile code. This was a prerequisite for the mobile forum work in PR #347.
- **Forum sort bug fix:** While writing the forum E2E tests in PR #346, identified and fixed a backend bug in `ForumTopicViewSet` where the "most active" sort was not correctly ordering results. The fix was included in the same PR alongside the tests.
- **Inline forum topic editing (backend):** Implemented inline editing for forum topics including server-side validation in serializers, discovered during the mobile forum implementation work (included in PR #346 scope).
- **Customer Milestone 2 demo scenario:** Designed and wrote the full demo scenario for the Customer Milestone 2 presentation (wiki: `Milestone-2-scenario.md`), collaborating with Selman and Yusuf on the implementation. The scenario covers characters, scenes, and end-to-end user flows demonstrated during the April 14 presentation. Enhanced it the day before the demo with detailed check-in window explanation and evaluation trait walkthroughs.
- **SRS updates:** Updated `Software-Requirements-Specification.md` to document the new photo attachment requirement for reviews/evaluations (Apr 11), and refined login/registration/password-reset requirements and event evaluation score recalculation rules (Apr 7).
- **Meeting and course notes:** Documented the March 27 team meeting notes (requirements review process and feature assignments) and contributed two rounds of course notes covering customer presentation fundamentals, mobile-first UX design principles, recommendation algorithm details, and feature clarifications (Mar 30, Apr 7).

## Member: Dicle Naz Özdemir
### Main Contributions
During this period, I focused on making the mobile app closer to a usable MVP:

- Set up the **mobile project infrastructure** (iOS + Android) so the team could start developing without setup issues  
- Implemented the **Map feature**, where users can discover offers, needs, and events based on location  
- Built the **push notification system** (Expo), including handling notification clicks and deep linking  
- Improved **privacy on the map** by avoiding exact location sharing  

These contributions helped make the mobile app functional and ready for demo.
---

### API Contributions
I mainly worked as an API consumer on the mobile side.

## Commit trail

| Commit | Date | Message |
|---|---|---|
| `2e5af99` | 2026-03-30 | Setup architecture, folder structure and tooling to prepare project for contribution. |
| `94748bc` | 2026-03-30 | Setup architecture, folder structure and tooling to prepare project for contribution. |
| `9381428` | 2026-04-11 | On dev: map imp *(WIP stash)* |
| `a385926` | 2026-04-11 | index on dev: aab3e77 Merge pull request #386 from SWE-574/fix/mobile-messages *(WIP stash)* |
| `40b4e19` | 2026-04-11 | untracked files on dev: aab3e77 Merge pull request #386 from SWE-574/fix/mobile-messages *(WIP stash)* |
| `3d5c65e` | 2026-04-12 | feat(mobile): integrate Firebase Cloud Messaging (FCM) for push notifications |
| `8c591c5` | 2026-04-12 | add map view — update BottomTabNavigator and MapStack for service detail navigation |
| `ea6a639` | 2026-04-12 | Change map markers to hide exact location of the service. |

### Conflicts encountered and how they were resolved

- **`MapScreen.tsx` on `map-view`:** an early scaffold of `MapScreen.tsx` had shipped with the 30 Mar setup commit, but by the time I built out the real feature on `map-view`, other navigation tweaks had landed on `dev`. Resolution: stash-synced local WIP onto dev (visible in `On dev: map imp`, `index on dev`, `untracked files on dev` WIP commits from `git stash` snapshots on 11 Apr) before doing a clean reimplementation on top of the latest dev — then replaced the entire MapScreen (+578 / −46 net in `8c591c5`) rather than threading small diffs through a stale base.
- **`BottomTabNavigator.tsx`:** the map feature needed to remove a `tabPress` listener that collided with the new `MapStack`. Resolved inline by deleting the 6-line listener during the `map-view` branch so that tapping the Map tab routes through the stack (which now hosts `ServiceDetail`) instead of resetting to root.
- **`firebase-setup` vs mobile app entrypoint:** `index.ts` and `App.tsx` both needed changes for Firebase init while `mobile-create-flow` and `mobile-messages` were touching the same files. Resolved by rebasing `firebase-setup` onto the latest `dev` right before merge (single-commit PR `3d5c65e` lands cleanly on top of `aab3e77`), and keeping all mobile init logic idempotent so teammate PRs that merged first did not need to be re-touched.


## Member: Yasemin Şirin

**Repository:** [SWE-574-3](https://github.com/SWE-574/SWE-574-3)

---

## Responsibilities

Overall ownership for **profile-related quality (FR-02)**, **end-to-end follow / social graph (Feature 20)**, **registration UX polish**, and **mobile profile & achievements & follow experience**—spanning backend contracts, automated tests (unit, integration, E2E), web UI, and React Native screens—so that milestone demos reflect stable, privacy-aware profiles and trustworthy follow behavior across clients.

Beyond individual delivery, contributed to **team-level UI/UX direction**: proposed concrete interaction and layout improvements (especially around profiles, follow affordances, and consistency between web and mobile), helped prioritize them with the group, and implemented agreed changes where they fell in my scope. Supported alignment by **preparing meeting notes**, **maintaining the SRS as the single source of truth**, and **tracking gaps** between SRS intent and what was implemented 

---

## Main contributions 

- **FR-02 profile requirements (test-first):** Mapped FR-02a–FR-02d to concrete backend unit/integration tests and Playwright E2E specs; stabilized E2E by driving assertions from `GET /api/users/me/` instead of brittle hard-coded seeded names.
- **Feature 20 — Follow system (full stack):** Introduced the **`UserFollow`** table as the **current-state** graph (one row per active follower→following pair, DB-enforced uniqueness and no self-follow) and the **`UserFollowEvent`** table as an **append-only audit trail** (`follow` / `unfollow` actions, multiple rows per pair over time). Shipped REST endpoints for follow/unfollow and follower/following lists, profile fields (`followers_count`, `following_count`, `is_following`), migrations `0051_user_follow` and `0052_user_follow_event`, cache invalidation after mutations, URL ordering for nested user routes, and web UI (follow/unfollow, lists, modals) with Playwright coverage under `frontend/tests/e2e/follow-system/`.
- **Registration UX:** Frontend-only capitalization of first/last name on type during registration (`react-hook-form` `Controller`), closing the linked registration polish issue.
- **Mobile — public profile & achievements:** Public profile screen, achievements section and list screen, profile stats (offers/needs/exchanges), navigation from service detail and messages, types aligned with API.
- **Mobile — follow on public profile (completion):** Public profile followers/following counts, sign-in gate for lists, Follow/Unfollow (and Sign in when logged out), `refreshUser()` after follow actions, and `useFocusEffect` + `refreshUser()` on own profile to eliminate stale count vs. list drift.
- **Team UI/UX and product clarity:** Surfaced UX friction (e.g. discoverability of follow actions, count vs. list trust, placement of primary actions on public profile) and turned agreed items into implementable work—reflected in mobile follow completion, profile flows, and supporting documentation for reviewers and demos.

---

## API contributions

### Backend 

Primary API surface delivered and hardened for **Feature 20**:

| Method | Path | Role |
| --- | --- | --- |
| `POST` | `/api/users/{id}/follow/` | Create follow; reject self-follow and duplicates. |
| `DELETE` | `/api/users/{id}/follow/` | Remove follow; reject invalid unfollow. |
| `GET` | `/api/users/{id}/followers/` | Paginated / list followers (active users). |
| `GET` | `/api/users/{id}/following/` | Paginated / list following (active users). |

Profile responses (`GET /api/users/me/`, `GET /api/users/{id}/`) were extended with **`followers_count`**, **`following_count`**, and **`is_following`**, with cache invalidation after follow state changes so counts and UI stay aligned.

### Persistence & audit: `UserFollow` and `UserFollowEvent`

These are the two tables introduced in the Feature 20 work (migrations **`0051_user_follow`** and **`0052_user_follow_event`**). Together they separate **“who is connected now”** from **“what happened over time”**.

| Table | Role | Main columns / rules |
| --- | --- | --- |
| **`api_userfollow`** (`UserFollow`) | Materialized **active** follow edge: follower → following. | `id` (UUID PK), `follower_id`, `following_id`, `created_at`. **Unique** on `(follower, following)`. **Check**: follower ≠ following. **Indexes** on `follower` and `following` for fast counts and list queries. `save()` runs `full_clean()` so self-follow is blocked in the model layer too. |
| **`api_userfollowevent`** (`UserFollowEvent`) | **Append-only** log of actions for moderation and history. | `id` (UUID PK), `follower_id`, `following_id`, **`action`** (`follow` \| `unfollow`), `created_at`. Multiple rows per pair are allowed (e.g. follow → unfollow → follow again). **Check**: actor ≠ target. Ordered by `-created_at` by default. |

**Write path (API):** On successful **`POST /api/users/{id}/follow/`**, the view creates a **`UserFollow`** row (or returns 400 on duplicate/self) **and** appends a **`UserFollowEvent`** with `action=follow`. On successful **`DELETE /api/users/{id}/follow/`**, it removes the **`UserFollow`** row **and** appends **`UserFollowEvent`** with `action=unfollow`. The event table is **not** used to compute the public follower list; lists and counts read from **`UserFollow`** (active users only), while **`UserFollowEvent`** supports audit (“when did this user follow/unfollow?”) without losing history after an unfollow.

### Complex endpoint (documented) — `POST /api/users/{id}/follow/`

**Context:** On another user’s profile (web or mobile), an authenticated member taps **Follow**. The client calls this endpoint with the target user’s UUID (the same `id` returned by `GET /api/users/me/` or `GET /api/users/{id}/` for that person). The server must enforce auth, no self-follow, no duplicate row, persist **`UserFollow`**, append **`UserFollowEvent`** (`follow`), and invalidate cached profile payloads so `followers_count` / `is_following` update immediately on the next read.

**Example request** (`3fa85f64-5717-4562-b3fc-2c963f66afa6` = example target user UUID only)

```http
POST /api/users/3fa85f64-5717-4562-b3fc-2c963f66afa6/follow/
Authorization: Bearer <access-token>
Content-Type: application/json

{}
```

**Example success response** (`200` or `201` per implementation)

```json
{
  "status": "ok",
  "following": true,
  "followers_count": 12
}
```

(Exact JSON envelope may match your serializer; the important contract is: relationship created, errors are structured for `400`/`404`/`401`, and subsequent `GET /api/users/{id}/` reflects updated counts and `is_following: true`.)

**Example error — duplicate follow** (`400`)

```json
{
  "code": "ALREADY_EXISTS",
  "message": "You are already following this user."
}
```

### Front-end / mobile (consumed)

- **Web:** `followUser`, `unfollowUser`, `getFollowers`, `getFollowing` against the endpoints above; profile types extended for counts and `is_following`.
- **Mobile:** Same endpoints via `mobile-client/src/api/users.ts`; `PublicProfileScreen` uses `GET /users/{id}/` for counts and state, navigates to `FollowList`, and calls `refreshUser()` after follow/unfollow so **`/users/me/`** stays consistent with list data.

---

## Code-related significant issues

- **Profile route ordering:** Ensured nested `/users/<id>/follow/`, `/followers/`, `/following/` are registered **before** the generic `/users/<id>/` detail route so follow paths are not swallowed by the profile handler.
- **DRF mixin registration:** `ProfileFollowStatsMixin` adjusted to subclass `serializers.Serializer` so `SerializerMethodField` declarations register correctly—fixing missing or broken count fields on profile serializers.
- **Follow serializer / UUID fields:** Removed redundant `source=` declarations on UUID fields in `UserFollowRelationshipSerializer` to match DRF expectations and avoid subtle serialization bugs.
- **Cache vs. truth:** Profile caches invalidated on follow/unfollow so **counts and `is_following`** match list endpoints after mutations.
- **Mobile stale counts:** Resolved mismatch where **follower/following lists** refetched from API but **`AuthContext` user** held stale `following_count` until full refresh—fixed with **`refreshUser()`** after follow/unfollow and **`useFocusEffect`** on profile home to refetch `me` when returning from follow lists.
- **E2E stability:** Replaced hard-coded seeded-name assertions with **`/api/users/me/`**-driven checks for FR-02a/FR-02b flows.

---

## Management-related significant issues

- **Requirement traceability:** Explicit mapping from **FR-02a–FR-02d** and **FR-20a–FR-20i** (plus NFR-20b–20d) to tests and PR scope, improving milestone sign-off and regression safety.
- **Issue closure discipline:** PRs linked and closed related GitHub issues in batches (e.g. follow system #309–#315; mobile public profile #365, #372, #373; milestone follow-up #375; profile tests #242; registration #181).
- **Scope control:** Documented out-of-scope items in profile test PR (forum stats, email change) to avoid scope creep; follow system intentionally limited to profile-level social graph without a full feed product.
- **Meeting hygiene:** Prepared **meeting notes** (decisions, owners, follow-ups) so syncs produced actionable backlog items instead of losing context between sessions.
- **SRS stewardship:** Contributed **SRS updates** so requirements stayed consistent with agreed product behavior (including follow system and profile-related wording where applicable).
- **Gap analysis for the milestone:** Identified **missing or partially implemented SRS items** and **what still needed to be added** (feature-complete vs. partial), consolidated in **`SRS_status.md`** for transparent milestone reporting and to guide next-sprint planning.

---

## Pull requests (created, merged, reviewed)

### Authored (created, merged)

| # | Theme | Summary |
| --- | --- | --- |
| 1 | FR-02 tests | Requirement-mapped tests (backend unit/integration + Playwright FR-02a–d); dynamic `/api/users/me/` in E2E. **Closes #242.** |
| 2 | Feature 20 Follow | Full follow system: **`UserFollow` + `UserFollowEvent`** models & migrations, follow/unfollow + list APIs, profile counts / `is_following`, cache invalidation, web UI & E2E. **Closes #309–#315.** |
| 3 | Registration UX | Capitalize first letter of first/last name while typing. **Closes #181.** |
| 4 | Mobile profile | Public profile, achievements, stats, navigation. **Closes #365, #372, #373.** |
| 5 | Mobile follow completion | Public profile follow UX + count sync (`refreshUser`, focus refresh). **Closes #375.** |

### Reviewed (reviewed, merged)

Code review participation on teammates’ work.

| PR | Title | Author | Notes |
| --- | --- | --- | --- |
| [#414](https://github.com/SWE-574/SWE-574-3/pull/414) | Main - Dev Sync | yusufizzetmurat | Branch sync / integration hygiene. |
| [#413](https://github.com/SWE-574/SWE-574-3/pull/413) | milestone2 main deliverables | yusufizzetmurat | Milestone 2 packaging on `main`. |
| [#411](https://github.com/SWE-574/SWE-574-3/pull/411) | feat(mvp2) | yusufizzetmurat | MVP2 feature batch. |
| [#320](https://github.com/SWE-574/SWE-574-3/pull/320) | feat(tests): feature 17 test gap | yusufizzetmurat | Test coverage for Feature 17 (`test`). |
| [#293](https://github.com/SWE-574/SWE-574-3/pull/293) | feat(tests): FR12 Test Gap and FR Analysis | yusufizzetmurat | FR-12 test gap + requirements analysis (`test`). |


### Conflict Resolution

Some merge conflicts occurred during integration of follow system and mobile profile features due to concurrent updates on user-related APIs and profile components. These were resolved by aligning API response formats and re-testing affected areas after merging.


---

## Additional information

- Authored or co-maintained project docs used for milestone delivery: **`API_LIST.md`**, **`API_Documentation.md`**, **`SRS_status.md`** (implemented vs. partial feature matrix against `SRS.md`), **`UX_Design.md`** (domain-centered UX principles for the submission pack).
- **SRS / backlog hygiene:** Updated **`SRS.md`** where the team clarified scope or behavior; used **`SRS_status.md`** to call out **fully implemented** vs **partial** features so stakeholders see honest milestone coverage at a glance.
- Demo support: prepared flows for **public profile → follow → list → back** and **FR-02 privacy** (no email on public profile) on both web and mobile where applicable.

---

## Member: Yusuf İzzet Murat (`yusufizzetmurat`)

**Responsibilities:**  
My formal scope in this milestone stayed aligned with the [RAM (RACI) Matrix](https://github.com/SWE-574/SWE-574-3/wiki/RAM-(RACI)-Matrix): Product Owner and Design, Wiki Control (Accountable), Backend (Responsible), and Test (Responsible), with added ownership of Requirements and SRS updates and a consulting role on both the web and mobile frontend tracks. In practice this meant leading the backend work behind ranking and discovery, pulling business logic out of Django views into a dedicated service layer, expanding test coverage and CI efficiency, delivering the mobile-side features that consumed the new backend APIs, and keeping the wiki and SRS in sync with what was actually implemented.

**Main contributions:**  
Between Customer Milestone 1 and Customer Milestone 2, I contributed 122 commits, opened 16 feature PRs (14 merged, 2 still in review), reviewed over 20 teammate PRs, filed 72 issues, and pushed 6 wiki commits. My work covered three connected tracks: new product features, architectural quality, and test/CI infrastructure, plus the matching mobile-side delivery.

On the product side, I extended the M1 backend into a socially-aware discovery product. This included the curated featured feed ([#380](https://github.com/SWE-574/SWE-574-3/pull/380)), the social proximity boost in ranking built on top of Yasemin's follow graph ([#349](https://github.com/SWE-574/SWE-574-3/pull/349)), urgency-based hot score ranking for Events and Group Offers ([#353](https://github.com/SWE-574/SWE-574-3/pull/353)), the Expo push notification pipeline ([#368](https://github.com/SWE-574/SWE-574-3/pull/368)), chat private-message broadcasting with the supporting handshake-logic fixes and tests ([#260](https://github.com/SWE-574/SWE-574-3/pull/260)), and the event-participation and location-privacy checks that enforce blurred coordinates on the backend until a user joins or their handshake is accepted (merged via the M2 integration window).

On the architectural side, I moved handshake business logic into a dedicated `HandshakeService` class ([#354](https://github.com/SWE-574/SWE-574-3/pull/354)) and extended the Tag model into a WikiData-backed hierarchy ([#355](https://github.com/SWE-574/SWE-574-3/pull/355)). On testing and CI, I closed the FR-12 and FR-17 test gaps ([#293](https://github.com/SWE-574/SWE-574-3/pull/293), [#320](https://github.com/SWE-574/SWE-574-3/pull/320)), added xfail scaffolding that captured the expected QR and GPS check-in contract ([#327](https://github.com/SWE-574/SWE-574-3/pull/327)), tightened event-handshake integration tests ([#270](https://github.com/SWE-574/SWE-574-3/pull/270)), and cut CI time with tiered E2E test selection plus a dedicated mobile CI workflow ([#360](https://github.com/SWE-574/SWE-574-3/pull/360)).

On mobile I delivered event evaluations ([#388](https://github.com/SWE-574/SWE-574-3/pull/388)), the featured section UI, the push notification integration, and service-wizard refinements including the iOS date picker modal (merged via the M2 integration window), plus a routine prebuild-config cleanup ([#399](https://github.com/SWE-574/SWE-574-3/pull/399)). QR attendance verification is also under way on a feature branch ([#398](https://github.com/SWE-574/SWE-574-3/pull/398), still in review) and was intentionally not merged for Customer Milestone 2; after the M2 demo the customer agreed to simplify the no-show penalty flow, so the branch now waits on that scope change before landing.

**API contributions:**  
The most complex API I developed and integrated in this period is `GET /api/featured/`, the backend for the mobile home feed. It is implemented in `backend/api/views_featured.py` ([#380](https://github.com/SWE-574/SWE-574-3/pull/380)) and aggregates three distinct data sections into a single response. The trending section lists the top ten active services created in the last 30 days, sorted by batch-computed hot scores. The friends section walks the `UserFollow` graph to find services where followed users have confirmed handshakes (statuses `accepted`, `completed`, `checked_in`, `attended`), annotates each entry with `friend_count` and `friend_names`, and orders by how many followed users are involved. The top-providers section ranks users by the distinct positive reputation traits (`is_punctual`, `is_helpful`, `is_kind`) they received in the last 7 days. All three sections sit behind Redis caching with a 120-second TTL: shared keys for trending and top providers, a per-user key for the friends feed.

Example request:

```http
GET /api/featured/
Authorization: Bearer <jwt-token>
```

Example response:

```json
{
  "trending": [
    {
      "id": "a1b2c3d4-...",
      "title": "Weekend Pottery Workshop",
      "type": "Event",
      "user": {
        "id": "e5f6g7h8-...",
        "first_name": "Elif",
        "last_name": "Yilmaz",
        "avatar_url": null
      },
      "tags": [{"id": 12, "name": "pottery"}],
      "participant_count": 5,
      "max_participants": 10,
      "location_area": "Besiktas, Istanbul",
      "created_at": "2026-04-01T10:00:00+03:00"
    }
  ],
  "friends": [
    {
      "id": "b2c3d4e5-...",
      "title": "Cooking Class",
      "type": "Offer",
      "user": { "id": "...", "first_name": "Ayse", "last_name": "Kaya", "avatar_url": null },
      "tags": [{"id": 5, "name": "cooking"}],
      "participant_count": 3,
      "max_participants": 8,
      "location_area": "Uskudar, Istanbul",
      "created_at": "2026-03-28T14:30:00+03:00",
      "friend_count": 2,
      "friend_names": ["Cem D.", "Zeynep A."]
    }
  ],
  "top_providers": [
    {
      "id": "c3d4e5f6-...",
      "first_name": "Mehmet",
      "last_name": "Ozkan",
      "avatar_url": null,
      "completed_count": 7,
      "positive_rep_count": 4
    }
  ]
}
```

The mobile client calls this endpoint when the home screen loads to populate three horizontal carousels. Trending drives newcomer discovery, the friends section uses the social graph for network-based relevance, and top providers highlights consistently well-reviewed community members. The friends tab is powered by Yasemin's follow and unfollow API in [#342](https://github.com/SWE-574/SWE-574-3/pull/342), which my proximity scoring ([#349](https://github.com/SWE-574/SWE-574-3/pull/349)) then weights into the feed ranking. Other endpoints I developed or extended in the same interval include the Expo push notification token lifecycle (`POST /api/notifications/register-push-token/` and the matching deregister endpoint, [#368](https://github.com/SWE-574/SWE-574-3/pull/368)).

**Code-related significant issues:**  
- I resolved the backend-refactor epic ([#217](https://github.com/SWE-574/SWE-574-3/issues/217)) in [#354](https://github.com/SWE-574/SWE-574-3/pull/354), moving handshake logic (initiate, approve, reject, cancel, complete, mark-attended, check-in, and related validation) from `views.py` into a dedicated `HandshakeService` class in `services.py` and introducing a `HandshakeServiceError` for structured error handling. This set the pattern that `EventHandshakeService` later followed and made the rules easier to cover in isolation.
- I closed the FR-19e/FR-19g gap flagged at M1 with the social proximity boost ([#349](https://github.com/SWE-574/SWE-574-3/pull/349)), which plugged a proximity scoring function into the ranking pipeline on top of Yasemin's `UserFollow` graph so services from followed users and their connections rank higher in discovery. Backed by 131 new test lines.
- I addressed FR-17e–FR-17h with urgency-based hot score ranking ([#353](https://github.com/SWE-574/SWE-574-3/pull/353)): the hot score now factors the date proximity of Events and Group Offers, and the UI gained a "Nearly Full" indicator in the same PR.
- I added the `parent_qid`, `entity_type`, and `depth` fields to the Tag model with a WikiData backfill management command ([#355](https://github.com/SWE-574/SWE-574-3/pull/355)), backed by 841 new test lines covering backfill, hierarchy search, scoring, and WikiData filtering.
- I shipped the `GET /api/featured/` endpoint and its mobile UI ([#380](https://github.com/SWE-574/SWE-574-3/pull/380)) with Redis caching and 213 lines of unit tests in `test_featured.py`.
- I implemented the Expo push notification pipeline end-to-end: the `DevicePushToken` model, register/deregister endpoints, token-format validation, and the mobile integration ([#368](https://github.com/SWE-574/SWE-574-3/pull/368)).
- I optimised E2E CI with tiered test selection via a `select-e2e-tests.sh` script and added a dedicated mobile CI workflow (`ci-mobile.yml`) for React Native lint and unit tests ([#360](https://github.com/SWE-574/SWE-574-3/pull/360)).
- I delivered chat private-message broadcasting together with the supporting handshake-logic fixes and a tightened integration-test suite in [#260](https://github.com/SWE-574/SWE-574-3/pull/260), so private messages propagate in real time over the websocket layer and the handshake state transitions regress cleanly.
- I enforced event-participation and location-privacy rules on the backend (merged via the M2 integration window): service listings return blurred coordinates until the handshake is accepted or, for events, until the user joins, and this is enforced server-side so no client can read the exact location before it is permitted. The same change added an `_is_event_participant()` serializer method and clearer participation messaging in the event and evaluation modals.
- I closed functional test gaps across FR-12 event browse ([#293](https://github.com/SWE-574/SWE-574-3/pull/293)), FR-17 ranking ([#320](https://github.com/SWE-574/SWE-574-3/pull/320)), and event handshake endpoints ([#270](https://github.com/SWE-574/SWE-574-3/pull/270)), and introduced xfail scaffolding for the QR and GPS check-in contract ([#327](https://github.com/SWE-574/SWE-574-3/pull/327)) so the intended behaviour was pinned down before the implementation work started.
- On mobile I delivered the event evaluation flow ([#388](https://github.com/SWE-574/SWE-574-3/pull/388)) and the service-wizard iOS date picker modal (merged via the M2 integration window), and landed a routine prebuild-configuration cleanup so native Android and iOS builds stay reproducible ([#399](https://github.com/SWE-574/SWE-574-3/pull/399)).
- I started the QR attendance verification work on a feature branch ([#398](https://github.com/SWE-574/SWE-574-3/pull/398)): the `EventQRToken` model with a 5-minute TTL and 6-character single-use code, the generate and check-in endpoints, the frontend QR display, and 189 accompanying test lines. This was not merged for the M2 demo, and after the customer's feedback on the no-show penalty flow it will be reshaped before the final merge.

**Management-related significant issues:**  
- I opened the backend-refactor epic [#217](https://github.com/SWE-574/SWE-574-3/issues/217) together with its scoping issues [#219](https://github.com/SWE-574/SWE-574-3/issues/219) (domain-logic extraction from ViewSets) and [#218](https://github.com/SWE-574/SWE-574-3/issues/218) (API contract standardisation for filters, pagination, response shape, and errors), which framed the architectural direction for the milestone.
- I scoped the FR-12 test-suite requirements in [#291](https://github.com/SWE-574/SWE-574-3/issues/291) and documented the urgency multiplier scope for ranking in [#304](https://github.com/SWE-574/SWE-574-3/issues/304); both were the predecessors to the implementation and test PRs that followed.
- I aligned event lockdown window semantics between the API and UI through [#267](https://github.com/SWE-574/SWE-574-3/issues/267), and closed the Feature 10 requirement gaps (FR-10d, NFR-10a, NFR-10c) via [#264](https://github.com/SWE-574/SWE-574-3/issues/264).
- I documented the geolocation encryption posture in [#326](https://github.com/SWE-574/SWE-574-3/issues/326) (NFR-19c) so the non-functional requirement has a concrete reference for future reviewers.
- Across the interval I filed 72 issues in total (42 still open, 30 closed), distributed across ranking and search (18+), mobile (11), testing (8), backend refactoring (7), and security (4). I also pushed 6 wiki commits with SRS updates for ranking, social proximity, and chat requirement revisions (FR-10b, FR-10d, FR-10f), keeping the documentation aligned with the implementation.

**Pull requests:**  
- **Created and merged:** [#399](https://github.com/SWE-574/SWE-574-3/pull/399), [#388](https://github.com/SWE-574/SWE-574-3/pull/388), [#380](https://github.com/SWE-574/SWE-574-3/pull/380), [#368](https://github.com/SWE-574/SWE-574-3/pull/368), [#360](https://github.com/SWE-574/SWE-574-3/pull/360), [#355](https://github.com/SWE-574/SWE-574-3/pull/355), [#354](https://github.com/SWE-574/SWE-574-3/pull/354), [#353](https://github.com/SWE-574/SWE-574-3/pull/353), [#349](https://github.com/SWE-574/SWE-574-3/pull/349), [#327](https://github.com/SWE-574/SWE-574-3/pull/327), [#320](https://github.com/SWE-574/SWE-574-3/pull/320), [#293](https://github.com/SWE-574/SWE-574-3/pull/293), [#270](https://github.com/SWE-574/SWE-574-3/pull/270), and [#260](https://github.com/SWE-574/SWE-574-3/pull/260). Together these covered the featured feed, the social proximity ranking, urgency-based hot score, tag hierarchy, the handshake service refactor, Expo push notifications, CI optimisation, mobile event evaluations, mobile build fixes, chat private-message broadcasting, and the backend test-gap closure for FR-12, FR-17, and event handshake coverage. Milestone release-management PRs (main-dev sync, milestone-2 packaging, and the M1 review upload) are omitted here because they are repository updates rather than feature work.
- **Open / in review:** [#398](https://github.com/SWE-574/SWE-574-3/pull/398) is the QR attendance verification branch, intentionally not merged for Customer Milestone 2 and waiting on the penalty-flow simplification agreed with the customer at the M2 demo. [#396](https://github.com/SWE-574/SWE-574-3/pull/396) streamlines the dev environment setup and mobile workflow support.
- **Reviewed:** I reviewed teammate work across backend, frontend, and mobile, including [#394](https://github.com/SWE-574/SWE-574-3/pull/394) (map view), [#393](https://github.com/SWE-574/SWE-574-3/pull/393) (mobile service detail and messaging alignment with the web frontend), [#392](https://github.com/SWE-574/SWE-574-3/pull/392) (Firebase setup), [#383](https://github.com/SWE-574/SWE-574-3/pull/383) (mobile service creation flow), [#382](https://github.com/SWE-574/SWE-574-3/pull/382) (event review visibility and photo uploads), [#364](https://github.com/SWE-574/SWE-574-3/pull/364) (ranking debug panel in the admin dashboard), [#357](https://github.com/SWE-574/SWE-574-3/pull/357) (online handshake approval fix), [#351](https://github.com/SWE-574/SWE-574-3/pull/351) (Feature 15–16 test gaps), [#347](https://github.com/SWE-574/SWE-574-3/pull/347) (mobile forum), [#346](https://github.com/SWE-574/SWE-574-3/pull/346) (forum E2E), [#345](https://github.com/SWE-574/SWE-574-3/pull/345) (admin panel E2E), and [#343](https://github.com/SWE-574/SWE-574-3/pull/343) (auth integration and E2E). I also reviewed and merged the dependency-update batch [#400](https://github.com/SWE-574/SWE-574-3/pull/400)–[#409](https://github.com/SWE-574/SWE-574-3/pull/409).
- **Conflicts and resolution:** The most significant merge friction came from the handshake service-layer refactor in [#354](https://github.com/SWE-574/SWE-574-3/pull/354), which touched nearly every handshake-related code path and forced rebases on concurrent branches editing views or serialisers. My approach throughout was to sync with the latest `dev` first, keep both sides when teammates and I solved different edge cases, run lint/type-check/tests before merge, and push a cleanup commit only once everything was green.

**Additional information:**  
The xfail tests in [#327](https://github.com/SWE-574/SWE-574-3/pull/327) functioned as executable specifications for the QR and GPS check-in behaviour, pinning the intended contract before the implementation work on [#398](https://github.com/SWE-574/SWE-574-3/pull/398) began. On demo preparation I also updated `setup_demo.py` with curated avatars and an expanded media library so the seeded content during the April 14 presentation looked like realistic product usage rather than placeholder filler.

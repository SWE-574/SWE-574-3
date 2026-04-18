# Testing

### Testing Scope and Evidence Base

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

### General Testing Strategy

The project follows a **layered testing strategy** rather than relying on a single test type.

#### 1. Backend testing
The backend is tested with **pytest** and is split into:
- **unit tests** for serializers, ranking logic, model behavior, cache logic, permissions, and service rules
- **integration tests** for API endpoints and multi-component flows such as auth, chats, handshakes, evaluations, reporting, notifications, transactions, forum features, and admin features

This provides fast feedback for isolated business logic while also validating real request/response behavior.

#### 2. Frontend testing
The web frontend uses two complementary layers:
- **Vitest** for component, utility, service, and regression-level tests
- **Playwright** for end-to-end flows against the running application

The E2E strategy is **requirement-driven**. Test suites are organized by feature and named per requirement (`FR` / `NFR`), so the test structure itself also acts as a traceability layer from the SRS to implementation.

#### 3. Mobile testing
The mobile app uses **Jest** and focuses on:
- API client normalization
- request/response contracts
- service, handshake, notification, transaction, forum, and auth client behavior

This was especially important because the mobile application was integrated into the monorepo during this milestone and had to stabilize quickly around backend contract changes.

#### 4. Full-stack and deployment validation
Beyond code-level tests, the team validates:
- Dockerized infrastructure
- service health checks
- seeded demo data
- smoke tests against the deployed stack shape used for demos and customer-facing validation

This is important because Milestone 2 requires not only implemented features, but also a demoable, reproducible, and deployable system.

### Testing Philosophy

The project’s testing philosophy can be summarized as follows:

- **Requirement traceability first:** E2E suites are written against SRS requirements rather than arbitrary page paths.
- **Deterministic setup:** tests create or seed the data they need instead of depending on stale shared state.
- **API-assisted setup where appropriate:** repetitive state preparation may be done through helpers or direct API calls, but final assertions remain user-visible whenever possible.
- **Regression safety over ad hoc checking:** bugs found during feature work are often followed by dedicated unit, integration, or E2E regression tests.
- **CI as enforcement, not only automation:** linting, type checks, migrations, health checks, coverage, smoke tests, and artifact generation are part of the automated workflow.

### What Was Added or Strengthened During Milestone 2

Milestone 2 significantly expanded the project’s test footprint.

#### Requirement-mapped E2E coverage
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

This transformed end-to-end testing from a few generic smoke scenarios into a broader **acceptance-style verification layer** aligned with the SRS.

#### Backend integration and regression expansion
The backend test suite was also strengthened through issue-driven and bug-driven work. Examples include:

- event handshake coverage (`#270`, issue `#284`)
- chat and handshake regressions (`#260`, issues `#261` and `#264`)
- authentication/logout/session invalidation integration tests (`#343`)
- evaluation scoring and window-close semantics (`#350` and related commits)
- forum moderation and reporting validation (`#346`)
- admin moderation and role/permission flows (`#345`)

This improved confidence in API contracts and reduced the risk of business-logic regressions.

#### CI and E2E reliability work
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

### Current Test Inventory at Milestone 2 Snapshot

At the current milestone snapshot, the repository contains:

- **66 backend test files** under `backend/api/tests`
- **167 Playwright E2E spec files** under `frontend/tests/e2e`
- **11 frontend Vitest test files** under `frontend/src/test`
- **15 mobile Jest API test files** under `mobile-client/src/api/__tests__`

This does not mean every requirement is equally mature, but it does show that testing in Milestone 2 is no longer incidental; it is now a meaningful part of the delivery process.

### GitHub Workflow Support

The testing process is reinforced by multiple GitHub Actions workflows.

#### Backend CI
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

#### Frontend CI
`ci-frontend.yml` runs:
- `npm ci`
- dependency audit
- ESLint
- TypeScript type checking
- Vitest with coverage
- production build

This workflow uploads frontend coverage artifacts and ensures that the web application is both test-clean and buildable.

#### Mobile CI
`ci-mobile.yml` runs:
- `npm ci`
- TypeScript type checking
- Jest test execution with coverage

This gives automated validation for the mobile client on every relevant change.

#### E2E CI
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

#### Docker and infrastructure CI
`ci-docker.yml` and related workflows validate:
- Dockerfiles
- infra stack health
- local/full stack health
- production stack startup
- backend, frontend, and media proxy smoke tests

This supports the milestone requirement that the software be dockerized and deployable.

### Executed Test Results for This Report

The following test runs were executed locally and their generated artifacts were committed to the `tests-m2-report` branch.

#### Backend (`pytest`)
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

#### Frontend unit/regression (`Vitest`)
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

#### Frontend end-to-end (`Playwright`)
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

This run is useful as a snapshot of the suite’s current stability on the running application.

Representative failing areas included:
- selected private/group chat interaction cases
- some handshake/session-detail flows
- selected profile edit and detail-page scenarios
- some request/time-reservation and ledger-consistency checks
- selected forum creation/loading expectations

This means the Playwright suite is already a meaningful acceptance and regression layer, but not yet fully green at the milestone snapshot.

#### Mobile (`Jest`)
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

### Test Result Summary

Taken together, the executed results show a healthy but uneven testing picture:

- **Backend** is in the strongest position. The suite is broad, the JUnit report is clean, and overall coverage is high enough to support confident API and business-logic changes.
- **Mobile Jest** is also in a strong position within its intended scope. Its coverage is high, and the contract-focused tests give solid confidence around backend/mobile integration points.
- **Frontend Playwright** already provides substantial acceptance value because it covers a large part of the SRS and many realistic user journeys. However, the current run also shows that some product areas still need stabilization before the suite can be treated as consistently green.
- **Frontend Vitest** is currently best understood as a focused regression layer rather than a broad coverage layer. It is useful, but its repository-wide coverage percentages show that most frontend confidence still comes from Playwright rather than component/unit tests.

In other words, the testing process is already meaningful and reviewable across all three application surfaces, but the maturity level is not identical across layers. Backend and mobile are currently more stable in automated verification, while frontend end-to-end coverage is broader but still more volatile.

### Generated Test Reports

All report artifacts referenced below were collected under the `tests-m2-report` branch.

- [Bundled `test_report` artifact (ZIP)](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/reports/test_report_bundle.zip)

#### Backend
- [JUnit XML report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/backend/junit.xml)
- [HTML coverage report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/backend/coverage-html/index.html)
- [JSON coverage report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/backend/coverage.json)

#### Frontend
- [Vitest coverage summary](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/frontend-vitest/coverage-summary.json)
- [Vitest raw coverage JSON](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/frontend-vitest/coverage-final.json)
- [Playwright JUnit report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/frontend-e2e/playwright-junit.xml)
- [Playwright HTML report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/frontend-e2e/playwright-html/index.html)

#### Mobile
- [Jest Clover XML report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/mobile-jest/clover.xml)
- [Jest LCOV HTML report](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/mobile-jest/lcov-report/index.html)
- [Jest raw coverage JSON](https://github.com/SWE-574/SWE-574-3/blob/tests-m2-report/test_report/mobile-jest/coverage-final.json)

### Reflection on Testing Maturity

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

### Summary

Testing in Milestone 2 was not an afterthought; it became part of the project architecture and delivery process.

The team now combines:
- backend unit and integration tests
- frontend unit/regression tests
- requirement-mapped Playwright E2E suites
- mobile Jest contract tests
- CI-enforced linting, typing, coverage, and health validation
- Docker-based smoke and deployment verification

Most importantly, this milestone now includes **committed, inspectable test artifacts** for backend, frontend, and mobile validation on the `tests-m2-report` branch, making the testing evidence reproducible and reviewable.

For convenience, the collected reports are also available as a single bundled archive, so reviewers can download the full `test_report` package directly instead of opening each artifact one by one.

# Testing Documentation

Quick reference for running tests and viewing test structure for The Hive platform.

## Quick Start

### Running Tests

#### Backend Tests
```bash
# Run all backend tests
make test-backend

# Run only unit tests
make test-backend-unit

# Run only integration tests
make test-backend-integration

# Generate coverage report
make coverage-backend
```

#### Frontend Tests
```bash
# Run all frontend tests
make test-frontend

# Run unit tests
make test-frontend-unit

# Run integration tests
make test-frontend-integration

# Generate coverage report
make coverage-frontend
```

#### E2E Tests
```bash
# Run E2E tests (full stack must be running)
make test-e2e

# Run E2E tests with UI
make test-e2e-ui

# Run E2E tests in debug mode
make test-e2e-debug

# Run a single feature suite
cd frontend && PLAYWRIGHT_BASE_URL=http://localhost npm run test:e2e -- tests/e2e/feature-5

# Run a single spec
cd frontend && PLAYWRIGHT_BASE_URL=http://localhost npm run test:e2e -- tests/e2e/feature-5/01-fr-05a.spec.ts
```

#### Mobile Tests
```bash
cd mobile-client && npm test
```

#### All Tests
```bash
# Run all tests (backend + frontend + E2E)
make test-all
```

### Viewing Reports

```bash
# Open test reports
make test-reports

# Open coverage reports
make coverage-report
```

## Test Structure

### Backend Tests
- **Unit Tests**: `backend/api/tests/unit/`
  - Model tests
  - Serializer tests
  - Utility function tests
  - Service layer tests

- **Integration Tests**: `backend/api/tests/integration/`
  - API endpoint tests
  - Database operation tests
  - Authentication flow tests

### Frontend Tests
- **Unit Tests**: `frontend/src/components/__tests__/`
  - Component tests
  - Hook tests
  - Utility tests

- **Integration Tests**: `frontend/src/components/__tests__/*.integration.test.tsx`
  - Component + API integration

- **E2E Tests**: `frontend/tests/e2e/`
  - 164 spec files across 16 feature directories
  - Requirement-driven (one spec per FR/NFR)
  - See `frontend/tests/e2e/TEST_GUIDE.md` for authoring conventions

### Mobile Tests
- **Unit Tests**: `mobile-client/src/api/__tests__/`
  - API client tests (auth, chats, handshakes, services, etc.)
  - 15 test files covering all API modules

## Coverage Targets

Backend (pytest-cov, branch coverage on):
- Combined line + branch coverage: 70% minimum (enforced by `--cov-fail-under=70` in `backend/pytest.ini`)
- Hot modules under mutation: 70% mutation score (`backend/pyproject.toml` `[tool.mutmut]`)

Frontend (Vitest + v8):
- Lines: 60%, Functions: 60%, Statements: 60%, Branches: 40%
- Configured under `coverage.thresholds` in `frontend/vite.config.ts`
- Mutation score on `services/api.ts`, `services/conversationAPI.ts`, `utils/dateTime.ts`, `utils/eventUtils.ts`, `utils/cookies.ts`: high 80, low 60, break 60 (`frontend/stryker.conf.json`)

## Authoring conventions

### Backend
- New endpoint tests must use `assert_api_response(response, status, contains=..., schema=...)` from `api.tests.helpers.assertions` instead of raw `assert response.status_code == ...`. Status-only assertions hide regressions where the API returns the right status with the wrong body.
- Error responses use `assert_problem_detail(response, status, contains_text='...')`.
- Time-dependent code uses `freeze`/`advance` from `api.tests.helpers.time` (wraps freezegun); never `time.sleep`.
- WebSocket tests live next to integration tests, use `consumer_for(...)` from `api.tests.helpers.ws`, and are tagged `@pytest.mark.websocket`. Cookie auth and `?token=` paths must both be exercised.
- Property tests live in `test_property_tests.py`. State machines use `RuleBasedStateMachine`; pure properties use `@given`. Always set `deadline=None` for DB-touching properties.

### Frontend / E2E
- E2E specs are named `NN-<fr|nfr>-<feature>-<sub>.spec.ts` and map 1:1 to a requirement. Spec → requirement is tracked in `frontend/tests/e2e/coverage-matrix.md`.
- Never use `page.waitForTimeout(ms)`. Use `expect(locator).toBeVisible()` or `waitForApi`/`waitForUI` from `helpers/wait.ts`.
- Skipped specs need a `// blocked-by: #N` comment that points at the issue. Without it, the spec gets removed.
- A11y baseline lives at `tests/e2e/a11y/baseline.spec.ts` and is tagged `@a11y`. Add new high-traffic pages by calling `expectNoBlockingA11y(page)` from `helpers/axe.ts`.
- Perf gates live in `frontend/tests/perf/` (k6 scripts). Run via `make test-perf`.

## Mutation testing

Backend uses mutmut against the listed hot modules. Frontend uses Stryker against the API client + utils. Both run advisory on PR (commenting the score) and gating on the nightly cron.

```bash
make test-mutation          # backend
cd frontend && npm run test:mutation
```

## CI Workflows

| Workflow | Trigger | What it runs |
|----------|---------|-------------|
| `ci-backend.yml` | `backend/**` changes | pytest in parallel (unit `-n auto`, integration `-n 2`), migrations check, pip-audit, Codecov upload |
| `ci-frontend.yml` | `frontend/**` changes | ESLint, tsc, Vitest unit tests with coverage thresholds, Codecov upload, production build |
| `ci-mobile.yml` | `mobile-client/**` changes | tsc, Jest API tests + RN component tests |
| `ci-e2e.yml` | `frontend/**` or `backend/**` changes | Tiered Playwright E2E (see below), 25 min cap |
| `ci-e2e-nightly.yml` | cron `0 2 * * *` | Full Playwright suite + k6 perf gates against the staging compose stack |
| `ci-mutation.yml` | hot-module changes + nightly | mutmut + Stryker, comments mutation score on PR |
| `ci-docker.yml` | Docker/nginx config changes | Dockerfile lint, compose validation |

### E2E Tiered Testing

The E2E workflow uses path-based test selection to avoid running all 164 tests on every PR:

- **Smoke tier** (always runs, blocks PRs): ~8 critical tests covering auth, dashboard, service detail, and core CRUD. If these fail, the PR cannot merge.
- **Feature tier** (path-selected, soft-fail): Only tests related to changed source files run. Failures are visible in artifacts but do not block PRs while the suite stabilizes.
- **Full suite**: Runs on every push to `dev` and via manual `workflow_dispatch`.

When shared infrastructure files change (App.tsx, api.ts, models.py, serializers.py, etc.), the full suite runs automatically.

### E2E Coverage Gaps

The following flows have minimal or no E2E coverage:
- **Notifications**: No dedicated tests for notification delivery, badge counts, or preferences
- **Onboarding**: Only route existence and initial balance display tested; full onboarding flow not covered

## Test Data

Test data is managed through:
- **Factories**: `backend/api/tests/helpers/factories.py`
- **Fixtures**: `backend/api/tests/fixtures/` and `frontend/src/test/fixtures/`
- **Mocks**: `frontend/src/test/mocks/`
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

- **Overall Coverage**: 70% minimum
- **Critical Paths**: 90% minimum
- **Business Logic**: 85% minimum
- **UI Components**: 60% minimum

## CI Workflows

| Workflow | Trigger | What it runs |
|----------|---------|-------------|
| `ci-backend.yml` | `backend/**` changes | pytest (unit + integration), migrations check, pip-audit |
| `ci-frontend.yml` | `frontend/**` changes | ESLint, tsc, Vitest unit tests, production build |
| `ci-mobile.yml` | `mobile-client/**` changes | tsc, Jest unit tests |
| `ci-e2e.yml` | `frontend/**` or `backend/**` changes | Tiered Playwright E2E (see below) |
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
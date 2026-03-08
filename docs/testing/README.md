# Testing Documentation

Quick reference for running tests and viewing test structure for The Hive platform.

## Quick Start

### Running Tests

#### Backend tests (native)
```bash
# Run all native tests (backend unit + frontend unit, then backend integration + frontend integration)
make test

# Backend unit tests only
make test-unit   # runs backend pytest unit + frontend vitest

# Backend integration tests only
make test-integration   # runs backend pytest integration + frontend vitest
```

Backend-only (from repo root):
```bash
cd backend && python -m pytest api/tests/unit/ -q
cd backend && python -m pytest api/tests/integration/ -q
```

#### Frontend tests (native)
```bash
# From frontend directory
npm run test          # vitest watch
npm run test:run      # vitest run once
npm run test:unit     # vitest run (unit/component)
npm run test:integration  # vitest run (same suite)
npm run test:coverage # vitest with coverage
```

#### E2E tests (Playwright)
Stack must be up (e.g. `make docker-up` or `make dev`). Base URL: nginx → `http://localhost`, or frontend only → `http://localhost:5173`.

```bash
# Run all E2E tests
make test-e2e

# Smoke suite only (critical path; used as blocking in CI)
cd frontend && npm run test:e2e:smoke

# E2E with UI
make test-e2e-ui

# E2E debug
make test-e2e-debug
```

Override base URL:
```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 make test-e2e
```

#### Coverage
```bash
make coverage          # backend + frontend coverage
make coverage-backend  # backend only
make coverage-frontend # frontend only
make coverage-report   # open HTML reports in browser
```

### Viewing Reports

- **Coverage**: `make coverage-report` (opens backend and frontend HTML reports)
- **Playwright**: after `make test-e2e`, open `frontend/tests/reports/playwright/index.html` or run `cd frontend && npm run test:e2e:report`

## Test Structure

### Backend
- **Unit**: `backend/api/tests/unit/` — models, serializers, services, utils
- **Integration**: `backend/api/tests/integration/` — API endpoints, auth, handshake, chat, etc.

### Frontend
- **Unit / component**: `frontend/src/test/` — Vitest + Testing Library (components, utils, services, regression)
- **E2E**: `frontend/tests/e2e/*.spec.ts` — Playwright; smoke suite in `smoke.spec.ts` (blocking in CI)

### CI
- **E2E workflow** (`.github/workflows/ci-e2e.yml`): runs smoke tests (required), then full E2E suite (informational). Demo data is seeded before tests.

## Coverage Targets

- **Overall**: 70% minimum
- **Critical paths**: 90% minimum
- **Business logic**: 85% minimum
- **UI components**: 60% minimum

## Test Data

- **Factories**: `backend/api/tests/helpers/factories.py`
- **Fixtures**: `backend/api/tests/fixtures/`, `frontend/src/test/fixtures/`
- **Mocks**: `frontend/src/test/mocks/`
- **E2E demo data**: `backend/setup_demo.py`; constants in `frontend/tests/e2e/helpers/demo-data.ts`

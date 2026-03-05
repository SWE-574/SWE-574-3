# End-to-End (E2E) Testing with Playwright

Our E2E testing suite is built using [Playwright](https://playwright.dev/) and is designed to test the application from the user's perspective. This ensures that all parts of the stack (frontend, backend, database, cache, and reverse proxy) work seamlessly together.

## Purpose of E2E Testing

While unit and integration tests handle isolated component testing, the purpose of E2E testing is to:
1. **Validate Core Workflows:** Ensure that essential user journeys (e.g., login, chat, group creation) functions flawlessly in a real-browser environment.
2. **Test System Integration:** Verify that the frontend correctly interacts with the real backend API, which in turn properly communicates with the PostgreSQL database and Redis cache.
3. **Catch Regression Bugs:** Provide a high degree of confidence during CI that recent code changes have not broken critical functional paths.

## Playwright Setup and Configuration

The Playwright configuration is located in `frontend/playwright.config.ts`. 

Key configuration details to be aware of:
- **Sequential Execution:** Tests are executed sequentially (`fullyParallel: false`, `workers: 1`). This is strictly necessary because tests execute against a single, shared Docker database instance. Running them in parallel could lead to data state conflicts and flaky test behavior.
- **Base URL:** The default endpoint tested is `process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost'`, which resolves to our local Nginx container handling traffic distribution.
- **Flakiness Management:** In a CI environment, broken tests will automatically retry up to 2 times (`retries: process.env.CI ? 2 : 0`).
- **Debugging Artifacts:** Playwright is configured to automatically capture traces, screenshots, and videos on the *first retry* of a failing test, helping with debugging while keeping the initial test run lightweight (`trace: 'on-first-retry'`, `video: 'on-first-retry'`).
- **Browser:** The default testing browser is Chromium (`Desktop Chrome`).

## Directory Structure

All E2E test files are located in `frontend/tests/e2e/`.

```text
frontend/tests/e2e/
├── auth.spec.ts         # Tests for login, registration, and authentication flows
├── chat.spec.ts         # Tests for direct 1-to-1 messaging 
├── group-chat.spec.ts   # Tests for group creation and multi-user chat
├── handshake.spec.ts    # Tests for WebRTC handshakes and connections
└── helpers/             # Shared utility functions and common setup logic
```

## Running Tests Locally

To run E2E tests, you do **not** need to manually start the environment. The project's `Makefile` handles spinning up an isolated Docker environment, running migrations, and seeding the database.

Run the entire E2E test suite from the root directory:
```bash
make test-e2e
```

**What happens under the hood?**
1. Spins up `db`, `redis`, `backend`, and `frontend` Docker services using a special `DJANGO_E2E=1` flag.
2. Runs Django database migrations.
3. Seeds the demo data (`setup_demo.py`) inside the isolated E2E backend.
4. Kicks off the Playwright test suite (inside the `frontend` directory).

### Other Useful Commands

If you need to visually debug tests or see what the browser is doing:

```bash
# Open Playwright's interactive UI mode (allows running tests individually, seeing step execution)
make test-e2e-ui

# Run Playwright in debug mode with the Inspector open
make test-e2e-debug

# View the HTML report of the last test execution
cd frontend && npm run test:e2e:report
```

## How Tests Interact with Docker Services

E2E testing is highly integrated with Docker. When you invoke `make test-e2e`:
- It sets the environment variable `DJANGO_E2E=1` as well as `VITE_E2E=1`.
- It forces recreation of the `backend` and `frontend` containers (`--force-recreate`) to ensure a completely clean state.
- Playwright controls a browser hosted on your local machine, pointing it at the full application exposed via Docker (usually port 80 or 5173). 
- It relies on data that is deterministically seeded before the tests start executing (`DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py`).

## Guidelines for Adding New E2E Tests

If you are contributing a new feature that adds a critical user workflow, you should add an accompanying E2E test. 

1. **Create the Spec File:** Add your new file to `frontend/tests/e2e/` following the naming convention `<feature>.spec.ts`.
2. **Do Not Rely on External State:** E2E tests share the same database state sequentially. If your test creates data (e.g., creating a user or sending a message) assume it persists for subsequent tests. Clean it up if possible, or build robust assertions that don't depend on static list lengths.
3. **Use Helpers:** If your tests require a user to be continuously signed in, check `frontend/tests/e2e/helpers/` to reuse common tasks.
4. **Resiliency:** Use `locator.waitFor()` or rely on Playwright's auto-waiting mechanisms (like `await page.click('button')`) rather than hardcoded `page.waitForTimeout(5000)`. Wait for actual UI state changes, network responses, or DOM mutations. Docker services might experience slow processing.
5. **Test Data:** Rely on the users/data generated by `setup_demo.py`, or use generic users designated specifically for E2E purposes. 

.PHONY: help env \
        setup setup-demo dev dev-all stop reset install migrate makemigrations lint build clean \
        mobile mobile-setup \
        mobile-build-android mobile-build-android-local mobile-build-android-emulator mobile-build-android-emulator-clean mobile-build-android-prod mobile-build-android-prod-clean mobile-build-ios mobile-build-preview \
        db-shell db-time db-time-reset \
        infra-up infra-down infra-reset infra-demo \
        docker-up docker-down docker-logs docker-build docker-reset docker-demo \
        prod-up prod-down prod-logs prod-build prod-reset prod-demo \
        shell-backend shell-db shell-redis \
        test test-unit test-integration test-docker coverage coverage-backend coverage-frontend coverage-report \
        test-mutation test-mutation-html test-perf test-mobile-unit \
        test-assert-sweep test-cross-client


# ── Helpers ───────────────────────────────────────────────────────────────────
_log      = @printf '\033[1;34m→ %s\033[0m\n' $(1)
_ok       = @printf '\033[1;32m✓ %s\033[0m\n' $(1)
_warn     = @printf '\033[1;33m⚠  %s\033[0m\n' $(1)
_wait_db  = until $(COMPOSE_INFRA) exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

# ── Local dev config ──────────────────────────────────────────────────────────
PYTHON        ?= python3
VENV           = backend/.venv
PIP            = "$(CURDIR)/$(VENV)/bin/pip"
PYEXEC         = "$(CURDIR)/$(VENV)/bin/python"
COMPOSE_INFRA  = docker compose -f docker-compose.infra.yml --env-file .env
COMPOSE_DEV    = docker compose --env-file .env
COMPOSE_PROD   = docker compose -f docker-compose.prod.yml --env-file .env

# Guard: require .env
_check_env:
	@test -f .env || (printf '\033[1;31mERROR: .env not found.\033[0m Run \033[1mmake env\033[0m to generate it.\n' && exit 1)

-include .env
export

# Apple Silicon uses arm64 PostGIS image if the user hasn't overridden it
UNAME_M := $(shell uname -m)
ifeq ($(UNAME_M),arm64)
  POSTGIS_IMAGE ?= imresamu/postgis:15-3.4-alpine
endif
export POSTGIS_IMAGE


# ─────────────────────────────────────────────────────────────────────────────
#  HELP
# ─────────────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@echo ''
	@printf '\033[1mUsage:\033[0m make [target]\n'
	@echo ''
	@printf '\033[1;4mGetting Started:\033[0m\n'
	@grep -E '^(env|setup|setup-demo):.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mLocal Development:\033[0m\n'
	@grep -E '^(dev|dev-all|stop|reset|install|migrate|makemigrations|lint|build|clean):.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mMobile:\033[0m\n'
	@grep -E '^mobile[^:]*:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mDatabase:\033[0m\n'
	@grep -E '^db-[^:]*:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mInfra Only (PostGIS + Redis + MinIO):\033[0m\n'
	@grep -E '^infra-[^:]*:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mDocker Dev (full stack in containers):\033[0m\n'
	@grep -E '^docker-[^:]*:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mDocker Prod (production stack):\033[0m\n'
	@grep -E '^prod-[^:]*:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mShells:\033[0m\n'
	@grep -E '^shell-[^:]*:.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@printf '\033[1;4mTesting:\033[0m\n'
	@grep -E '^(test|test-unit|test-integration|test-docker|test-cross-client|coverage|coverage-backend|coverage-frontend|coverage-report):.*## ' $(firstword $(MAKEFILE_LIST)) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'
	@echo ''


# ─────────────────────────────────────────────────────────────────────────────
#  ENVIRONMENT
# ─────────────────────────────────────────────────────────────────────────────

env: ## Interactive .env generator
	@bash scripts/setup-env.sh


# ─────────────────────────────────────────────────────────────────────────────
#  LOCAL DEVELOPMENT  (infra via docker compose, backend/frontend natively)
# ─────────────────────────────────────────────────────────────────────────────

setup: _check_env ## One-time local setup: venv, deps, infra, migrate, mobile deps
	$(call _log,"[1/6] Python virtual environment...")
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	$(call _log,"[2/6] Installing backend dependencies...")
	@$(PIP) install -q -r backend/requirements.txt
	$(call _log,"[3/6] Starting infra (PostGIS + Redis + MinIO)...")
	@$(COMPOSE_INFRA) up -d
	@echo "  Waiting for database to accept connections..."
	@$(_wait_db)
	@sleep 2
	$(call _log,"[4/6] Running Django migrations...")
	@sh -c 'set -e; for i in 1 2 3 4 5; do cd "$(CURDIR)/backend" && "$(CURDIR)/$(VENV)/bin/python" manage.py migrate && exit 0; echo "  DB not ready yet (attempt $$i/5), retrying in 3s..."; sleep 3; done; echo "migrate failed after 5 attempts"; exit 1'
	$(call _log,"[5/6] Installing frontend dependencies...")
	@cd frontend && npm install --silent
	$(call _log,"[6/6] Installing mobile dependencies...")
	@cd mobile-client && npm install --silent
	@echo ""
	$(call _ok,"Setup complete! Run  make dev  to start.")
	@echo "  Tip: Run  make setup-demo  to also seed demo data."

setup-demo: setup ## One-time local setup + seed demo data
	$(call _log,"Seeding demo data...")
	@cd backend && DJANGO_SETTINGS_MODULE=hive_project.settings $(PYEXEC) setup_demo.py
	$(call _ok,"Demo data seeded. Login: elif@demo.com / demo123")

dev: _check_env ## Start local dev: infra + backend (8000) + frontend (5173)
	@# Scope to LISTEN sockets so we kill the actual server processes only,
	@# not the browser tab that has an outbound connection open to 5173.
	@for port in 8000 5173; do \
	  pid=$$(lsof -ti tcp:$$port -sTCP:LISTEN 2>/dev/null); \
	  if [ -n "$$pid" ]; then \
	    echo "  Killing process on port $$port (PID $$pid)..."; \
	    kill -9 $$pid 2>/dev/null || true; \
	    sleep 0.3; \
	  fi; \
	done
	$(call _log,"Starting infra...")
	@$(COMPOSE_INFRA) up -d
	@$(_wait_db)
	$(call _log,"Starting backend (http://localhost:8000) and frontend (http://localhost:5173)...")
	@echo "  Press Ctrl+C to stop both."
	@echo ""
	@BACKEND_PID=0; FRONTEND_PID=0; \
	 cleanup() { kill $$BACKEND_PID $$FRONTEND_PID 2>/dev/null; wait $$BACKEND_PID $$FRONTEND_PID 2>/dev/null; }; \
	 trap cleanup INT TERM; \
	 (cd backend && $(PYEXEC) -m daphne -b 0.0.0.0 -p 8000 hive_project.asgi:application 2>&1 \
	   | awk '{print "\033[0;36m[backend]\033[0m " $$0; fflush()}') & BACKEND_PID=$$!; \
	 (cd frontend && VITE_BACKEND_URL=http://localhost:8000 npm run dev 2>&1 \
	   | awk '{print "\033[0;35m[frontend]\033[0m " $$0; fflush()}') & FRONTEND_PID=$$!; \
	 wait

dev-all: _check_env ## Start local dev: backend + frontend + mobile Expo server
	@for port in 8000 5173 8081; do \
	  pid=$$(lsof -ti tcp:$$port -sTCP:LISTEN 2>/dev/null); \
	  if [ -n "$$pid" ]; then \
	    echo "  Killing process on port $$port (PID $$pid)..."; \
	    kill -9 $$pid 2>/dev/null || true; \
	    sleep 0.3; \
	  fi; \
	done
	$(call _log,"Starting infra...")
	@$(COMPOSE_INFRA) up -d
	@$(_wait_db)
	$(call _log,"Starting backend + frontend + mobile...")
	@echo "  Backend:  http://localhost:8000"
	@echo "  Frontend: http://localhost:5173"
	@echo "  Expo:     Press 'a' for Android, 'i' for iOS in the Expo terminal"
	@echo "  Press Ctrl+C to stop all."
	@echo ""
	@BACKEND_PID=0; FRONTEND_PID=0; MOBILE_PID=0; \
	 cleanup() { kill $$BACKEND_PID $$FRONTEND_PID $$MOBILE_PID 2>/dev/null; wait $$BACKEND_PID $$FRONTEND_PID $$MOBILE_PID 2>/dev/null; }; \
	 trap cleanup INT TERM; \
	 (cd backend && $(PYEXEC) -m daphne -b 0.0.0.0 -p 8000 hive_project.asgi:application 2>&1 \
	   | awk '{print "\033[0;36m[backend]\033[0m " $$0; fflush()}') & BACKEND_PID=$$!; \
	 (cd frontend && VITE_BACKEND_URL=http://localhost:8000 npm run dev 2>&1 \
	   | awk '{print "\033[0;35m[frontend]\033[0m " $$0; fflush()}') & FRONTEND_PID=$$!; \
	 (cd mobile-client && npx expo start 2>&1 \
	   | awk '{print "\033[0;33m[mobile]\033[0m " $$0; fflush()}') & MOBILE_PID=$$!; \
	 wait

stop: infra-down ## Stop local infra (alias for infra-down)

reset: infra-reset ## Stop infra AND delete all data volumes (alias for infra-reset)

install: ## Install all dependencies (backend + frontend + mobile)
	@$(PIP) install -r backend/requirements.txt
	@cd frontend && npm install
	@cd mobile-client && npm install

migrate: _check_env ## Run Django migrations (native, requires infra running)
	@cd backend && $(PYEXEC) manage.py migrate

makemigrations: _check_env ## Create new Django migrations (use APP=<name> to scope)
ifdef APP
	@cd backend && $(PYEXEC) manage.py makemigrations $(APP)
else
	@cd backend && $(PYEXEC) manage.py makemigrations
endif

lint: ## Run ESLint on the frontend
	@cd frontend && npm run lint

build: ## Build the frontend for production
	@cd frontend && npm run build

clean: ## Clean generated files and caches
	@find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@find . -type d -name "htmlcov" -exec rm -rf {} + 2>/dev/null || true
	@rm -rf backend/tests/reports frontend/tests/reports frontend/coverage
	$(call _ok,"Cleaned.")


# ─────────────────────────────────────────────────────────────────────────────
#  MOBILE
# ─────────────────────────────────────────────────────────────────────────────

mobile: _check_env ## Start Expo dev server for mobile
	$(call _log,"Starting Expo dev server...")
	@cd mobile-client && npx expo start

mobile-setup: ## Install mobile dependencies
	$(call _log,"Installing mobile dependencies...")
	@cd mobile-client && npm install
	$(call _ok,"Mobile setup complete.")

mobile-build-android: ## EAS production build for Android (APK)
	@cd mobile-client && npm run build:android

mobile-build-android-local: ## Local gradle release build (APK in android/app/build/outputs/apk/release/)
	@cd mobile-client && npm run build:android:local

mobile-build-android-emulator: ## Local gradle release APK pointed at 10.0.2.2 (Android emulator + local backend)
	@cd mobile-client && npm run build:android:emulator

mobile-build-android-prod: ## Local gradle release APK pointed at apiary.selmangunes.com (sideloadable; Mapbox token from .env)
	@cd mobile-client && npm run build:android:prod

mobile-build-android-prod-clean: ## Same as -prod, but wipes the JS bundle cache first (use after switching env vars)
	@cd mobile-client && npm run build:android:prod:clean

mobile-build-android-emulator-clean: ## Same as -emulator, but wipes the JS bundle cache first
	@cd mobile-client && npm run build:android:emulator:clean

mobile-build-ios: ## EAS production build for iOS
	@cd mobile-client && npm run build:ios

mobile-build-preview: ## EAS preview build for Android + iOS (internal distribution)
	@cd mobile-client && npm run build:preview


# ─────────────────────────────────────────────────────────────────────────────
#  DATABASE
# ─────────────────────────────────────────────────────────────────────────────

db-shell: _check_env ## Open psql prompt in the DB container
	@$(COMPOSE_INFRA) exec db psql -U $${DB_USER:-postgres} -d $${DB_NAME:-the_hive_db}

db-time: _check_env ## Set DB container clock (SET="2026-04-15 10:00" or OFFSET="+2 days")
ifdef SET
	$(call _log,"Setting DB container clock to: $(SET)")
	@docker exec hive_db date -s "$(SET)" 2>/dev/null || \
	  ($(call _warn,"'date -s' failed — try: make db-time SET=\"YYYY-MM-DD HH:MM:SS\"") && exit 1)
	$(call _ok,"DB clock set to: $(SET)")
	@echo "  Current DB time: $$(docker exec hive_db date)"
else ifdef OFFSET
	$(call _log,"Shifting DB container clock by: $(OFFSET)")
	@CURRENT=$$(docker exec hive_db date '+%Y-%m-%d %H:%M:%S'); \
	 NEW=$$(docker exec hive_db date -d "$$CURRENT $(OFFSET)" '+%Y-%m-%d %H:%M:%S' 2>/dev/null); \
	 if [ -z "$$NEW" ]; then \
	   echo "ERROR: Could not parse offset '$(OFFSET)'. Use format like '+2 days', '+5 hours', '-1 day'."; exit 1; \
	 fi; \
	 docker exec hive_db date -s "$$NEW"; \
	 printf '\033[1;32m✓ DB clock shifted by %s → %s\033[0m\n' "$(OFFSET)" "$$NEW"
else
	@echo "Usage:"
	@echo "  make db-time SET=\"2026-04-15 10:00:00\"    Set to specific time"
	@echo "  make db-time OFFSET=\"+2 days\"              Shift forward/backward"
	@echo "  make db-time-reset                         Restore real time"
endif

db-time-reset: _check_env ## Restore DB container to real time (restarts container)
	$(call _log,"Restarting DB container to restore real time...")
	@$(COMPOSE_INFRA) restart db
	@$(_wait_db)
	$(call _ok,"DB clock restored. Current time: $$(docker exec hive_db date)")


# ─────────────────────────────────────────────────────────────────────────────
#  INFRA ONLY  (PostGIS + Redis + MinIO — for running backend/frontend natively)
# ─────────────────────────────────────────────────────────────────────────────

infra-up: _check_env ## Start infra containers (db, redis, minio)
	$(call _log,"Starting infra...")
	@$(COMPOSE_INFRA) up -d
	@echo "  Waiting for database..."
	@$(_wait_db)
	$(call _ok,"Infra running. db=localhost:$(DB_PORT)  redis=localhost:$(REDIS_PORT)  minio=localhost:$(MINIO_API_PORT)")

infra-down: ## Stop infra containers
	$(call _log,"Stopping infra...")
	@$(COMPOSE_INFRA) down
	$(call _ok,"Infra stopped.")

infra-reset: ## Stop infra AND delete all data volumes
	$(call _warn,"This will permanently delete all infra volumes (database, redis, minio).")
	@printf "Continue? [y/N] " && read ans && [ "$${ans:-N}" = "y" ] || (echo "Aborted."; exit 1)
	@$(COMPOSE_INFRA) down -v --remove-orphans
	$(call _ok,"Infra stopped and volumes deleted.")

infra-demo: _check_env infra-up ## Start infra + seed demo data (native backend)
	$(call _log,"Running migrations...")
	@$(MAKE) migrate
	$(call _log,"Seeding demo data...")
	@cd backend && DJANGO_SETTINGS_MODULE=hive_project.settings $(PYEXEC) setup_demo.py
	$(call _ok,"Demo data seeded. Login: elif@demo.com / demo123")


# ─────────────────────────────────────────────────────────────────────────────
#  SHELLS
# ────────────────────────────────────────────────���────────────────────────────

shell-backend: _check_env ## Open bash in the backend container
	@$(COMPOSE_DEV) exec backend bash

shell-db: _check_env db-shell ## Open psql in the DB container (alias for db-shell)

shell-redis: _check_env ## Open redis-cli in the Redis container
	@$(COMPOSE_INFRA) exec redis redis-cli


# ─────────────────────────────────────────────────────────────────────────────
#  TESTING (native — requires venv + node_modules already installed)
# ─────────────────────────────────────────────────────────────────────────────

test: ## Run all native tests (backend unit + integration, frontend once)
	$(call _log,"Backend unit tests...")
	@cd backend && $(PYEXEC) -m pytest api/tests/unit/ -q
	$(call _log,"Backend integration tests...")
	@cd backend && $(PYEXEC) -m pytest api/tests/integration/ -q
	$(call _log,"Frontend tests...")
	@cd frontend && npm run test -- --run --reporter=verbose

test-unit: ## Run backend + frontend unit tests
	$(call _log,"Backend unit tests...")
	@cd backend && $(PYEXEC) -m pytest api/tests/unit/ -q
	$(call _log,"Frontend unit tests...")
	@cd frontend && npm run test -- --run --reporter=verbose

test-integration: ## Run backend + frontend integration tests
	$(call _log,"Backend integration tests...")
	@cd backend && $(PYEXEC) -m pytest api/tests/integration/ -q
	$(call _warn,"Frontend has no separate integration suite — running full vitest suite...")
	@cd frontend && npm run test -- --run --reporter=verbose

coverage: ## Generate combined coverage
	@$(MAKE) coverage-backend
	@$(MAKE) coverage-frontend

coverage-backend: ## Generate backend coverage report
	@cd backend && $(PYEXEC) -m pytest --cov=api --cov-report=html:tests/reports/coverage/html --cov-report=term --cov-report=json:tests/reports/coverage/coverage.json

coverage-frontend: ## Generate frontend coverage report
	@cd frontend && npm run test -- --run --coverage --coverage.reporter=html --coverage.reporter=text --coverage.reportsDirectory=tests/reports/coverage

coverage-report: ## Open coverage reports in the default browser
	@if command -v open >/dev/null 2>&1; then \
	   open backend/tests/reports/coverage/html/index.html; \
	   open frontend/tests/reports/coverage/index.html; \
	 elif command -v xdg-open >/dev/null 2>&1; then \
	   xdg-open backend/tests/reports/coverage/html/index.html; \
	   xdg-open frontend/tests/reports/coverage/index.html; \
	 else \
	   echo "Cannot detect browser opener. Open these manually:"; \
	   echo "  backend/tests/reports/coverage/html/index.html"; \
	   echo "  frontend/tests/reports/coverage/index.html"; \
	 fi

test-mutation: ## Run mutmut against backend hot modules (ranking, scoring, services)
	$(call _log,"Backend mutation tests (mutmut)...")
	@cd backend && $(PYEXEC) -m mutmut run || true
	@cd backend && $(PYEXEC) -m mutmut results

test-mutation-html: ## Generate browsable mutmut HTML report
	@cd backend && $(PYEXEC) -m mutmut html
	$(call _ok,"Mutmut HTML report at backend/html/index.html")

test-perf: ## Run k6 perf gates against the running stack
	$(call _log,"Running k6 perf gates...")
	@command -v k6 >/dev/null 2>&1 || { echo "k6 not installed: brew install k6"; exit 1; }
	@for script in frontend/tests/perf/*.js; do \
	   echo "→ $$script"; \
	   k6 run "$$script" || exit 1; \
	 done

test-mobile-unit: ## Run mobile-client Jest test suite
	@cd mobile-client && npm test -- --watchAll=false

test-cross-client: ## Run cross-client (web↔mobile) integration tests against a live backend
	$(call _log,"Cross-client tests (requires backend at http://localhost:8000)...")
	@cd tests/cross-client && node --test

test-assert-sweep: ## Lint guardrail: forbid raw status_code asserts and TestCase subclasses
	$(call _log,"Checking for raw status_code asserts under api/tests/integration/...")
	@cd backend && $(PYEXEC) -m scripts.codemods.sweep_status_assertions --check api/tests/integration/
	$(call _log,"Checking no TestCase subclasses survive in api/tests/unit/...")
	@if grep -rEn "class \w+\((TestCase|APITestCase|TransactionTestCase|HypothesisTestCase)\)" \
	     backend/api/tests/unit/ --include="*.py" 2>/dev/null; then \
	   printf '\033[1;31mERROR: TestCase subclasses found in unit tests:\033[0m\n'; \
	   exit 1; \
	 fi
	$(call _ok,"Assertion sweep guardrail clean.")


# ─────────────────────────────────────────────────────────────────────────────
#  DOCKER DEV  (full stack in containers — docker-compose.yml)
# ─────────────────────────────────────────────────────────────────────────────

docker-up: _check_env ## Start the full Docker dev stack
	@$(COMPOSE_DEV) up -d
	$(call _ok,"Docker dev stack running. http://localhost")

docker-down: ## Stop Docker dev containers
	@$(COMPOSE_DEV) down

docker-logs: ## Tail Docker dev logs
	@$(COMPOSE_DEV) logs -f

docker-build: ## Build Docker dev images
	@$(COMPOSE_DEV) build

docker-reset: ## Stop Docker dev AND delete all data volumes
	$(call _warn,"This will permanently delete all Docker dev volumes.")
	@printf "Continue? [y/N] " && read ans && [ "$${ans:-N}" = "y" ] || (echo "Aborted."; exit 1)
	@$(COMPOSE_DEV) down -v --remove-orphans
	$(call _ok,"Docker dev stopped and volumes deleted.")

docker-demo: _check_env ## Start Docker dev stack + seed demo data
	$(call _log,"Starting Docker dev environment...")
	@$(COMPOSE_DEV) up -d --build
	$(call _log,"Waiting for backend to be healthy...")
	@sh -c 'set -e; for i in 1 2 3 4 5 6 7 8 9 10; do $(COMPOSE_DEV) exec -T backend python manage.py migrate && exit 0; echo "  Backend not ready yet (attempt $$i/10), retrying..."; sleep 3; done; echo "migrate failed after retries"; exit 1'
	$(call _log,"Seeding demo data...")
	@$(COMPOSE_DEV) exec -T backend bash -lc "cd /code && DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py"
	$(call _ok,"Docker dev + demo ready: http://localhost")
	@echo "  Login: elif@demo.com / demo123"


# ─────────────────────────────────────────────────────────────────────────────
#  DOCKER PROD  (production stack — docker-compose.prod.yml)
# ─────────────────────────────────────────────────────────────────────────────

prod-up: _check_env ## Start the production Docker stack
	$(call _log,"Starting production stack...")
	@$(COMPOSE_PROD) up -d
	$(call _ok,"Production stack running.")

prod-down: ## Stop production Docker containers
	@$(COMPOSE_PROD) down

prod-logs: ## Tail production Docker logs
	@$(COMPOSE_PROD) logs -f

prod-build: _check_env ## Build production Docker images
	@$(COMPOSE_PROD) build

prod-reset: ## Stop production AND delete all data volumes
	$(call _warn,"This will permanently delete all PRODUCTION volumes (database, redis, minio).")
	@printf "Continue? [y/N] " && read ans && [ "$${ans:-N}" = "y" ] || (echo "Aborted."; exit 1)
	@$(COMPOSE_PROD) down -v --remove-orphans
	$(call _ok,"Production stopped and volumes deleted.")

prod-demo: _check_env ## Start production stack + seed demo data
	$(call _log,"Starting production environment...")
	@$(COMPOSE_PROD) up -d --build
	$(call _log,"Waiting for backend to be healthy...")
	@sh -c 'set -e; for i in 1 2 3 4 5 6 7 8 9 10; do $(COMPOSE_PROD) exec -T backend python manage.py migrate && exit 0; echo "  Backend not ready yet (attempt $$i/10), retrying..."; sleep 3; done; echo "migrate failed after retries"; exit 1'
	$(call _log,"Seeding demo data...")
	@$(COMPOSE_PROD) exec -T backend bash -lc "cd /code && DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py"
	$(call _ok,"Production + demo ready.")
	@echo "  Login: elif@demo.com / demo123"


# ─────────────────────────────────────────────────────────────────────────────
#  DOCKER TESTING
# ──────────────────────────────────────────────────��──────────────────────────

test-docker: _check_env ## Run backend tests inside Docker dev stack
	@$(COMPOSE_DEV) up -d db redis backend
	@$(COMPOSE_DEV) exec -T backend pytest --cov=api --cov-report=term -q

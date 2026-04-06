.PHONY: help env setup setup-demo dev stop reset install migrate lint test test-unit test-integration \
        test-docker coverage coverage-backend coverage-frontend coverage-report \
        clean build \
        infra-up infra-down infra-reset infra-demo \
        docker-up docker-down docker-logs docker-build docker-reset docker-demo \
        prod-up prod-down prod-logs prod-build prod-reset prod-demo


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

# ─────────────────────────────────────────────────────────────────────────────
#  ENVIRONMENT VARIABLES
# ─────────────────────────────────────────────────────────────────────────────
# ── Guard: require .env ──────────────────────────────────────────────────────
_check_env:
	@test -f .env || (echo "ERROR: .env not found. Copy .env.example → .env first." && exit 1)

-include .env
export

# Apple Silicon uses arm64 PostGIS image if the user hasn't overridden it
UNAME_M := $(shell uname -m)
ifeq ($(UNAME_M),arm64)
  POSTGIS_IMAGE ?= imresamu/postgis:15-3.4-alpine
endif
export POSTGIS_IMAGE


# ─────────────────────────────────────────────────────────────────────────────
#  Help
# ─────────────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Local development (infra in Docker, backend/frontend native):'
	@grep -E '^(env|setup|setup-demo|dev|stop|reset|install|migrate|lint|build|clean):.*## ' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Infra only (PostGIS + Redis + MinIO containers):'
	@grep -E '^infra-.*:.*## ' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Docker dev (full stack in containers):'
	@grep -E '^docker-.*:.*## ' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Docker prod (production stack):'
	@grep -E '^prod-.*:.*## ' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Testing (native):'
	@grep -E '^(test|test-unit|test-integration|coverage|coverage-backend|coverage-frontend|coverage-report):.*## ' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Docker testing:'
	@grep -E '^test-docker:.*## ' $(firstword $(MAKEFILE_LIST)) | sort | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─────────────────────────────────────────────────────────────────────────────
#  LOCAL DEVELOPMENT  (infra via docker compose, backend/frontend natively)
# ─────────────────────────────────────────────────────────────────────────────

env: ## Interactive .env generator (prompts for API keys, DB creds, etc.)
	@bash scripts/setup-env.sh

setup: _check_env ## One-time local setup: venv, deps, infra, migrate
	$(call _log,"[1/5] Python virtual environment...")
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	$(call _log,"[2/5] Installing backend dependencies...")
	@$(PIP) install -q -r backend/requirements.txt
	$(call _log,"[3/5] Starting infra (PostGIS + Redis + MinIO)...")
	@$(COMPOSE_INFRA) up -d
	@echo "  Waiting for database to accept connections..."
	@$(_wait_db)
	@sleep 2
	$(call _log,"[4/5] Running Django migrations...")
	@sh -c 'set -e; for i in 1 2 3 4 5; do cd "$(CURDIR)/backend" && "$(CURDIR)/$(VENV)/bin/python" manage.py migrate && exit 0; echo "  DB not ready yet (attempt $$i/5), retrying in 3s..."; sleep 3; done; echo "migrate failed after 5 attempts"; exit 1'
	$(call _log,"[5/5] Installing frontend dependencies...")
	@cd frontend && npm install --silent
	@echo ""
	$(call _ok,"Setup complete! Run  make dev  to start.")
	@echo "  Tip: Run  make setup-demo  to also seed demo data."

setup-demo: setup ## One-time local setup + seed demo data
	$(call _log,"Seeding demo data...")
	@cd backend && DJANGO_SETTINGS_MODULE=hive_project.settings $(PYEXEC) setup_demo.py
	$(call _ok,"Demo data seeded. Login: elif@demo.com / demo123")

dev: _check_env ## Start local dev: infra + backend (8000) + frontend (5173) in parallel
	@for port in 8000 5173; do \
	  pid=$$(lsof -ti tcp:$$port 2>/dev/null); \
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

stop: infra-down ## Stop local infra (alias for infra-down)

reset: infra-reset ## Stop infra AND delete all data volumes (alias for infra-reset)

install: ## Install all dependencies (backend into venv, frontend via npm)
	@$(PIP) install -r backend/requirements.txt
	@cd frontend && npm install

migrate: _check_env ## Run Django migrations (native, requires infra running)
	@cd backend && $(PYEXEC) manage.py migrate

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
# ─────────────────────────────────────────────────────────────────────────────

test-docker: _check_env ## Run backend tests inside Docker dev stack
	@$(COMPOSE_DEV) up -d db redis backend
	@$(COMPOSE_DEV) exec -T backend pytest --cov=api --cov-report=term -q

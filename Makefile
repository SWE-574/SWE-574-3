.PHONY: help setup dev stop reset install test test-unit test-integration \
        test-docker coverage coverage-backend coverage-frontend coverage-report \
        clean demo build up down logs docker-build

# ── Helpers ───────────────────────────────────────────────────────────────────
_log   = @printf '\033[1;34m→ %s\033[0m\n' $(1)
_ok    = @printf '\033[1;32m✓ %s\033[0m\n' $(1)
_warn  = @printf '\033[1;33m⚠  %s\033[0m\n' $(1)

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

ifeq ($(wildcard .env),)
  $(error ERROR: .env not found. Copy .env.example → .env first.)
endif

include .env
export

# Apple Silicon uses arm64 PostGIS image if the user hasn't overridden it
UNAME_M := $(shell uname -m)
ifeq ($(UNAME_M),arm64)
  POSTGIS_IMAGE ?= postgis/postgis:15-3.4-alpine
endif
export POSTGIS_IMAGE


# ─────────────────────────────────────────────────────────────────────────────
#  Help
# ─────────────────────────────────────────────────────────────────────────────

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Local development:'
	@grep -E '^(setup|dev|stop|reset|install|demo|build|clean):.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Testing (native):'
	@grep -E '^(test|test-unit|test-integration|coverage):.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ''
	@echo 'Docker:'
	@grep -E '^(up|down|logs|docker-build|test-docker):.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─────────────────────────────────────────────────────────────────────────────
#  LOCAL DEVELOPMENT  (infra via docker compose, backend/frontend natively)
# ─────────────────────────────────────────────────────────────────────────────

setup: _check_env ## One-time local setup: venv, deps, infra, migrate, demo data
	$(call _log,"[1/6] Python virtual environment...")
	@test -d $(VENV) || $(PYTHON) -m venv $(VENV)
	$(call _log,"[2/6] Installing backend dependencies...")
	@$(PIP) install -q -r backend/requirements.txt
	$(call _log,"[3/6] Starting infra (PostGIS + Redis)...")
	@$(COMPOSE_INFRA) up -d
	@echo "  Waiting for database to accept connections..."
	@until docker compose -f docker-compose.infra.yml exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
	@sleep 2
	$(call _log,"[4/6] Running Django migrations...")
	@sh -c 'set -e; for i in 1 2 3 4 5; do cd "$(CURDIR)/backend" && "$(CURDIR)/$(VENV)/bin/python" manage.py migrate && exit 0; echo "  DB not ready yet (attempt $$i/5), retrying in 3s..."; sleep 3; done; echo "migrate failed after 5 attempts"; exit 1'
	$(call _log,"[5/6] Installing frontend dependencies...")
	@cd frontend && npm install --silent
	$(call _log,"[6/6] Seeding demo data...")
	@cd backend && DJANGO_SETTINGS_MODULE=hive_project.settings $(PYEXEC) setup_demo.py
	@echo ""
	$(call _ok,"Setup complete! Run  make dev  to start.")
	@echo "  Login: elif@demo.com / demo123"

dev: _check_env ## Start local dev: infra + backend (8000) + frontend (5173) in parallel
	$(call _log,"Starting infra...")
	@$(COMPOSE_INFRA) up -d
	@until docker compose -f docker-compose.infra.yml exec -T db pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
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

stop: ## Stop local infra (PostGIS + Redis containers)
	$(call _log,"Stopping infra...")
	@$(COMPOSE_INFRA) down
	$(call _ok,"Infra stopped.")

reset: ## Stop infra AND delete all Postgres + Redis data volumes (full reset)
	$(call _warn,"This will permanently delete all local database and cache data.")
	@printf "Continue? [y/N] " && read ans && [ "$${ans:-N}" = "y" ] || (echo "Aborted."; exit 1)
	$(call _log,"Stopping infra and removing volumes...")
	@$(COMPOSE_INFRA) down -v --remove-orphans
	$(call _ok,"Infra stopped and volumes deleted.")
	@echo "  Run  make setup  to reinitialise."

install: ## Install all dependencies
	@cd backend && pip install -r requirements.txt
	@cd frontend && npm install

demo: _check_env ## Seed demo data (Docker stack)
	$(call _log,"Starting Docker demo environment...")
	@$(COMPOSE_DEV) up -d --build
	$(call _log,"Running migrations...")
	@sh -c 'set -e; for i in 1 2 3 4 5 6 7 8 9 10; do docker compose exec -T backend python manage.py migrate && exit 0; echo "migrate not ready yet (attempt $$i/10), retrying..."; sleep 2; done; echo "migrate failed after retries"; exit 1'
	$(call _log,"Seeding demo data...")
	@docker compose exec -T backend bash -lc "cd /code && DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py"
	$(call _ok,"Demo ready: http://localhost:5173")

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
#  TESTING (native — requires venv + node_modules already installed)
# ─────────────────────────────────────────────────────────────────────────────

test: ## Run all native tests (backend + frontend)
	@$(MAKE) test-unit
	@$(MAKE) test-integration

test-unit: ## Run backend + frontend unit tests
	$(call _log,"Backend unit tests...")
	@cd backend && $(PYEXEC) -m pytest api/tests/unit/ -q
	$(call _log,"Frontend unit tests...")
	@cd frontend && npm run test:unit -- --reporter=verbose

test-integration: ## Run backend + frontend integration tests
	$(call _log,"Backend integration tests...")
	@cd backend && $(PYEXEC) -m pytest api/tests/integration/ -q
	$(call _log,"Frontend integration tests...")
	@cd frontend && npm run test:integration -- --reporter=verbose

coverage: ## Generate combined coverage
	@$(MAKE) coverage-backend
	@$(MAKE) coverage-frontend

coverage-backend: ## Generate backend coverage report
	@cd backend && $(PYEXEC) -m pytest --cov=api --cov-report=html:tests/reports/coverage/html --cov-report=term --cov-report=json:tests/reports/coverage/coverage.json

coverage-frontend: ## Generate frontend coverage report
	@cd frontend && npm run test:run -- --coverage --coverage.reporter=html --coverage.reporter=text --coverage.reportsDirectory=tests/reports/coverage

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
#  DOCKER  (full stack in containers)
# ─────────────────────────────────────────────────────────────────────────────

up: _check_env ## Start the full Docker dev stack
	@$(COMPOSE_DEV) up -d
	$(call _ok,"Docker dev stack running. http://localhost")

down: ## Stop Docker containers
	@$(COMPOSE_DEV) down

logs: ## Tail Docker logs
	@$(COMPOSE_DEV) logs -f

docker-build: ## Build Docker images
	@$(COMPOSE_DEV) build

test-docker: _check_env ## Run backend tests inside Docker
	@$(COMPOSE_DEV) up -d db redis backend
	@docker compose exec -T backend pytest --cov=api --cov-report=term -q

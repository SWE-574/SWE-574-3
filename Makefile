.PHONY: help install test test-backend test-frontend test-e2e test-all coverage coverage-backend coverage-frontend coverage-report clean demo build

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

test-backend: ## Run backend unit and integration tests
	docker compose up -d db redis backend
	docker compose exec -T backend pytest --html=tests/reports/backend-test-report.html --self-contained-html --cov=api --cov-report=html:tests/reports/coverage/html --cov-report=term --cov-report=json:tests/reports/coverage/coverage.json

test-backend-unit: ## Run backend unit tests only
	docker compose up -d db redis backend
	docker compose exec -T backend pytest api/tests/unit/ --html=tests/reports/backend-unit-test-report.html --self-contained-html --cov=api --cov-report=html:tests/reports/coverage/html --cov-report=term

test-backend-integration: ## Run backend integration tests only
	docker compose up -d db redis backend
	docker compose exec -T backend pytest api/tests/integration/ --html=tests/reports/backend-integration-test-report.html --self-contained-html --cov=api --cov-report=html:tests/reports/coverage/html --cov-report=term

test-frontend: ## Run frontend unit tests
	cd frontend && npm run test:run -- --reporter=html --reporter=verbose --outputFile=tests/reports/frontend-test-report.html --coverage

test-frontend-unit: ## Run frontend unit tests only
	cd frontend && npm run test:unit -- --reporter=html --reporter=verbose --outputFile=tests/reports/frontend-unit-test-report.html

test-frontend-integration: ## Run frontend integration tests
	cd frontend && npm run test:integration -- --reporter=html --reporter=verbose --outputFile=tests/reports/frontend-integration-test-report.html

test-e2e: ## Run E2E tests with Playwright
	@echo "Starting Docker services for E2E (DJANGO_E2E=1)..."
	DJANGO_E2E=1 docker compose up -d db redis
	DJANGO_E2E=1 docker compose up -d --force-recreate backend
	DJANGO_E2E=1 VITE_E2E=1 docker compose up -d --force-recreate frontend
	@echo "Running migrations (E2E)..."
	@sh -c 'set -e; for i in 1 2 3 4 5 6 7 8 9 10; do DJANGO_E2E=1 docker compose exec -T backend python manage.py migrate && exit 0; echo "migrate not ready yet (attempt $$i/10), retrying..."; sleep 2; done; echo "migrate failed after retries"; exit 1'
	@echo "Seeding demo data (E2E)..."
	DJANGO_E2E=1 docker compose exec -T backend bash -lc "cd /code && DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py"
	@echo "Running Playwright..."
	cd frontend && DJANGO_E2E=1 npm run test:e2e -- $(TEST_ARGS)

test-e2e-ui: ## Run E2E tests with UI mode
	cd frontend && npm run test:e2e:ui

test-e2e-debug: ## Run E2E tests in debug mode
	cd frontend && npm run test:e2e:debug

test-all: ## Run all tests (backend, frontend, E2E)
	$(MAKE) test-backend
	$(MAKE) test-frontend
	$(MAKE) test-e2e

coverage: ## Generate coverage reports for all tests
	$(MAKE) coverage-backend
	$(MAKE) coverage-frontend

coverage-backend: ## Generate backend coverage report
	cd backend && pytest --cov=api --cov-report=html:tests/reports/coverage/html --cov-report=term --cov-report=json:tests/reports/coverage/coverage.json

coverage-frontend: ## Generate frontend coverage report
	cd frontend && npm run test:run -- --coverage --coverage.reporter=html --coverage.reporter=text --coverage.reportsDirectory=tests/reports/coverage

coverage-report: ## Open coverage reports in browser
	@echo "Opening coverage reports..."
	@python3 -m http.server 8001 --directory backend/tests/reports/coverage/html || echo "Backend coverage: http://localhost:8001"
	@cd frontend && npx serve tests/reports/coverage || echo "Frontend coverage: http://localhost:3000"

test-reports: ## Open test reports in browser
	@echo "Opening test reports..."
	@python3 -m http.server 8002 --directory backend/tests/reports || echo "Backend reports: http://localhost:8002"
	@cd frontend && npx serve tests/reports || echo "Frontend reports: http://localhost:3001"

demo: ## Run demo data setup
	@echo "Starting Docker demo environment (db/redis/backend/frontend)..."
	docker compose up -d --build
	@echo "Running migrations..."
	@sh -c 'set -e; for i in 1 2 3 4 5 6 7 8 9 10; do docker compose exec -T backend python manage.py migrate && exit 0; echo "migrate not ready yet (attempt $$i/10), retrying..."; sleep 2; done; echo "migrate failed after retries"; exit 1'
	@echo "Seeding demo data..."
	docker compose exec -T backend bash -lc "cd /code && DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py"
	@echo "Demo ready: http://localhost:5173"

build: ## Build the application
	cd frontend && npm run build

clean: ## Clean generated files and caches
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type d -name ".pytest_cache" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name ".coverage" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name "htmlcov" -exec rm -r {} + 2>/dev/null || true
	find . -type d -name "node_modules" -prune -o -type d -name ".next" -exec rm -r {} + 2>/dev/null || true
	rm -rf backend/tests/reports
	rm -rf frontend/tests/reports
	rm -rf frontend/.next
	rm -rf frontend/coverage

docker-up: ## Start Docker containers
	docker compose up -d

docker-down: ## Stop Docker containers
	docker compose down

docker-logs: ## View Docker logs
	docker compose logs -f

docker-build: ## Build Docker images
	docker compose build

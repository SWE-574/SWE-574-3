#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-quick}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
QUICK_CI_ENV="$ROOT/.env.quick-ci"

log() {
  printf '\n\033[1;34m==> %s\033[0m\n' "$1"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

http_ready() {
  local url="$1"
  curl --fail --silent "$url" >/dev/null 2>&1
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-30}"

  for i in $(seq 1 "$attempts"); do
    if curl --fail --silent "$url" >/dev/null 2>&1; then
      echo "$label is ready"
      return 0
    fi
    echo "Waiting for $label... ($i/$attempts)"
    sleep 2
  done

  echo "$label did not become ready: $url" >&2
  return 1
}

wait_for_compose_health() {
  local compose_file="$1"
  local attempts="${2:-30}"
  local env_args=()

  if [ -n "${COMPOSE_ENV_FILE:-}" ]; then
    env_args=(--env-file "$COMPOSE_ENV_FILE")
  fi

  for i in $(seq 1 "$attempts"); do
    local unhealthy
    unhealthy="$(
      docker compose "${env_args[@]}" -f "$compose_file" ps --format json \
        | python3 -c '
import sys, json
rows = [json.loads(line) for line in sys.stdin if line.strip()]
bad = [r["Name"] for r in rows if r.get("Health", "") not in ("healthy", "")]
print("\n".join(bad))
'
    )"

    if [ -z "$unhealthy" ]; then
      echo "All containers healthy."
      return 0
    fi

    echo "Still waiting: $unhealthy ($i/$attempts)"
    sleep 5
  done

  echo "Containers did not become healthy in time." >&2
  docker compose "${env_args[@]}" -f "$compose_file" ps || true
  return 1
}

ensure_backend_infra() {
  need_cmd docker
  need_cmd curl
  need_cmd python3

  if http_ready "http://localhost:9000/minio/health/live"; then
    log "Reusing existing local infra"
    return 0
  fi

  log "Starting backend infra"
  docker compose -f "$ROOT/docker-compose.infra.yml" up -d db redis minio

  log "Waiting for backend infra"
  wait_for_http "http://localhost:9000/minio/health/live" "MinIO" 30
}

export_backend_local_env() {
  if [ ! -f "$ROOT/.env" ]; then
    echo "Missing $ROOT/.env" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$ROOT/.env"
  set +a

  export DB_HOST="${DB_HOST:-localhost}"
  export DB_PORT="${DB_PORT:-5432}"
  export REDIS_HOST="${REDIS_HOST:-localhost}"
  export REDIS_PORT="${REDIS_PORT:-6379}"
  export MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
  export DJANGO_SETTINGS_MODULE="${DJANGO_SETTINGS_MODULE:-hive_project.settings}"
}

run_backend_quick() {
  need_cmd python3
  export_backend_local_env

  log "Backend migrate"
  (
    cd "$BACKEND"
    ./.venv/bin/python manage.py migrate --no-input
  )

  log "Backend migration checks"
  (
    cd "$BACKEND"
    ./.venv/bin/python manage.py makemigrations --check --dry-run
    ./.venv/bin/python manage.py migrate --check
  )

  log "Backend tests"
  (
    cd "$BACKEND"
    mkdir -p tests/reports/coverage
    ./.venv/bin/pytest -c pytest-ci.ini
  )
}

run_frontend_quick() {
  need_cmd npm
  need_cmd npx

  log "Frontend install"
  (
    cd "$FRONTEND"
    npm ci
  )

  log "Frontend audit"
  (
    cd "$FRONTEND"
    npm audit --audit-level=high
  )

  log "Frontend lint"
  (
    cd "$FRONTEND"
    npm run lint
  )

  log "Frontend typecheck"
  (
    cd "$FRONTEND"
    npx tsc --noEmit -p tsconfig.app.json
  )

  log "Frontend unit tests"
  (
    cd "$FRONTEND"
    npm run test -- --run
  )

  log "Frontend build"
  (
    cd "$FRONTEND"
    VITE_API_URL=/api npm run build
  )
}

prepare_root_env_for_docker() {
  log "Writing temporary quick CI env file"
  cp "$ROOT/.env.example" "$QUICK_CI_ENV"
  python3 - "$QUICK_CI_ENV" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

replacements = {
    "DB_HOST=localhost": "DB_HOST=db",
    "REDIS_HOST=localhost": "REDIS_HOST=redis",
    "MINIO_ENDPOINT=localhost:9000": "MINIO_ENDPOINT=minio:9000",
}

for old, new in replacements.items():
    text = text.replace(old, new)

if "SECRET_KEY=ci-e2e-secret-key-not-used-in-production" not in text:
    text += "\nSECRET_KEY=ci-e2e-secret-key-not-used-in-production"
if "DEBUG=True" not in text:
    text += "\nDEBUG=True"
if "ALLOWED_HOSTS=localhost,127.0.0.1" not in text:
    text += "\nALLOWED_HOSTS=localhost,127.0.0.1"
if "DJANGO_E2E=1" not in text:
    text += "\nDJANGO_E2E=1"
if "DISABLE_THROTTLING=1" not in text:
    text += "\nDISABLE_THROTTLING=1"

path.write_text(text + "\n")
PY
}

run_e2e_like_workflow() {
  need_cmd docker
  need_cmd curl
  need_cmd npm
  need_cmd npx
  need_cmd python3

  prepare_root_env_for_docker

  log "Starting full stack"
  (
    cd "$ROOT"
    DJANGO_E2E=1 VITE_E2E=1 docker compose --env-file "$QUICK_CI_ENV" up -d --build
  )

  trap 'cd "$ROOT" && docker compose --env-file "$QUICK_CI_ENV" down -v || true; rm -f "$QUICK_CI_ENV"' EXIT

  log "Waiting for containers"
  COMPOSE_ENV_FILE="$QUICK_CI_ENV" wait_for_compose_health "$ROOT/docker-compose.yml" 24

  log "Smoke API"
  wait_for_http "http://localhost/api/health/" "API health" 20

  log "Smoke media proxy"
  wait_for_http "http://localhost/hive-media/" "MinIO media proxy" 20

  log "Seed demo data"
  (
    cd "$ROOT"
    DJANGO_E2E=1 docker compose --env-file "$QUICK_CI_ENV" exec -T backend \
      bash -lc "cd /code && DJANGO_SETTINGS_MODULE=hive_project.settings python setup_demo.py"
  )

  log "Frontend install for Playwright"
  (
    cd "$FRONTEND"
    npm ci
    npx playwright install --with-deps chromium
  )

  log "Run Playwright"
  (
    cd "$FRONTEND"
    PLAYWRIGHT_BASE_URL=http://localhost CI=true npm run test:e2e
  )
}

case "$MODE" in
  quick)
    ensure_backend_infra
    run_backend_quick
    run_frontend_quick
    ;;
  quick-live)
    log "Using already running local stack"
    run_backend_quick
    run_frontend_quick
    ;;
  e2e)
    run_e2e_like_workflow
    ;;
  full)
    ensure_backend_infra
    run_backend_quick
    run_frontend_quick
    run_e2e_like_workflow
    ;;
  *)
    echo "Usage: $0 [quick|quick-live|e2e|full]" >&2
    exit 1
    ;;
esac

log "Done"
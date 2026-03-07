#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Interactive .env generator for The Hive
#
# Usage:  ./scripts/setup-env.sh          (creates .env)
#         Prompts before overwriting if .env already exists.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_ENV=".env"

# ── Guard ────────────────────────────────────────────────────────────────────
if [[ -f "$ROOT_ENV" ]]; then
  printf '\033[1;33m⚠  %s already exists.\033[0m\n' "$ROOT_ENV"
  printf 'Overwrite? [y/N] '
  read -r ans
  [[ "${ans:-N}" =~ ^[Yy]$ ]] || { echo "Keeping existing .env."; exit 0; }
fi

# ── Helpers ──────────────────────────────────────────────────────────────────
blue()  { printf '\033[1;34m%s\033[0m' "$1"; }
green() { printf '\033[1;32m%s\033[0m' "$1"; }
gray()  { printf '\033[0;90m%s\033[0m' "$1"; }

prompt() {
  # prompt VAR_NAME "description" "default"
  local var="$1" desc="$2" default="${3:-}"
  if [[ -n "$default" ]]; then
    printf "  %s (%s) [%s]: " "$(blue "$var")" "$desc" "$(gray "$default")"
  else
    printf "  %s (%s): " "$(blue "$var")" "$desc"
  fi
  read -r value
  value="${value:-$default}"
  eval "$var=\"\$value\""
}

echo ""
printf '\033[1;34m──── The Hive: Environment Setup ────\033[0m\n'
echo ""
echo "This will generate $(blue "$ROOT_ENV") (single file for backend + frontend)."
echo "Press Enter to accept the [default] value."
echo ""

# ─── Database ────────────────────────────────────────────────────────────────
echo "$(green "▸ Database (PostGIS)")"
prompt DB_NAME     "database name"     "the_hive_db"
prompt DB_USER     "database user"     "postgres"
prompt DB_PASSWORD "database password" "postgres123"
prompt DB_HOST     "host"              "localhost"
prompt DB_PORT     "port"              "5432"
echo ""

# ─── Redis ───────────────────────────────────────────────────────────────────
echo "$(green "▸ Redis")"
prompt REDIS_HOST "host" "localhost"
prompt REDIS_PORT "port" "6379"
echo ""

# ─── MinIO ───────────────────────────────────────────────────────────────────
echo "$(green "▸ MinIO (S3-compatible storage)")"
prompt MINIO_ENDPOINT    "endpoint"        "localhost:9000"
prompt MINIO_ACCESS_KEY  "access key"      "minioadmin"
prompt MINIO_SECRET_KEY  "secret key"      "minioadmin123"
prompt MINIO_BUCKET_NAME "bucket name"     "hive-media"
prompt MINIO_API_PORT    "API port"        "9000"
prompt MINIO_CONSOLE_PORT "console port"   "9001"
echo ""

# ─── Django ──────────────────────────────────────────────────────────────────
echo "$(green "▸ Django")"
# Auto-generate a secret key
if command -v python3 &>/dev/null; then
  DEFAULT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))" 2>/dev/null || echo "change-me-to-a-long-random-string")
else
  DEFAULT_SECRET="change-me-to-a-long-random-string"
fi
prompt SECRET_KEY          "secret key (auto-generated)"  "$DEFAULT_SECRET"
prompt DEBUG               "debug mode"                   "True"
prompt ALLOWED_HOSTS       "allowed hosts"                "localhost,127.0.0.1"
prompt CORS_ALLOWED_ORIGINS "CORS origins"                "http://localhost,http://localhost:5173,http://localhost:3000"
prompt FRONTEND_URL        "frontend URL"                 "http://localhost:5173"
echo ""

# ─── Throttling ──────────────────────────────────────────────────────────────
echo "$(green "▸ Throttling")"
prompt THROTTLE_RELAXED    "relaxed throttle"  "True"
prompt DISABLE_THROTTLING  "disable throttling" "False"
echo ""

# ─── API Keys (optional) ────────────────────────────────────────────────────
echo "$(green "▸ API Keys") $(gray "(leave blank to skip — features will be disabled)")"
echo ""
prompt RESEND_API_KEY       "Resend email API key — https://resend.com/api-keys"  ""
prompt RESEND_CUSTOM_DOMAIN "use custom domain for Resend?"                       "false"
prompt RESEND_FROM_EMAIL    "Resend from email"                                   "onboarding@resend.dev"
echo ""
prompt VITE_MAPBOX_TOKEN    "Mapbox token — https://account.mapbox.com/access-tokens/" ""
echo ""

# ─── Production (optional) ──────────────────────────────────────────────────
echo "$(green "▸ Production") $(gray "(optional — skip for local dev)")"
prompt DOMAIN          "production domain"       ""
prompt LETSENCRYPT_DIR "Let's Encrypt directory" ""
echo ""

# ─── Write root .env ────────────────────────────────────────────────────────
cat > "$ROOT_ENV" <<EOF
# ─── Database (PostGIS) ───────────────────────────────────────────────────────
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=$DB_HOST
DB_PORT=$DB_PORT

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT

# ─── MinIO (S3-compatible object storage) ─────────────────────────────────────
MINIO_ENDPOINT=$MINIO_ENDPOINT
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET_NAME=$MINIO_BUCKET_NAME
MINIO_USE_SSL=false
MINIO_API_PORT=$MINIO_API_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# ─── Django ───────────────────────────────────────────────────────────────────
SECRET_KEY='$SECRET_KEY'
DEBUG=$DEBUG
ALLOWED_HOSTS=$ALLOWED_HOSTS
CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS

# ─── Throttling ───────────────────────────────────────────────────────────────
THROTTLE_RELAXED=$THROTTLE_RELAXED
DISABLE_THROTTLING=$DISABLE_THROTTLING

# ─── Frontend ─────────────────────────────────────────────────────────────────
VITE_API_URL=/api
FRONTEND_PORT=5173
BACKEND_PORT=8000
FRONTEND_URL=$FRONTEND_URL

# ─── Resend (email service) ───────────────────────────────────────────────────
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_CUSTOM_DOMAIN=$RESEND_CUSTOM_DOMAIN
RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL

# ─── Mapbox ───────────────────────────────────────────────────────────────────
VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}
EOF

# Add production section only if values were provided
if [[ -n "$DOMAIN" || -n "$LETSENCRYPT_DIR" ]]; then
  cat >> "$ROOT_ENV" <<EOF

# ─── TLS / Domain (production) ───────────────────────────────────────────────
EOF
  [[ -n "$DOMAIN" ]]          && echo "DOMAIN=$DOMAIN" >> "$ROOT_ENV"
  [[ -n "$LETSENCRYPT_DIR" ]] && echo "LETSENCRYPT_DIR=$LETSENCRYPT_DIR" >> "$ROOT_ENV"
fi

echo ""
printf '\033[1;32m✓ Created %s\033[0m\n' "$ROOT_ENV"
echo ""
echo "  Next steps:"
echo "    make setup       — first-time setup (no demo data)"
echo "    make setup-demo  — first-time setup + demo data"
echo "    make dev         — start local development"
echo ""

#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Interactive .env generator for The Hive
#
# Generates a single `.env` file at the repo root that the Makefile, Vite,
# Expo, and Docker compose files all read from. For production-shaped values,
# see `.env.production.example` (committed reference).
#
# Usage:  ./scripts/setup-env.sh   or   make env
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_FILE=".env"

# ── Helpers ──────────────────────────────────────────────────────────────────
blue()  { printf '\033[1;34m%s\033[0m' "$1"; }
green() { printf '\033[1;32m%s\033[0m' "$1"; }
gray()  { printf '\033[0;90m%s\033[0m' "$1"; }
warn()  { printf '\033[1;33m%s\033[0m\n' "$1"; }
ok()    { printf '\033[1;32m✓ %s\033[0m\n' "$1"; }

prompt() {
  local var="$1" desc="$2" default="${3:-}"
  if [[ -n "$default" ]]; then
    printf "  %s (%s) [%s]: " "$(blue "$var")" "$desc" "$(gray "$default")"
  else
    printf "  %s (%s): " "$(blue "$var")" "$desc"
  fi
  read -r value
  value="${value:-$default}"
  printf -v "$var" '%s' "$value"
}

prompt_yn() {
  local desc="$1" default="${2:-N}"
  printf "  %s [%s]: " "$desc" "$default"
  read -r ans
  ans="${ans:-$default}"
  [[ "$ans" =~ ^[Yy] ]]
}

detect_lan_ip() {
  local ip=""
  if command -v ipconfig &>/dev/null && [[ "$(uname)" == "Darwin" ]]; then
    ip=$(ipconfig getifaddr en0 2>/dev/null || true)
  fi
  if [[ -z "$ip" ]] && command -v hostname &>/dev/null; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  fi
  if [[ -z "$ip" ]] && command -v ip &>/dev/null; then
    ip=$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' || true)
  fi
  echo "${ip:-192.168.1.100}"
}

# ── Guard ────────────────────────────────────────────────────────────────────
# If .env exists (file or symlink), confirm before overwriting.
if [[ -e "$ENV_FILE" || -L "$ENV_FILE" ]]; then
  warn "⚠  Found existing $ENV_FILE"
  if ! prompt_yn "Overwrite? (existing file will be backed up)" "N"; then
    echo "Keeping existing $ENV_FILE."
    exit 0
  fi
  if [[ -L "$ENV_FILE" ]]; then
    if [[ -e "$ENV_FILE" ]]; then
      # Live symlink: copy through to the real file.
      cp -L "$ENV_FILE" "${ENV_FILE}.bak"
      echo "  Backed up $ENV_FILE (-> $(readlink "$ENV_FILE")) → ${ENV_FILE}.bak"
    else
      # Broken symlink: nothing to copy; just remove and note the target.
      warn "  (existing $ENV_FILE is a broken symlink → $(readlink "$ENV_FILE"); nothing to back up)"
    fi
    rm "$ENV_FILE"
  else
    cp "$ENV_FILE" "${ENV_FILE}.bak"
    echo "  Backed up $ENV_FILE → ${ENV_FILE}.bak"
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
printf '\033[1;34m──── The Hive: Environment Setup ────\033[0m\n'
echo ""
echo "This will generate $(blue "$ENV_FILE")."
echo "Press Enter to accept the [default] value."
echo ""

# ── Prompts ──────────────────────────────────────────────────────────────────
echo "$(green "▸ Database (PostGIS)")"
prompt DB_NAME     "database name"     "the_hive_db"
prompt DB_USER     "database user"     "postgres"
prompt DB_PASSWORD "database password" "postgres123"
prompt DB_PORT     "port"              "5432"
echo ""

echo "$(green "▸ Redis")"
prompt REDIS_PORT "port" "6379"
echo ""

echo "$(green "▸ MinIO (S3-compatible storage)")"
prompt MINIO_ACCESS_KEY   "access key"    "minioadmin"
prompt MINIO_SECRET_KEY   "secret key"    "minioadmin123"
prompt MINIO_BUCKET_NAME  "bucket name"   "hive-media"
prompt MINIO_API_PORT     "API port"      "9000"
prompt MINIO_CONSOLE_PORT "console port"  "9001"
echo ""

echo "$(green "▸ Django")"
if command -v python3 &>/dev/null; then
  DEFAULT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(50))" 2>/dev/null || echo "change-me-to-a-long-random-string")
else
  DEFAULT_SECRET="change-me-to-a-long-random-string"
fi
prompt SECRET_KEY "secret key (auto-generated)" "$DEFAULT_SECRET"
echo ""

echo "$(green "▸ Throttling")"
prompt THROTTLE_RELAXED   "relaxed throttle (local)"   "True"
prompt DISABLE_THROTTLING "disable throttling (local)"  "False"
echo ""

echo "$(green "▸ API Keys") $(gray "(leave blank to skip — features will be disabled)")"
echo ""
prompt RESEND_API_KEY       "Resend email API key — https://resend.com/api-keys"  ""
prompt RESEND_CUSTOM_DOMAIN "use custom domain for Resend?"                       "false"
prompt RESEND_FROM_EMAIL    "Resend from email"                                   "onboarding@resend.dev"
echo ""
prompt VITE_MAPBOX_TOKEN    "Mapbox token — https://account.mapbox.com/access-tokens/" ""
echo ""

echo "$(green "▸ Mobile (Expo physical device access)")"
DETECTED_IP=$(detect_lan_ip)
echo "  Detected LAN IP: $(blue "$DETECTED_IP")"
prompt LAN_IP "LAN IP for mobile device access" "$DETECTED_IP"
echo ""

# ── Write .env ───────────────────────────────────────────────────────────────
cat > "$ENV_FILE" <<EOF
# ─── The Hive: Local Development ─────────────────────────────────────────────
# Generated by: make env  ($(date +%Y-%m-%d))
# For prod-shaped values see .env.production.example.

# ─── Database (PostGIS) ──────────────────────────────────────────────────────
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=localhost
DB_PORT=$DB_PORT

# ─── Redis ───────────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=$REDIS_PORT

# ─── MinIO (S3-compatible object storage) ────────────────────────────────────
MINIO_ENDPOINT=localhost:$MINIO_API_PORT
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET_NAME=$MINIO_BUCKET_NAME
MINIO_USE_SSL=false
MINIO_API_PORT=$MINIO_API_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# ─── Django ──────────────────────────────────────────────────────────────────
SECRET_KEY='$SECRET_KEY'
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,10.0.2.2,$LAN_IP
CORS_ALLOWED_ORIGINS=http://localhost,http://localhost:5173,http://localhost:3000

# ─── Throttling ──────────────────────────────────────────────────────────────
THROTTLE_RELAXED=$THROTTLE_RELAXED
DISABLE_THROTTLING=$DISABLE_THROTTLING

# ─── Frontend ────────────────────────────────────────────────────────────────
VITE_API_URL=/api
FRONTEND_PORT=5173
BACKEND_PORT=8000
FRONTEND_URL=http://localhost:5173
VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Mobile (Expo) ───────────────────────────────────────────────────────────
EXPO_PUBLIC_API_URL=http://$LAN_IP:8000/api
EXPO_PUBLIC_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Resend (email service) ──────────────────────────────────────────────────
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_CUSTOM_DOMAIN=$RESEND_CUSTOM_DOMAIN
RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Created $ENV_FILE"
echo ""
echo "  Next steps:"
echo "    make setup       — first-time setup (venv, deps, infra, migrate)"
echo "    make setup-demo  — first-time setup + demo data"
echo "    make dev         — start local development"
echo "    make dev-all     — start backend + frontend + mobile"
echo ""
echo "  To test the prod compose stack locally, copy the prod template over:"
echo "    cp .env.production.example .env   (edit values for your environment)"
echo "    make prod-up"
echo ""

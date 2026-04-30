#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Interactive .env generator for The Hive
#
# Generates TWO profile files:
#   .env.local       — local development (DB on localhost, debug on)
#   .env.production  — production / Docker (DB on 'db', debug off)
#
# Then symlinks .env → .env.local so everything Just Works.
#
# Usage:  ./scripts/setup-env.sh   or   make env
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV_LOCAL=".env.local"
ENV_PROD=".env.production"
ENV_LINK=".env"

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
existing=()
[[ -f "$ENV_LOCAL" ]] && existing+=("$ENV_LOCAL")
[[ -f "$ENV_PROD" ]]  && existing+=("$ENV_PROD")
if [[ ${#existing[@]} -gt 0 ]]; then
  warn "⚠  Found existing: ${existing[*]}"
  if ! prompt_yn "Overwrite? (existing files will be backed up)" "N"; then
    echo "Keeping existing files."
    exit 0
  fi
  for f in "${existing[@]}"; do
    cp "$f" "${f}.bak"
    echo "  Backed up $f → ${f}.bak"
  done
fi

# ─────────────────────────────────────────────────────────────────────────────
echo ""
printf '\033[1;34m──── The Hive: Environment Setup ────\033[0m\n'
echo ""
echo "This will generate $(blue "$ENV_LOCAL") and $(blue "$ENV_PROD")."
echo "Press Enter to accept the [default] value."
echo ""

# ─── Shared secrets (prompted once) ─────────────────────────────────────────
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

# ─── Local profile specifics ────────────────────────────────────────────────
echo "$(green "▸ Local Development Profile")"
DETECTED_IP=$(detect_lan_ip)
echo "  Detected LAN IP: $(blue "$DETECTED_IP")"
prompt LAN_IP "LAN IP for mobile device access" "$DETECTED_IP"
echo ""

# ─── Production profile specifics ───────────────────────────────────────────
echo "$(green "▸ Production Profile")"
prompt PROD_DOMAIN "production domain" "apiary.selmangunes.com"
prompt LETSENCRYPT_DIR "Let's Encrypt directory (leave blank to skip)" ""
echo ""

# ─── Firebase (optional) ────────────────────────────────────────────────────
echo "$(green "▸ Firebase for Mobile Push Notifications") $(gray "(optional)")"
FIREBASE_DONE=false
if prompt_yn "Set up Firebase credential files now?" "N"; then
  echo ""
  prompt ANDROID_JSON "path to google-services.json (Android)" ""
  prompt IOS_PLIST    "path to GoogleService-Info.plist (iOS)" ""

  if [[ -n "$ANDROID_JSON" ]]; then
    if [[ -f "$ANDROID_JSON" ]]; then
      cp "$ANDROID_JSON" mobile-client/google-services.json
      ok "Copied google-services.json → mobile-client/"
    else
      warn "⚠  File not found: $ANDROID_JSON (skipping)"
    fi
  fi

  if [[ -n "$IOS_PLIST" ]]; then
    if [[ -f "$IOS_PLIST" ]]; then
      cp "$IOS_PLIST" mobile-client/GoogleService-Info.plist
      ok "Copied GoogleService-Info.plist → mobile-client/"
    else
      warn "⚠  File not found: $IOS_PLIST (skipping)"
    fi
  fi
  FIREBASE_DONE=true
fi
if [[ "$FIREBASE_DONE" == "false" ]]; then
  echo "  $(gray "Skipped. Run 'make mobile-firebase' later to set up Firebase.")"
fi
echo ""

# ─── Write .env.local ───────────────────────────────────────────────────────
cat > "$ENV_LOCAL" <<EOF
# ─── The Hive: Local Development Profile ─────────────────────────────────────
# Generated by: make env  ($(date +%Y-%m-%d))
# Switch profiles with: make env-local / make env-prod

# ─── Database (PostGIS) ───────────────────────────────────────────────────────
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=localhost
DB_PORT=$DB_PORT

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=$REDIS_PORT

# ─── MinIO (S3-compatible object storage) ─────────────────────────────────────
MINIO_ENDPOINT=localhost:$MINIO_API_PORT
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET_NAME=$MINIO_BUCKET_NAME
MINIO_USE_SSL=false
MINIO_API_PORT=$MINIO_API_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# ─── Django ───────────────────────────────────────────────────────────────────
SECRET_KEY='$SECRET_KEY'
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1,10.0.2.2,$LAN_IP
CORS_ALLOWED_ORIGINS=http://localhost,http://localhost:5173,http://localhost:3000

# ─── Throttling ───────────────────────────────────────────────────────────────
THROTTLE_RELAXED=$THROTTLE_RELAXED
DISABLE_THROTTLING=$DISABLE_THROTTLING

# ─── Frontend ─────────────────────────────────────────────────────────────────
VITE_API_URL=/api
FRONTEND_PORT=5173
BACKEND_PORT=8000
FRONTEND_URL=http://localhost:5173
VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Mobile (Expo) ───────────────────────────────────────────────────────────
EXPO_PUBLIC_API_URL=http://$LAN_IP:8000/api
EXPO_PUBLIC_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Resend (email service) ───────────────────────────────────────────────────
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_CUSTOM_DOMAIN=$RESEND_CUSTOM_DOMAIN
RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL
EOF

# ─── Write .env.production ──────────────────────────────────────────────────
cat > "$ENV_PROD" <<EOF
# ─── The Hive: Production Profile ────────────────────────────────────────────
# Generated by: make env  ($(date +%Y-%m-%d))
# Switch profiles with: make env-local / make env-prod

# ─── Database (PostGIS) ───────────────────────────────────────────────────────
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_HOST=db
DB_PORT=$DB_PORT

# ─── Redis ────────────────────────────────────────────────────────────────────
REDIS_HOST=redis
REDIS_PORT=$REDIS_PORT

# ─── MinIO (S3-compatible object storage) ─────────────────────────────────────
MINIO_ENDPOINT=minio:$MINIO_API_PORT
MINIO_ACCESS_KEY=$MINIO_ACCESS_KEY
MINIO_SECRET_KEY=$MINIO_SECRET_KEY
MINIO_BUCKET_NAME=$MINIO_BUCKET_NAME
MINIO_USE_SSL=false
MINIO_API_PORT=$MINIO_API_PORT
MINIO_CONSOLE_PORT=$MINIO_CONSOLE_PORT

# ─── Django ───────────────────────────────────────────────────────────────────
SECRET_KEY='$SECRET_KEY'
DEBUG=False
ALLOWED_HOSTS=$PROD_DOMAIN
CORS_ALLOWED_ORIGINS=https://$PROD_DOMAIN

# ─── Throttling ───────────────────────────────────────────────────────────────
THROTTLE_RELAXED=False
DISABLE_THROTTLING=False

# ─── Frontend ─────────────────────────────────────────────────────────────────
VITE_API_URL=/api
FRONTEND_PORT=5173
BACKEND_PORT=8000
FRONTEND_URL=https://$PROD_DOMAIN
VITE_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Mobile (Expo) ───────────────────────────────────────────────────────────
EXPO_PUBLIC_API_URL=https://$PROD_DOMAIN/api
EXPO_PUBLIC_MAPBOX_TOKEN=${VITE_MAPBOX_TOKEN:-}

# ─── Resend (email service) ───────────────────────────────────────────────────
RESEND_API_KEY=${RESEND_API_KEY:-}
RESEND_CUSTOM_DOMAIN=$RESEND_CUSTOM_DOMAIN
RESEND_FROM_EMAIL=$RESEND_FROM_EMAIL

# ─── TLS / Domain ────────────────────────────────────────────────────────────
DOMAIN=$PROD_DOMAIN
EOF

if [[ -n "$LETSENCRYPT_DIR" ]]; then
  echo "LETSENCRYPT_DIR=$LETSENCRYPT_DIR" >> "$ENV_PROD"
fi

# ─── Symlink .env → .env.local ──────────────────────────────────────────────
rm -f "$ENV_LINK"
ln -s "$ENV_LOCAL" "$ENV_LINK"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "Created $ENV_LOCAL  (local development)"
ok "Created $ENV_PROD  (production / Docker)"
ok "Symlinked .env → $ENV_LOCAL"
echo ""
echo "  Active profile: $(blue "local")"
echo ""
if [[ ! -f mobile-client/google-services.json ]] || [[ ! -f mobile-client/GoogleService-Info.plist ]]; then
  warn "  ⚠  Firebase files missing — mobile push notifications won't work."
  echo "     Run: make mobile-firebase ANDROID=<path> IOS=<path>"
  echo ""
fi
echo "  Next steps:"
echo "    make setup       — first-time setup (venv, deps, infra, migrate)"
echo "    make setup-demo  — first-time setup + demo data"
echo "    make dev         — start local development"
echo "    make dev-all     — start backend + frontend + mobile"
echo ""
echo "  Switch profiles:"
echo "    make env-local   — use local development config"
echo "    make env-prod    — use production config"
echo "    make env-status  — show active profile"
echo ""

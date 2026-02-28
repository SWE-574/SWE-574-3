# Deployment Guide

Three ways to run The Hive. All use **Docker Compose v2** (`docker compose`).

---

## Option 1 — Local Dev (recommended)

Infra runs in Docker; backend and frontend run natively for the best DX.

```
localhost:5173  ←  Vite dev server
localhost:8000  ←  Django runserver
localhost:5432  ←  PostGIS  (Docker)
localhost:6379  ←  Redis    (Docker)
```

**Prerequisites:** Docker Desktop, Python 3.11+, Node.js 20.19+  
**macOS only:** `brew install gdal geos`

```bash
# First-time setup (run once)
make dev-setup

# Daily start — Ctrl+C stops everything
make dev

# Stop infra containers
make dev-stop
```

`make dev-setup` handles: venv creation → pip install → `.env` generation → infra up → `migrate` → npm install → demo seed.

**Demo accounts** (password: `demo123`): `elif@demo.com`, `cem@demo.com`, `moderator@demo.com` (admin)

| URL | Service |
|-----|---------|
| http://localhost:5173 | Frontend |
| http://localhost:8000/api/ | REST API |
| http://localhost:8000/api/docs/ | Swagger UI |

---

## Option 2 — Full Docker (local)

Everything runs in containers behind Nginx on port 80.

```bash
cp .env.example .env          # defaults work as-is for local use

docker compose up -d --build

docker compose exec backend python manage.py migrate
docker compose exec backend python setup_demo.py
```

| URL | Service |
|-----|---------|
| http://localhost | Frontend |
| http://localhost/api/ | REST API |
| http://localhost/api/docs/ | Swagger UI |
| http://localhost/django-admin/ | Django admin |

---

## Option 3 — Production

Uses multi-stage frontend build, Daphne ASGI, and `docker-compose.prod.yml`.

**Requirements:** Linux server with Docker Engine, ports 80/443 open.

```bash
git clone <repo-url> /opt/thehive && cd /opt/thehive

cp .env.example .env   # edit before continuing
```

Mandatory `.env` values for production:

```dotenv
DB_PASSWORD=<strong-password>
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(50))">
DEBUG=False
ALLOWED_HOSTS=yourdomain.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

```bash
docker compose -f docker-compose.prod.yml up -d --build

docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --no-input
```

### TLS — Let's Encrypt (Certbot)

Nginx starts on port 80 first; Certbot gets the certificate; then Nginx switches to HTTPS.

**1. Install Certbot**

```bash
apt install certbot python3-certbot-nginx -y
```

**2. Point your domain's A record to the server IP, then run:**

```bash
# Stop nginx so port 80 is free for the ACME challenge
docker compose -f docker-compose.prod.yml stop nginx

certbot certonly --standalone -d yourdomain.com

# Certs land in /etc/letsencrypt/live/yourdomain.com/
```

**3. Set `CERTS_DIR` in `.env`:**

```dotenv
DOMAIN=yourdomain.com
CERTS_DIR=/etc/letsencrypt/live/yourdomain.com
```

**4. Restart with HTTPS:**

```bash
docker compose -f docker-compose.prod.yml up -d nginx
```

**Auto-renewal** (add to crontab with `crontab -e`):

```cron
0 3 * * * docker compose -f /opt/thehive/docker-compose.prod.yml stop nginx \
  && certbot renew --quiet \
  && docker compose -f /opt/thehive/docker-compose.prod.yml start nginx
```

---

**Update:**
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build backend frontend
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```

---

## Environment Variables

| Variable | Default | Prod required | Notes |
|----------|---------|:---:|-------|
| `DB_NAME` | `the_hive_db` | | |
| `DB_USER` | `postgres` | | |
| `DB_PASSWORD` | `postgres123` | ✓ | Use a strong password |
| `DB_HOST` | `localhost` | | `127.0.0.1` for Option 1; `db` inside Docker |
| `SECRET_KEY` | — | ✓ | Must be long and random |
| `DEBUG` | `True` | ✓ | Set `False` in prod |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | ✓ | |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | ✓ | |
| `REDIS_HOST` | `localhost` | | `redis` inside Docker |
| `DISABLE_THROTTLING` | `False` | | Dev convenience only |
| `VITE_API_URL` | `/api` | | Frontend build-time var |
| `DOMAIN` | `localhost` | ✓ | Nginx `server_name`; set to your public domain |
| `CERTS_DIR` | `./nginx/certs` | ✓ | Path to `fullchain.pem` / `privkey.pem` |

---

## Quick Reference

```bash
make dev-setup          # first-time local setup
make dev                # start everything locally
make dev-stop           # stop infra
make demo               # full Docker stack + demo seed
make build              # production frontend build
make clean              # remove caches and build artefacts

docker compose ps                         # service status
docker compose exec backend bash          # shell into backend
docker compose exec db psql -U postgres   # database shell
docker compose logs -f backend            # tail logs
```

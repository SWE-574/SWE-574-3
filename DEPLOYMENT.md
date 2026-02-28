# Deployment Guide

This document covers all supported ways to run **The Hive** — from a quick local development setup to a production server deployment.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Option 1 — Local Dev (infra in Docker, code runs natively)](#option-1--local-dev-infra-in-docker-code-runs-natively)
- [Option 2 — Full Docker (local)](#option-2--full-docker-local)
- [Option 3 — Production](#option-3--production)
- [Environment Variables Reference](#environment-variables-reference)
- [Useful Commands](#useful-commands)

---

## Prerequisites

| Tool | Minimum Version | Notes |
|------|----------------|-------|
| Docker Desktop | 4.x | Required for all options |
| Docker Compose | v2 (included with Docker Desktop) | |
| Python | 3.11+ | Option 1 only |
| Node.js | 20.19+ or 22.12+ | Option 1 only |
| make | any | Convenience wrapper |

> **macOS (Apple Silicon):** GDAL and GEOS must be installed for the Django backend to run natively.
> ```bash
> brew install gdal geos
> ```

---

## Option 1 — Local Dev (infra in Docker, code runs natively)

This is the recommended setup for day-to-day development. PostgreSQL/PostGIS and Redis run in Docker; the Django backend and Vite frontend run directly on your machine for the best hot-reload experience.

### Architecture

```
localhost:5173  ←  Vite dev server  (native)
localhost:8000  ←  Django runserver (native, .venv)
localhost:5432  ←  PostGIS          (Docker)
localhost:6379  ←  Redis            (Docker)
```

### First-time setup

```bash
# From the project root
make dev-setup
```

This single command will:
1. Create `backend/.venv` (Python virtual environment) if it doesn't exist
2. Install all Python dependencies from `backend/requirements.txt`
3. Create `backend/.env` from `.env.example` (sets `DB_HOST=127.0.0.1`, generates a random `SECRET_KEY`)
4. Start PostGIS and Redis via `docker-compose.infra.yml`
5. Wait for the database to be ready, then run Django migrations
6. Install frontend npm dependencies
7. Seed the database with demo users and services

> **Note:** If `backend/.env` already exists, it will not be overwritten. Edit it manually if needed.

### Start development servers

```bash
make dev
```

Both processes start in the same terminal with coloured prefixes (`[backend]` / `[frontend]`). Press **Ctrl+C** to stop both.

| URL | Service |
|-----|---------|
| http://localhost:5173 | Frontend (Vite) |
| http://localhost:8000/api/ | Django REST API |
| http://localhost:8000/api/docs/ | Swagger UI |
| http://localhost:8000/django-admin/ | Django admin |

### Demo accounts 

| Email | Role | Balance |
|-------|------|---------|
| `moderator@demo.com` | Admin | — |
| `elif@demo.com` | User | 6.5 h |
| `cem@demo.com` | User | 4.0 h |
| `ayse@demo.com` | User | 7.0 h |
| `mehmet@demo.com` | User | 8.5 h |
| `zeynep@demo.com` | User | 9.0 h |

### Stop infra

```bash
make dev-stop          # stop containers, keep volumes
docker compose -f docker-compose.infra.yml down -v   # also delete data
```

### Re-seed demo data

```bash
cd backend && .venv/bin/python setup_demo.py
```

---

## Option 2 — Full Docker (local)

All services run inside Docker containers behind an Nginx reverse proxy. No local Python or Node.js installation required.

### Architecture

```
http://localhost:80
       │
    Nginx (nginx/nginx.dev.conf)
    ├── /api/*, /ws/*, /django-admin/, /media/  →  backend:8000
    └── /*                                       →  frontend:5173 (Vite dev)
```

### Setup

```bash
# Copy and edit the root .env (optional — defaults work for local use)
cp .env.example .env

# Build images and start all services
docker compose up -d --build

# Run migrations
docker compose exec backend python manage.py migrate

# Seed demo data
docker compose exec backend python setup_demo.py
```

### Access

| URL | Service |
|-----|---------|
| http://localhost | Frontend |
| http://localhost/api/ | REST API |
| http://localhost/api/docs/ | Swagger UI |
| http://localhost/django-admin/ | Django admin |

### Common commands

```bash
docker compose logs -f backend     # tail backend logs
docker compose logs -f frontend    # tail frontend logs
docker compose restart backend     # restart a single service
docker compose down                # stop and remove containers (keeps volumes)
docker compose down -v             # also remove volumes (⚠ deletes all data)
```

---

## Option 3 — Production

The production stack uses:
- **multi-stage Docker build** for the frontend (static assets served directly by Nginx)
- **Gunicorn/Daphne** ASGI server for the backend
- **Nginx** as reverse proxy, serving static files and media
- Health checks on all services

### Architecture

```
https://yourdomain.com
       │
    Nginx (nginx/nginx.prod.conf)
    ├── /api/*, /ws/*, /django-admin/, /media/  →  backend:8000
    └── /*                                       →  /usr/share/nginx/html (static build)
```

### 1. Provision the server

Any Linux server (Ubuntu 22.04 LTS recommended) with:
- Docker Engine + Docker Compose plugin
- Port 80 (and 443 if using HTTPS) open in the firewall

```bash
# Install Docker on Ubuntu
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in
```

### 2. Clone the repository

```bash
git clone <repo-url> /opt/thehive
cd /opt/thehive
```

### 3. Create the production `.env`

```bash
cp .env.example .env
```

Edit `.env` and set **all** of the following:

```dotenv
# Database
DB_NAME=the_hive_db
DB_USER=hive_user
DB_PASSWORD=<strong-random-password>

# Django
SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(50))">
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
CORS_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Throttling (keep enabled in production)
THROTTLE_RELAXED=False
DISABLE_THROTTLING=False
```

> **Never** set `DEBUG=True` in production. Never commit `.env` to version control.

### 4. (Optional) Configure HTTPS

Place your TLS certificates in `nginx/certs/` and update `nginx/nginx.prod.conf` to enable the HTTPS server block. Using [Certbot](https://certbot.eff.org/) with the Nginx plugin is the recommended approach.

### 5. Build and start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 6. Run migrations and collect static files

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --no-input
```

### 7. (Optional) Seed demo data

```bash
docker compose -f docker-compose.prod.yml exec backend python setup_demo.py
```

### 8. Verify health

```bash
# All services should show "healthy" or "running"
docker compose -f docker-compose.prod.yml ps

# Check API
curl http://yourdomain.com/api/health/
```

### Updating the application

```bash
git pull

# Rebuild only changed services
docker compose -f docker-compose.prod.yml up -d --build backend frontend

# Apply any new migrations
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```

### Logs

```bash
docker compose -f docker-compose.prod.yml logs -f          # all services
docker compose -f docker-compose.prod.yml logs -f backend  # backend only
```

---

## Environment Variables Reference

| Variable | Default | Required in prod | Description |
|----------|---------|-----------------|-------------|
| `DB_NAME` | `the_hive_db` | ✓ | PostgreSQL database name |
| `DB_USER` | `postgres` | ✓ | PostgreSQL user |
| `DB_PASSWORD` | `postgres123` | ✓ | PostgreSQL password |
| `DB_HOST` | `localhost` | — | `127.0.0.1` for Option 1, `db` inside Docker |
| `DB_PORT` | `5432` | — | PostgreSQL port |
| `SECRET_KEY` | — | ✓ | Django secret key (must be long and random) |
| `DEBUG` | `True` | ✓ (set `False`) | Django debug mode |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | ✓ | Comma-separated allowed host names |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | ✓ | Comma-separated allowed CORS origins |
| `REDIS_HOST` | `localhost` | — | Redis host (`redis` inside Docker) |
| `REDIS_PORT` | `6379` | — | Redis port |
| `THROTTLE_RELAXED` | `True` | — | Raise API rate limits (useful for dev) |
| `DISABLE_THROTTLING` | `False` | — | Disable throttling entirely (dev only) |
| `VITE_API_URL` | `/api` | — | API base URL used by the frontend build |

---

## Useful Commands

```bash
# ── Makefile shortcuts ────────────────────────────────────────────────────────
make dev-setup     # First-time local setup (Option 1)
make dev           # Start backend + frontend + infra (Option 1)
make dev-stop      # Stop Docker infra containers
make demo          # Start full Docker stack and seed demo data (Option 2)
make build         # Build frontend for production
make clean         # Remove caches, reports, build artefacts

# ── Django management ─────────────────────────────────────────────────────────
# (inside .venv for Option 1, or via docker compose exec backend for Options 2/3)
python manage.py migrate
python manage.py createsuperuser
python manage.py shell

# ── Docker helpers ────────────────────────────────────────────────────────────
docker compose ps                          # service status
docker compose exec backend bash          # shell into backend container
docker compose exec db psql -U postgres   # connect to database
docker volume ls                           # list volumes
```

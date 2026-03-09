## Project Title & Badges

# The Hive (SWE-574-3 | Apiary)

## Description
The Hive is a full-stack, location-aware collaboration platform that enables users to publish offers, requests, and events, coordinate with other participants, and complete interactions with transparent feedback signals. The system addresses fragmented local coordination and trust discovery by combining structured service workflows, communication channels, and ranking mechanisms in a single product. The primary audience is community members who need dependable local exchange and student engineering teams operating and extending the platform across web, backend, and mobile clients.

## Key Features
- Secure authentication and profile management with role-aware access control.
- Offer, request, and event lifecycle management with participant workflows.
- Real-time communication support through backend async capabilities.
- Search, filtering, and ranking utilities for service and participant discovery.
- Post-transaction evaluation and achievement/badge support for trust signals.
- Admin-facing moderation and operational controls for platform governance.
- Cross-platform clients: web interface and mobile app
- Containerized local infrastructure for database, cache, object storage, and reverse proxy.

## Architecture Overview
This repository follows a monorepo, service-oriented architecture with clear platform boundaries: Django/DRF backend APIs and async services (`backend/`), a React + Vite web client (`frontend/`), and a React Native + Expo mobile client (`mobile-client/`). The backend applies an MVC-style organization within Django apps while exposing REST-oriented endpoints and real-time channels. Local development uses Docker Compose for infrastructure dependencies (PostgreSQL/PostGIS, Redis, MinIO, Nginx) and native runtime for fast backend/frontend iteration.

## Getting Started (Quick Start)

### Prerequisites
- Git
- Docker Engine and Docker Compose v2

> **Local native development only:** Python 3.11+, Node.js v20+, npm v11+

## Installation
1. Clone the repository and move into the project root:

```bash
git clone https://github.com/SWE-574/SWE-574-3.git
cd SWE-574-3
```

2. Create project environment configuration (interactive) and review generated values:

```bash
make env
```

3. Use `.env.example` as the baseline reference for required keys and defaults, then ensure your root `.env` is complete.

4. Run one-time bootstrap for dependencies and infrastructure:

```bash
make setup
```

5. Optional: seed demo data after setup:

```bash
make setup-demo
```

## Running Locally
Start local development (recommended path):

```bash
make dev
```

This starts infrastructure containers and runs:
- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`

### Troubleshooting: Reset Local Environment

If you encounter startup errors — such as database connection failures, migration conflicts, port collisions, or containers in a broken state — perform a full local reset:

```bash
make reset
```

> **Warning:** This permanently deletes all local infrastructure volumes (database, Redis, MinIO). All local data will be lost. You will be prompted to confirm before the operation runs.

After the reset, re-run the full setup to restore a clean working state:

```bash
make setup
# Optional: re-seed demo data
make setup-demo
```


## Testing
Run full native test suite:

```bash
make test
```

Run unit tests only:

```bash
make test-unit
```

Run integration tests only:

```bash
make test-integration
```

Generate coverage reports:

```bash
make coverage
```

## Documentation
For detailed system design documents (SDD), software requirements specifications (SRS), API endpoints, and database schemas, please refer to our Project Wiki.

| Wiki Page | Description | Link |
|---|---|---|
| Wiki Home | Central index for all project documentation and navigation. | [Home](https://github.com/SWE-574/SWE-574-3/wiki/Home) |
| Software Requirements Specification (Main) | Consolidated baseline requirements and scope for the platform. | [Software Requirements Specification](https://github.com/SWE-574/SWE-574-3/wiki/Software-Requirements-Specification) |
| UML Diagrams | UML class-level representation of the core entities and relationships. | [UML Diagrams](https://github.com/SWE-574/SWE-574-3/wiki#design-uml) |
| Weekly Status Reports | Iteration-level progress reports, status updates, and milestone tracking artifacts. | [Weekly Status Reports](https://github.com/SWE-574/SWE-574-3/wiki/Weekly-Status-Reports) |
| Meeting Notes | Team decisions, planning discussions, and synchronization records. | [Meeting Notes](https://github.com/SWE-574/SWE-574-3/wiki/Meeting-Notes) |
| Project Plan (Customer M1) | Milestone planning baseline, scope commitments, and execution timeline. | [Project Plan](https://github.com/SWE-574/SWE-574-3/wiki/Project-Plan-%E2%80%90-Customer-M1) |
| RAM (RACI) Matrix | Responsibility and accountability mapping for workstreams and team roles. | [RAM (RACI) Matrix](https://github.com/SWE-574/SWE-574-3/wiki/RAM-(RACI)-Matrix) |

## Contributing
We use a feature-branch workflow and do not allow direct commits to `main`.

All pull requests must satisfy the following merge gates:
- All CI checks must pass.
- At least one code review approval is required before merge.

For full contribution standards, see [`CONTRIBUTING.md`](CONTRIBUTING.md).


## Contact

| Member | Role-Based Ownership | GitHub |
|---|---|---|
| Yasemin | Testing, business analysis, frontend, wiki contributions | [@yaseminsirin](https://github.com/yaseminsirin) |
| Selman | CI/CD (DevOps), backend, project management | [@sgunes16](https://github.com/sgunes16) |
| Zeynep | Backend, product ownership, requirements accountability | [@mzyavuz](https://github.com/mzyavuz) |
| Dicle | Mobile application, workflow, frontend collaboration | [@diclenaz7](https://github.com/diclenaz7) |
| Yusuf | Product/design direction, wiki control, backend, testing | [@yusufizzetmurat](https://github.com/yusufizzetmurat) |

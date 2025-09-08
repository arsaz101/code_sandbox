# Coding Sandbox – Docker Quick Start

## Prereqs

Docker + Docker Compose.

## Start stack

```
docker compose up --build
```

Services:

- backend: FastAPI on http://localhost:8000
- frontend: Vite dev server on http://localhost:5173
- db: Postgres 15 (localhost:5432)
- redis: Redis 7 (localhost:6379)
- worker: run queue consumer

First start auto-creates tables (see `entrypoint.sh`).

## Environment overrides

Edit `docker-compose.yml` or create a `.env` file for overrides (Compose automatically loads it).

## Common tasks

Rebuild after dependency change:

```
docker compose build backend worker
```

Run a one-off shell in backend container:

```
docker compose run --rm backend bash
```

Apply DB reset:

```
docker compose down -v
docker compose up --build
```

## Notes

- Runner currently executes inside `runner/worker.py` using Docker _inside_ host (not containerized here). For secure multi-tenant execution you’d isolate that differently.
- Frontend is dev-mode; for production create a separate build stage and serve static files behind a reverse proxy.

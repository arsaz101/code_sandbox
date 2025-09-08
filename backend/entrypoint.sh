#!/usr/bin/env bash
set -e
# Wait for Postgres
if [ -n "${DATABASE_URL}" ]; then
  echo "Waiting for database..."
  python - <<'PY'
import asyncio, os, time
from urllib.parse import urlparse
from app.db.session import engine
from sqlalchemy import text

u = urlparse(os.environ['DATABASE_URL'].replace('+asyncpg',''))
host, port = u.hostname, u.port or 5432

import socket
for _ in range(60):
    try:
        with socket.create_connection((host, port), timeout=2):
            break
    except OSError:
        time.sleep(1)
else:
    raise SystemExit('Database not reachable')

async def init():
    from app.db.models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
asyncio.run(init())
print('DB ready.')
PY
fi

exec "$@"

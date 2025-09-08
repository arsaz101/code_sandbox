import io, tarfile, json, time
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.db.models import Run, File
from app.db.enums import RunStatus
from app.core.config import get_settings
from app.queues.redis import get_redis, RUN_STREAM, SNAP_PREFIX

settings = get_settings()


def make_snapshot(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        for path, content in files.items():
            data = content.encode()
            ti = tarfile.TarInfo(name=path)
            ti.size = len(data)
            tf.addfile(ti, io.BytesIO(data))
    return buf.getvalue()


async def enqueue_run(db: AsyncSession, run: Run, files: dict[str, str]):
    snap = make_snapshot(files)
    snap_key = f"{SNAP_PREFIX}{run.id}"
    async with get_redis() as r:
        await r.setex(snap_key, settings.SNAPSHOT_TTL_SECONDS, snap)
        payload = {
            "run_id": run.id,
            "project_id": run.project_id,
            "language": run.language,
            "entrypoint": run.entrypoint,
            "snap_key": snap_key,
            "time_limit": settings.RUN_TIME_LIMIT_S,
        }
        await r.xadd(RUN_STREAM, {b"json": json.dumps(payload).encode()}, maxlen=1000)


async def mark_run_done(
    db: AsyncSession,
    run_id: str,
    status: RunStatus,
    stdout: str,
    stderr: str,
    wall_ms: int,
):
    await db.execute(
        update(Run)
        .where(Run.id == run_id)
        .values(
            status=status.value,
            stdout=stdout,
            stderr=stderr,
            wall_ms=wall_ms,
            finished_at=datetime.utcnow(),
        )
    )
    await db.commit()

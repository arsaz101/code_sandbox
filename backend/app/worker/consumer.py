import asyncio, json, tarfile, io, subprocess, sys
from app.core.config import get_settings
from app.queues.redis import get_redis, RUN_STREAM, EVENT_PREFIX, SNAP_PREFIX
from app.db.session import get_session
from app.db.models import Run
from app.db.enums import RunStatus
from app.services.run import mark_run_done
from sqlalchemy.ext.asyncio import AsyncSession

settings = get_settings()
GROUP = settings.RUN_GROUP


async def ensure_group(r):
    try:
        groups = await r.xinfo_groups(RUN_STREAM)
        if not any(g[b"name"].decode() == GROUP for g in groups):
            await r.xgroup_create(RUN_STREAM, GROUP, id="$", mkstream=True)
    except Exception:
        try:
            await r.xgroup_create(RUN_STREAM, GROUP, id="$", mkstream=True)
        except Exception:
            pass


async def run_job(db: AsyncSession, r, msg_id: str, data: dict):
    payload = json.loads(data[b"json"].decode())
    run_id = payload["run_id"]
    channel = EVENT_PREFIX + run_id
    # Send running state
    await r.publish(
        channel, json.dumps({"type": "update", "status": "running"}).encode()
    )
    snap_key = payload["snap_key"]
    snap = await r.get(snap_key)
    files = {}
    if snap:
        bio = io.BytesIO(snap)
        with tarfile.open(fileobj=bio, mode="r:gz") as tf:
            for member in tf.getmembers():
                f = tf.extractfile(member)
                if f:
                    files[member.name] = f.read().decode()
    # Execute using runner/worker.py
    proc = subprocess.Popen(
        [sys.executable, "app/runner_worker.py"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        text=True,
    )
    proc.stdin.write(
        json.dumps(
            {
                "files": files,
                "language": payload["language"],
                "entrypoint": payload["entrypoint"],
            }
        )
    )
    proc.stdin.close()
    out = proc.stdout.read()
    proc.wait()
    try:
        res = json.loads(out)
    except Exception:
        res = {"status": "failed", "stdout": "", "stderr": out, "wall_ms": 0}
    await mark_run_done(
        db,
        run_id,
        RunStatus(res["status"]),
        res.get("stdout", ""),
        res.get("stderr", ""),
        res.get("wall_ms", 0),
    )
    await r.publish(
        channel,
        json.dumps(
            {
                "type": "update",
                "status": res["status"],
                "stdout": res.get("stdout"),
                "stderr": res.get("stderr"),
                "wall_ms": res.get("wall_ms"),
            }
        ).encode(),
    )
    await r.xack(RUN_STREAM, GROUP, msg_id)


async def main():
    async with get_redis() as r:
        await ensure_group(r)
        async for db in get_session():
            while True:
                resp = await r.xreadgroup(
                    GROUP, "consumer-1", streams={RUN_STREAM: ">"}, count=1, block=5000
                )
                if not resp:
                    continue
                for _stream, messages in resp:
                    for msg_id, data in messages:
                        await run_job(db, r, msg_id, data)


if __name__ == "__main__":
    asyncio.run(main())

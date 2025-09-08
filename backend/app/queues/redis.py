from redis import asyncio as aioredis
from contextlib import asynccontextmanager
from app.core.config import get_settings

settings = get_settings()


@asynccontextmanager
async def get_redis():
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
    try:
        yield r
    finally:
        await r.aclose()


RUN_STREAM = settings.RUN_STREAM
RUN_GROUP = settings.RUN_GROUP
EVENT_PREFIX = settings.EVENT_CHANNEL_PREFIX
SNAP_PREFIX = settings.SNAPSHOT_PREFIX

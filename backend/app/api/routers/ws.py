from fastapi import APIRouter, WebSocket
from app.core.config import get_settings
from app.queues.redis import get_redis

router = APIRouter()
settings = get_settings()


@router.websocket("/runs/{run_id}/stream")
async def ws_stream(ws: WebSocket, run_id: str):
    await ws.accept()
    channel = settings.EVENT_CHANNEL_PREFIX + run_id
    async with get_redis() as r:
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        try:
            # Immediately tell the client we're connected
            await ws.send_json({"t": "state", "status": "subscribed"})
            async for msg in pubsub.listen():
                if msg["type"] != "message":
                    continue
                await ws.send_bytes(msg["data"])  # already JSON bytes from runner
        finally:
            await pubsub.unsubscribe(channel)
            await ws.close()

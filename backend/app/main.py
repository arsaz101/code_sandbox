from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.api.routers import auth as r_auth
from app.api.routers import run as r_run
from app.api.routers import ws as r_ws
from app.api.routers import projects_api as r_projects
from app.api.routers import ai as r_ai
from sqlalchemy import select
from app.db.session import get_session
from app.db.models import User
from app.core.security import hash_password
import os, asyncio

setup_logging()
settings = get_settings()

app = FastAPI(title=settings.APP_NAME)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

app.include_router(r_auth.router, prefix=settings.API_PREFIX)
app.include_router(r_projects.router, prefix=settings.API_PREFIX)
app.include_router(r_run.router, prefix=settings.API_PREFIX)
app.include_router(r_ws.router, prefix=settings.API_PREFIX)
app.include_router(r_ai.router, prefix=settings.API_PREFIX)


@app.get(f"{settings.API_PREFIX}/health")
async def health():
    return {"ok": True}


@app.on_event("startup")
async def ensure_admin():
    email = os.getenv("ADMIN_EMAIL")
    password = os.getenv("ADMIN_PASSWORD")
    if not email or not password:
        return
    # create admin user if not exists
    async for session in get_session():
        exists = await session.execute(select(User).where(User.email == email))
        if exists.scalar_one_or_none():
            return
        u = User(email=email, password_hash=hash_password(password), is_admin=True)
        session.add(u)
        await session.commit()
        return

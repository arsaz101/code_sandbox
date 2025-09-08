from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_session
from app.db.models import User
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
async def register(
    email: str,
    password: str,
    is_admin: bool = False,
    db: AsyncSession = Depends(get_session),
):
    exists = await db.execute(select(User).where(User.email == email))
    if exists.scalar_one_or_none():
        raise HTTPException(400, "Email in use")
    u = User(email=email, password_hash=hash_password(password), is_admin=is_admin)
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return {"id": u.id}


@router.post("/login")
async def login(email: str, password: str, db: AsyncSession = Depends(get_session)):
    res = await db.execute(select(User).where(User.email == email))
    u = res.scalar_one_or_none()
    if not u or not verify_password(password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    token = create_access_token(u.id)
    return {"access_token": token, "token_type": "bearer"}

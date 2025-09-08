from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
from app.core.config import get_settings

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
settings = get_settings()


def hash_password(pw: str) -> str:
    return pwd.hash(pw)


def verify_password(pw: str, hashed: str) -> bool:
    return pwd.verify(pw, hashed)


def create_access_token(sub: str, minutes: int | None = None) -> str:
    expire = datetime.utcnow() + timedelta(
        minutes=minutes or settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": sub, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_token(token: str) -> str:
    data = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    return data["sub"]

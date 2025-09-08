from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    APP_NAME: str = "Sandbox IDE Gateway"
    API_PREFIX: str = "/api"
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8

    # DB: use asyncpg driver
    DATABASE_URL: str = "postgresql+asyncpg://ide:ide@localhost:5432/ide"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    RUN_STREAM: str = "runs:jobs"
    RUN_GROUP: str = "runners"
    EVENT_CHANNEL_PREFIX: str = "runs:events:"
    SNAPSHOT_PREFIX: str = "runs:snap:"
    SNAPSHOT_TTL_SECONDS: int = 600

    # Sandbox defaults
    RUN_TIME_LIMIT_S: int = 5
    RUN_MEMORY: str = "256m"
    RUN_CPUS: str = "0.5"

    # AI / LLM
    OPENAI_API_KEY: str | None = (
        "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"
    )
    AI_MODEL: str = "gpt-4o-mini"
    AI_DEBUG: bool = False

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()

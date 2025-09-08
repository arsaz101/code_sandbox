from pydantic import BaseModel, Field
from app.db.enums import RunStatus


class RunCreate(BaseModel):
    entrypoint: str
    language: str = Field(default="python")


class RunOut(BaseModel):
    id: str
    status: RunStatus
    language: str
    entrypoint: str
    stdout: str | None = None
    stderr: str | None = None
    wall_ms: int | None = None

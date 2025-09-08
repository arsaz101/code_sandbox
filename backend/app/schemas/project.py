from pydantic import BaseModel
from datetime import datetime


class ProjectCreate(BaseModel):
    name: str


class ProjectOut(BaseModel):
    id: str
    name: str
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FileIn(BaseModel):
    path: str
    content: str


class FileOut(BaseModel):
    id: str
    path: str
    content: str

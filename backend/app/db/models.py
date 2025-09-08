from sqlalchemy.orm import declarative_base, Mapped, mapped_column, relationship
from sqlalchemy import Text, String, ForeignKey, TIMESTAMP, func, Boolean
from uuid import uuid4
from app.db.enums import RunStatus

Base = declarative_base()


def gen_id():
    return str(uuid4())


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String)
    is_admin: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    projects: Mapped[list["Project"]] = relationship(
        back_populates="owner", cascade="all,delete"
    )


class Project(Base):
    __tablename__ = "projects"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String)
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    owner: Mapped[User] = relationship(back_populates="projects")
    files: Mapped[list["File"]] = relationship(
        back_populates="project", cascade="all,delete-orphan"
    )
    runs: Mapped[list["Run"]] = relationship(
        back_populates="project", cascade="all,delete-orphan"
    )


class File(Base):
    __tablename__ = "files"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    path: Mapped[str] = mapped_column(String)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    project: Mapped[Project] = relationship(back_populates="files")


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=gen_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[RunStatus] = mapped_column(String, default=RunStatus.queued.value)
    language: Mapped[str] = mapped_column(String)
    entrypoint: Mapped[str] = mapped_column(String)
    cpu_ms: Mapped[int | None] = mapped_column(default=None)
    memory_mb: Mapped[int | None] = mapped_column(default=None)
    wall_ms: Mapped[int | None] = mapped_column(default=None)
    stdout: Mapped[str | None] = mapped_column(Text, default=None)
    stderr: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[str] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now()
    )
    finished_at: Mapped[str | None] = mapped_column(TIMESTAMP(timezone=True))
    project: Mapped[Project] = relationship(back_populates="runs")

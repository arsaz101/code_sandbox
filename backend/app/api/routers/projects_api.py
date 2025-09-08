from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_current_user, get_db
from app.db.models import Project, File
from app.schemas.project import ProjectCreate, ProjectOut, FileIn, FileOut

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post("/", response_model=ProjectOut)
async def create_project(
    payload: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    p = Project(owner_id=user.id, name=payload.name)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    # seed with main.py
    f = File(project_id=p.id, path="main.py", content='print("Hello from sandbox")')
    db.add(f)
    await db.commit()
    return ProjectOut.model_validate(p.__dict__)


@router.get("/", response_model=list[ProjectOut])
async def list_projects(
    db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    res = await db.execute(select(Project).where(Project.owner_id == user.id))
    return [ProjectOut.model_validate(p.__dict__) for p in res.scalars().all()]


@router.get("/{pid}", response_model=ProjectOut)
async def get_project(
    pid: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    p = await db.get(Project, pid)
    if not p or p.owner_id != user.id:
        raise HTTPException(404, "project not found")
    return ProjectOut.model_validate(p.__dict__)


@router.get("/{pid}/files", response_model=list[FileOut])
async def list_files(
    pid: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    proj = await db.get(Project, pid)
    if not proj or proj.owner_id != user.id:
        raise HTTPException(404, "project not found")
    res = await db.execute(select(File).where(File.project_id == pid))
    return [
        FileOut(id=f.id, path=f.path, content=f.content) for f in res.scalars().all()
    ]


@router.post("/{pid}/files", response_model=FileOut)
async def upsert_file(
    pid: str,
    payload: FileIn,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    proj = await db.get(Project, pid)
    if not proj or proj.owner_id != user.id:
        raise HTTPException(404, "project not found")
    res = await db.execute(
        select(File).where(File.project_id == pid, File.path == payload.path)
    )
    existing = res.scalar_one_or_none()
    if existing:
        existing.content = payload.content
        await db.commit()
        await db.refresh(existing)
        return FileOut(id=existing.id, path=existing.path, content=existing.content)
    f = File(project_id=pid, path=payload.path, content=payload.content)
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return FileOut(id=f.id, path=f.path, content=f.content)


@router.delete("/{pid}/files")
async def delete_file(
    pid: str,
    path: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    proj = await db.get(Project, pid)
    if not proj or proj.owner_id != user.id:
        raise HTTPException(404, "project not found")
    res = await db.execute(
        select(File).where(File.project_id == pid, File.path == path)
    )
    f = res.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "file not found")
    await db.delete(f)
    await db.commit()
    return {"deleted": True}

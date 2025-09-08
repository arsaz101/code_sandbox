from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.api.deps import get_current_user, get_db
from app.db.models import Project, Run
from app.db.enums import RunStatus
from app.schemas.run import RunCreate, RunOut
from app.services.files import list_project_files
from app.services.run import enqueue_run

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("/start", response_model=dict)
async def start_run(
    pid: str,
    payload: RunCreate,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    proj = await db.get(Project, pid)
    if not proj or proj.owner_id != user.id:
        raise HTTPException(404, "project not found")
    run = Run(
        project_id=pid,
        language=payload.language,
        entrypoint=payload.entrypoint,
        status=RunStatus.queued.value,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    files = await list_project_files(db, pid)
    await enqueue_run(db, run, files)
    return {"run_id": run.id}


@router.get("/{run_id}", response_model=RunOut)
async def get_run(
    run_id: str, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)
):
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "run not found")
    return RunOut.model_validate(run.__dict__)

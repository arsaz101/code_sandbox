from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import File


async def list_project_files(db: AsyncSession, project_id: str) -> dict[str, str]:
    res = await db.execute(select(File).where(File.project_id == project_id))
    files = res.scalars().all()
    return {f.path: f.content for f in files}

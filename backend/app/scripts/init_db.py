import asyncio
from app.db.session import engine
from app.db.models import Base


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("DB schema created (or already exists)")


if __name__ == "__main__":
    asyncio.run(main())

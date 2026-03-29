from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User
from schemas.auth import RegisterRequest
from utils.security import hash_password


async def create_user(request: RegisterRequest, db: AsyncSession) -> User:
    user = User(
        name=request.name,
        email=request.email,
        telegram=request.telegram,
        hash_pass=hash_password(request.password),
        role=request.role,
        linked_to=request.linked_to,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

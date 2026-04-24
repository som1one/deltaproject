from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.question import Question
from schemas.question import QuestionCreateRequest


async def create_question(request: QuestionCreateRequest, db: AsyncSession) -> Question:
    question = Question(
        name=request.name.strip(),
        telegram=request.telegram.strip(),
        title=request.title.strip(),
        text=request.text.strip(),
    )
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def list_questions(db: AsyncSession) -> list[Question]:
    result = await db.execute(
        select(Question).order_by(Question.created_at.desc())
    )
    return list(result.scalars().all())

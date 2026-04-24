from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.database import get_db
from schemas.question import QuestionCreateRequest, QuestionResponse
from services.question_service import create_question, list_questions

router = APIRouter(tags=["question"])


@router.get("/question", response_model=list[QuestionResponse])
async def get_questions(
    db: AsyncSession = Depends(get_db),
):
    return await list_questions(db)


@router.post(
    "/question",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_question(
    body: QuestionCreateRequest,
    db: AsyncSession = Depends(get_db),
):
    return await create_question(body, db)

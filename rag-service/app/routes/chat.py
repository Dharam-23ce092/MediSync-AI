"""Chat route placeholder — will be implemented in Phase 5."""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    hospital_id: str
    user_id: str
    user_role: str
    patient_uhid: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str
    sources: list[str] = []
    confidence: Optional[float] = None


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    RAG chatbot endpoint. Receives a message with user/hospital context,
    retrieves relevant patient data, and returns an AI-generated response.
    Implementation pending Phase 5.
    """
    return ChatResponse(
        reply="RAG chatbot service is running. Full implementation coming in Phase 5.",
        sources=[],
        confidence=None,
    )

"""
MediSync-AI RAG Chatbot Service
FastAPI microservice for Retrieval-Augmented Generation clinical assistant.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.chat import router as chat_router

app = FastAPI(
    title="MediSync RAG Service",
    description="RAG-powered clinical assistant for MediSync EHR",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Node.js backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat_router, prefix="/chat", tags=["Chat"])


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "medisync-rag"}

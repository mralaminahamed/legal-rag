"""
OCR sidecar service for legal document text extraction.

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

from fastapi import FastAPI
from pydantic import BaseModel

VERSION = "0.1.0"

app = FastAPI(title="legal-rag OCR sidecar", version=VERSION)


class HealthResponse(BaseModel):
    """Health check response body."""

    status: str
    service: str
    version: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """
    Liveness probe endpoint.

    Returns:
        HealthResponse with status "ok".
    """
    return HealthResponse(status="ok", service="ocr", version=VERSION)

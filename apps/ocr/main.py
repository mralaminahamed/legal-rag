"""
OCR sidecar service for legal document text extraction.

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

import logging
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from extractor import DocumentExtractor, ExtractionResult

VERSION = "0.1.0"
MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".tiff"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="legal-rag OCR sidecar", version=VERSION)
_extractor = DocumentExtractor()


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


@app.post("/ocr/extract", response_model=ExtractionResult)
async def ocr_extract(file: UploadFile = File(...)) -> ExtractionResult:
    """
    Extract text from an uploaded PDF or image file.

    Accepts multipart/form-data with a single `file` field.
    Returns structured extraction result with per-page text and confidence scores.

    Args:
        file: Uploaded PDF or image (max 50 MB; .pdf .png .jpg .jpeg .tiff).

    Returns:
        ExtractionResult with text, pages, confidence, and strategy used.

    Raises:
        HTTPException 400: Unsupported file extension.
        HTTPException 413: File exceeds 50 MB.
    """
    filename = file.filename or "upload.bin"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extension '{ext}' not allowed. Accepted: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_bytes = await file.read()

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File size {len(file_bytes):,} bytes exceeds 50 MB limit",
        )

    t0 = time.monotonic()
    result = _extractor.extract(file_bytes, filename)
    elapsed_ms = (time.monotonic() - t0) * 1000

    logger.info(
        "extraction complete strategy=%s pages=%d confidence=%.3f elapsed_ms=%.1f",
        result.strategy_used,
        len(result.pages),
        result.overall_confidence,
        elapsed_ms,
    )

    return result

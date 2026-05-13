"""
Tests for the OCR sidecar extraction endpoint and DocumentExtractor class.

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

from pathlib import Path


def test_clean_pdf_uses_pdfplumber(clean_pdf_bytes: bytes) -> None:
    """A text-layer PDF must be extracted via the pdfplumber_text strategy."""
    from extractor import DocumentExtractor

    extractor = DocumentExtractor()
    result = extractor.extract(clean_pdf_bytes, "complaint.pdf")

    assert result.strategy_used == "pdfplumber_text"
    assert len(result.text.strip()) > 0
    assert result.overall_confidence == 1.0
    assert len(result.pages) > 0
    assert all(p.confidence == 1.0 for p in result.pages)


def test_image_uses_tesseract(clean_png_bytes: bytes) -> None:
    """A PNG input must be extracted via the tesseract_image strategy."""
    from extractor import DocumentExtractor

    extractor = DocumentExtractor()
    result = extractor.extract(clean_png_bytes, "scan.png")

    assert result.strategy_used == "tesseract_image"
    assert len(result.pages) == 1
    assert result.pages[0].page_number == 1


def test_oversized_file_returns_413(client) -> None:
    """Files exceeding 50 MB must receive a 413 response from the API."""
    large_bytes = b"0" * (51 * 1024 * 1024)
    response = client.post(
        "/ocr/extract",
        files={"file": ("large.pdf", large_bytes, "application/pdf")},
    )
    assert response.status_code == 413


def test_disallowed_extension_returns_400(client) -> None:
    """Unsupported file extensions must receive a 400 response."""
    response = client.post(
        "/ocr/extract",
        files={"file": ("doc.docx", b"fake content", "application/octet-stream")},
    )
    assert response.status_code == 400


def test_health_endpoint(client) -> None:
    """Health endpoint must return 200 with expected payload."""
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "ocr"

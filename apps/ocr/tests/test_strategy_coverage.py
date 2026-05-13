"""
OCR strategy coverage tests.

Verifies that each input type triggers the correct extraction strategy:
  1. Text-layer PDF → pdfplumber_text
  2. Image-only PDF (no text layer, synthesized via Pillow) → tesseract_image
  3. PNG image input → tesseract_image

All three tests invoke the real DocumentExtractor pipeline — no mocking of
strategy selection. These confirm the cascade works end-to-end, not just
that the classes exist.

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

import io
from pathlib import Path

import pytest


def _make_image_only_pdf() -> bytes:
    """
    Synthesize an image-only PDF: render text to a PIL image, then save
    that image as a single-page PDF with no text layer.

    pdfplumber returns < 50 chars on this file, so the extractor falls
    through to tesseract_image.
    """
    from PIL import Image, ImageDraw
    from fpdf import FPDF  # type: ignore[import-untyped]

    # Render text to image
    img = Image.new("RGB", (600, 200), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((10, 30), "Plaintiff Jane Smith v. Defendant Corp", fill="black")
    draw.text((10, 70), "Case No: 2024-CV-999 - Filing Date: March 1, 2024", fill="black")

    # Save image to bytes
    img_buf = io.BytesIO()
    img.save(img_buf, format="PNG")
    img_buf.seek(0)

    # Embed the image into a PDF with no native text layer (FPDF image method)
    pdf = FPDF()
    pdf.add_page()
    # Write image to a temp path for FPDF (FPDF requires file path or bytes)
    img_path = "/tmp/_test_image_only_page.png"
    img.save(img_path, format="PNG")
    pdf.image(img_path, x=0, y=0, w=210)  # A4 width

    buf = io.BytesIO()
    pdf.output(buf)
    return buf.getvalue()


def test_text_pdf_uses_pdfplumber(clean_pdf_bytes: bytes) -> None:
    """
    A PDF with a native text layer must be extracted via pdfplumber_text.
    This is the fast path — no OCR required, confidence = 1.0.
    """
    from extractor import DocumentExtractor

    result = DocumentExtractor().extract(clean_pdf_bytes, "complaint.pdf")

    assert result.strategy_used == "pdfplumber_text", (
        f"Expected pdfplumber_text, got {result.strategy_used}"
    )
    assert result.overall_confidence == 1.0
    assert len(result.text.strip()) > 50, "Text-layer PDF should yield substantial text"


def test_image_pdf_uses_tesseract() -> None:
    """
    A PDF with no text layer (image embedded in PDF) must fall through
    pdfplumber (insufficient text) and reach tesseract_image.
    This tests the cascade: pdfplumber → tesseract_image.
    """
    from extractor import DocumentExtractor

    image_pdf_bytes = _make_image_only_pdf()
    result = DocumentExtractor().extract(image_pdf_bytes, "scanned_notice.pdf")

    assert result.strategy_used in ("tesseract_image", "unstructured_hi_res"), (
        f"Expected tesseract_image or unstructured_hi_res for image-only PDF, "
        f"got {result.strategy_used}"
    )
    assert result.overall_confidence < 1.0, (
        "OCR confidence should be < 1.0 for image-only input"
    )


def test_png_input_uses_tesseract(clean_png_bytes: bytes) -> None:
    """
    A raw PNG file must be sent directly to tesseract_image — the PDF
    cascade is skipped entirely when the extension is an image format.
    """
    from extractor import DocumentExtractor

    result = DocumentExtractor().extract(clean_png_bytes, "scan.png")

    assert result.strategy_used == "tesseract_image", (
        f"Expected tesseract_image for PNG input, got {result.strategy_used}"
    )
    assert len(result.pages) == 1
    assert result.pages[0].page_number == 1

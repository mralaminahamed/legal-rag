"""
Pytest fixtures for the OCR sidecar test suite.

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

import io
import sys
from pathlib import Path

import pytest

# Make apps/ocr importable when pytest is invoked from the repo root
sys.path.insert(0, str(Path(__file__).parent.parent))

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="session", autouse=True)
def ensure_fixtures_dir() -> None:
    """Create the fixtures directory once per test session."""
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)


@pytest.fixture(scope="session")
def clean_pdf_path(ensure_fixtures_dir: None) -> Path:
    """
    Generate a minimal text-layer PDF using fpdf2 and save to fixtures/.

    Returns:
        Path to the generated PDF file.
    """
    from fpdf import FPDF  # type: ignore[import-untyped]

    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    lines = [
        "UNITED STATES DISTRICT COURT",
        "SOUTHERN DISTRICT OF NEW YORK",
        "",
        "Plaintiff: John Doe",
        "Defendant: ACME Corporation",
        "",
        "Case No: 2024-CV-001234",
        "Filing Date: January 15, 2024",
        "Hearing Date: March 10, 2024",
        "",
        "COMPLAINT FOR DAMAGES",
        "Plaintiff alleges breach of contract and seeks compensatory damages.",
        "Relief sought: $500,000 in compensatory damages.",
        "Procedural history: Motion to dismiss denied on February 1, 2024.",
    ]
    from fpdf.enums import XPos, YPos  # type: ignore[import-untyped]

    for line in lines:
        pdf.cell(0, 8, text=line, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    dest = FIXTURES_DIR / "clean_complaint.pdf"
    pdf.output(str(dest))
    return dest


@pytest.fixture(scope="session")
def clean_pdf_bytes(clean_pdf_path: Path) -> bytes:
    """
    Return raw bytes of the generated clean PDF fixture.

    Returns:
        PDF file bytes.
    """
    return clean_pdf_path.read_bytes()


@pytest.fixture(scope="session")
def clean_png_path(ensure_fixtures_dir: None) -> Path:
    """
    Generate a tiny PNG with rendered text using Pillow and save to fixtures/.

    Returns:
        Path to the generated PNG file.
    """
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (500, 120), color="white")
    draw = ImageDraw.Draw(img)
    draw.text((10, 10), "Legal document test text for OCR", fill="black")
    draw.text((10, 40), "Plaintiff John Doe vs ACME Corp Case 2024", fill="black")
    draw.text((10, 70), "Filing date January 15 2024", fill="black")

    dest = FIXTURES_DIR / "clean_text.png"
    img.save(str(dest), format="PNG")
    return dest


@pytest.fixture(scope="session")
def clean_png_bytes(clean_png_path: Path) -> bytes:
    """
    Return raw bytes of the generated PNG fixture.

    Returns:
        PNG file bytes.
    """
    return clean_png_path.read_bytes()


@pytest.fixture(scope="session")
def client():
    """
    FastAPI TestClient bound to the OCR app.

    Returns:
        Starlette TestClient instance.
    """
    from fastapi.testclient import TestClient
    from main import app

    return TestClient(app)

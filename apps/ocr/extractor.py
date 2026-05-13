"""
Multi-strategy document text extractor for legal PDF and image files.

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

import io
import logging
from pathlib import Path
from typing import Literal

import pdfplumber
import pytesseract
from pdf2image import convert_from_bytes
from PIL import Image
from pydantic import BaseModel

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tiff", ".tif"}
MIN_TEXT_PER_PAGE = 50  # chars; below this pdfplumber output is treated as insufficient


class PageResult(BaseModel):
    """Extraction result for a single document page."""

    page_number: int
    text: str
    confidence: float


class ExtractionResult(BaseModel):
    """Full extraction result for a document."""

    text: str
    pages: list[PageResult]
    overall_confidence: float
    strategy_used: Literal["pdfplumber_text", "unstructured_hi_res", "tesseract_image"]


class DocumentExtractor:
    """
    Extracts text from PDF and image files using a three-tier strategy cascade:
    pdfplumber (native text layer) → unstructured hi_res (scanned PDFs) →
    tesseract (images and final fallback).
    """

    def extract(self, file_bytes: bytes, filename: str) -> ExtractionResult:
        """
        Extract text from document bytes using the best available strategy.

        For images, goes directly to tesseract. For PDFs, tries pdfplumber →
        unstructured → tesseract in order. Never raises; returns a result with
        error context if all strategies fail.

        Args:
            file_bytes: Raw file content.
            filename: Original filename used to determine file type.

        Returns:
            ExtractionResult with text, per-page results, confidence, and strategy.
        """
        ext = Path(filename).suffix.lower()

        if ext in IMAGE_EXTENSIONS:
            return self._tesseract_from_image(file_bytes)

        # PDF path: cascade through strategies
        result = self._try_pdfplumber(file_bytes)
        if result is not None:
            return result

        result = self._try_unstructured(file_bytes)
        if result is not None:
            return result

        return self._try_tesseract_pdf(file_bytes)

    # ── private strategy methods ──────────────────────────────────────────

    def _try_pdfplumber(self, file_bytes: bytes) -> ExtractionResult | None:
        """
        Attempt extraction via pdfplumber (native PDF text layer).

        Returns None when average text per page is below MIN_TEXT_PER_PAGE,
        which signals a scanned or image-only PDF that needs OCR.

        Args:
            file_bytes: Raw PDF bytes.

        Returns:
            ExtractionResult on success with sufficient text, None otherwise.
        """
        try:
            pages: list[PageResult] = []
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    pages.append(
                        PageResult(
                            page_number=page.page_number,
                            text=text,
                            confidence=1.0,
                        )
                    )

            if not pages:
                return None

            total_chars = sum(len(p.text) for p in pages)
            avg_chars_per_page = total_chars / len(pages)

            if avg_chars_per_page < MIN_TEXT_PER_PAGE:
                logger.debug(
                    "pdfplumber: %.1f chars/page below threshold, falling through",
                    avg_chars_per_page,
                )
                return None

            full_text = "\n\n".join(p.text for p in pages)
            return ExtractionResult(
                text=full_text,
                pages=pages,
                overall_confidence=1.0,
                strategy_used="pdfplumber_text",
            )
        except Exception as exc:
            logger.warning("pdfplumber strategy failed: %s", exc)
            return None

    def _try_unstructured(self, file_bytes: bytes) -> ExtractionResult | None:
        """
        Attempt extraction via unstructured hi_res (for scanned PDFs).

        Args:
            file_bytes: Raw PDF bytes.

        Returns:
            ExtractionResult on success, None on failure or empty output.
        """
        try:
            from unstructured.partition.pdf import partition_pdf  # type: ignore[import-untyped]

            elements = partition_pdf(
                file=io.BytesIO(file_bytes),
                strategy="hi_res",
                infer_table_structure=False,
            )

            page_texts: dict[int, list[str]] = {}
            for el in elements:
                metadata = getattr(el, "metadata", None)
                pn: int = int(getattr(metadata, "page_number", None) or 1)
                page_texts.setdefault(pn, []).append(str(el))

            if not page_texts:
                return None

            pages = [
                PageResult(
                    page_number=pn,
                    text="\n".join(texts),
                    confidence=0.85,
                )
                for pn, texts in sorted(page_texts.items())
            ]
            full_text = "\n\n".join(p.text for p in pages)

            return ExtractionResult(
                text=full_text,
                pages=pages,
                overall_confidence=0.85,
                strategy_used="unstructured_hi_res",
            )
        except Exception as exc:
            logger.warning("unstructured strategy failed: %s", exc)
            return None

    def _try_tesseract_pdf(self, file_bytes: bytes) -> ExtractionResult:
        """
        Rasterize PDF pages at 300 DPI and run tesseract on each.

        Args:
            file_bytes: Raw PDF bytes.

        Returns:
            ExtractionResult — always returns, never raises.
        """
        try:
            images = convert_from_bytes(file_bytes, dpi=300)
            pages = [
                self._tesseract_page(img, i + 1)
                for i, img in enumerate(images)
            ]
            return self._build_tesseract_result(pages)
        except Exception as exc:
            logger.error("tesseract PDF strategy failed: %s", exc)
            return ExtractionResult(
                text=f"[extraction failed: {exc}]",
                pages=[],
                overall_confidence=0.0,
                strategy_used="tesseract_image",
            )

    def _tesseract_from_image(self, file_bytes: bytes) -> ExtractionResult:
        """
        Run tesseract directly on a raw image file.

        Args:
            file_bytes: Raw image bytes (PNG, JPEG, TIFF, etc.).

        Returns:
            ExtractionResult — always returns, never raises.
        """
        try:
            image = Image.open(io.BytesIO(file_bytes))
            page = self._tesseract_page(image, 1)
            return self._build_tesseract_result([page])
        except Exception as exc:
            logger.error("tesseract image strategy failed: %s", exc)
            return ExtractionResult(
                text=f"[extraction failed: {exc}]",
                pages=[],
                overall_confidence=0.0,
                strategy_used="tesseract_image",
            )

    def _tesseract_page(self, image: Image.Image, page_number: int) -> PageResult:
        """
        Run tesseract on a single PIL image and compute word-level confidence.

        Confidence is the mean of per-word confidences from image_to_data,
        normalized from the 0–100 tesseract scale to 0.0–1.0.

        Args:
            image: PIL Image to OCR.
            page_number: 1-based page index for the result.

        Returns:
            PageResult with extracted text and normalized confidence.
        """
        data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
        text = pytesseract.image_to_string(image)

        raw_confs: list[int] = []
        for c in data["conf"]:
            try:
                v = int(c)
                if v >= 0:
                    raw_confs.append(v)
            except (ValueError, TypeError):
                pass

        confidence = (sum(raw_confs) / (len(raw_confs) * 100)) if raw_confs else 0.0
        return PageResult(page_number=page_number, text=text, confidence=confidence)

    @staticmethod
    def _build_tesseract_result(pages: list[PageResult]) -> ExtractionResult:
        """
        Assemble a final ExtractionResult from a list of tesseract page results.

        Args:
            pages: Per-page results from tesseract.

        Returns:
            ExtractionResult with combined text and mean overall confidence.
        """
        full_text = "\n\n".join(p.text for p in pages)
        overall = sum(p.confidence for p in pages) / len(pages) if pages else 0.0
        return ExtractionResult(
            text=full_text,
            pages=pages,
            overall_confidence=overall,
            strategy_used="tesseract_image",
        )

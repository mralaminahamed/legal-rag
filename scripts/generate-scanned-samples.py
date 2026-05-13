"""
Generate image-only PDF variants of scanned samples.

Rasterizes each page to 200 DPI PNG images (removing the text layer), then
reassembles the images into a new PDF. pdfplumber returns < 50 chars/page on
these files, triggering the unstructured_hi_res → tesseract_image fallback.

This demonstrates the OCR strategy cascade with real scanned-input behaviour.

Usage (from repo root):
  docker compose run --rm -v $(pwd)/samples:/app/samples ocr \
      python /app/scripts/generate-scanned-samples.py

Or locally if poppler-utils and Pillow are installed:
  python scripts/generate-scanned-samples.py

Outputs:
  samples/inputs/02-scanned-notice-IMG.pdf
  samples/inputs/03-low-quality-contract-IMG.pdf

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

import os
import sys
from pathlib import Path

from pdf2image import convert_from_path
from PIL import Image

SAMPLES_DIR = Path(__file__).parent.parent / "samples" / "inputs"
INPUTS = [
    "02-scanned-notice.pdf",
    "03-low-quality-contract.pdf",
]
DPI = 200  # 200 DPI: realistic scan quality, triggers OCR fallback path


def make_image_only_pdf(input_path: Path, output_path: Path, dpi: int = DPI) -> None:
    """
    Rasterize a PDF to images and save as an image-only PDF (no text layer).

    Args:
        input_path: Source PDF path.
        output_path: Destination image-only PDF path.
        dpi: Rasterization resolution in dots per inch.
    """
    print(f"  Rasterising {input_path.name} at {dpi} DPI ...", end=" ", flush=True)
    images = convert_from_path(str(input_path), dpi=dpi)

    if not images:
        raise ValueError(f"No pages extracted from {input_path}")

    rgb_images = [img.convert("RGB") for img in images]

    rgb_images[0].save(
        str(output_path),
        format="PDF",
        save_all=True,
        append_images=rgb_images[1:],
        resolution=dpi,
    )
    size_kb = output_path.stat().st_size // 1024
    print(f"{len(images)} page(s), {size_kb} KB → {output_path.name}")


def main() -> None:
    print("\nGenerating image-only PDF variants for OCR strategy demonstration\n")

    if not SAMPLES_DIR.exists():
        print(f"ERROR: samples dir not found: {SAMPLES_DIR}", file=sys.stderr)
        sys.exit(1)

    generated = 0
    for filename in INPUTS:
        input_path = SAMPLES_DIR / filename
        if not input_path.exists():
            print(f"  SKIP: {filename} not found — run scripts/generate-samples.ts first")
            continue

        stem = input_path.stem
        output_path = SAMPLES_DIR / f"{stem}-IMG.pdf"

        try:
            make_image_only_pdf(input_path, output_path)
            generated += 1
        except Exception as exc:
            print(f"  ERROR processing {filename}: {exc}", file=sys.stderr)

    print(f"\n{generated}/{len(INPUTS)} image-only PDFs written to {SAMPLES_DIR}")
    print("pdfplumber returns <50 chars/page on these files.")
    print("The OCR sidecar falls through to unstructured_hi_res or tesseract_image.")


if __name__ == "__main__":
    main()

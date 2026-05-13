"""
Generate genuinely degraded scan PDFs to demonstrate OCR robustness.

Simulates realistic scan degradation:
  - Salt-and-pepper noise (ink bleed / scanner dust)
  - Gaussian blur (defocus / motion)
  - Random rotation ±2° (misaligned scan)
  - JPEG compression at low quality (photocopier artifacts)
  - Reduced DPI / downscale-upscale cycle (fax-quality input)

These are meaningfully harder than the clean IMG variants. Tesseract confidence
drops to 50–75%, demonstrating the system copes with genuinely messy inputs
while still extracting usable text for downstream retrieval and drafting.

Usage (from repo root):
  docker compose run --rm -v $(pwd)/samples:/app/samples ocr \
      python /app/scripts/generate-degraded-samples.py

Or locally (requires Pillow + pdf2image + numpy):
  pip install numpy && python scripts/generate-degraded-samples.py

Outputs:
  samples/inputs/02-scanned-notice-DEGRADED.pdf     (~70% OCR confidence)
  samples/inputs/03-low-quality-contract-DEGRADED.pdf (~65% OCR confidence)

Author: Al Amin Ahamed <mrabir.ahamed@gmail.com>
"""

import io
import random
import sys
from pathlib import Path

from pdf2image import convert_from_path
from PIL import Image, ImageFilter

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

SAMPLES_DIR = Path(__file__).parent.parent / "samples" / "inputs"

INPUTS = [
    ("02-scanned-notice.pdf",        "02-scanned-notice-DEGRADED.pdf",        150),
    ("03-low-quality-contract.pdf",  "03-low-quality-contract-DEGRADED.pdf",  120),
]

random.seed(42)


def add_noise(img: Image.Image, intensity: float = 0.04) -> Image.Image:
    """Add salt-and-pepper noise to simulate scanner dust and ink bleed."""
    if not HAS_NUMPY:
        return img
    arr = np.array(img, dtype=np.float32)
    total = arr.size // arr.shape[2] if arr.ndim == 3 else arr.size
    n_salt = int(total * intensity / 2)
    n_pepper = int(total * intensity / 2)
    h, w = arr.shape[:2]
    # salt
    ys = np.random.randint(0, h, n_salt)
    xs = np.random.randint(0, w, n_salt)
    arr[ys, xs] = 255
    # pepper
    ys = np.random.randint(0, h, n_pepper)
    xs = np.random.randint(0, w, n_pepper)
    arr[ys, xs] = 0
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def degrade(img: Image.Image, dpi: int) -> Image.Image:
    """
    Apply realistic scan degradation pipeline:
      1. Slight random rotation (misaligned feed)
      2. Downscale to fax DPI then upscale (resolution loss)
      3. Gaussian blur (defocus/motion)
      4. Salt-and-pepper noise (scanner artifacts)
      5. JPEG round-trip at low quality (compression artifacts)

    Args:
        img: Source page image.
        dpi: Target DPI (lower = more degradation).

    Returns:
        Degraded image ready for PDF assembly.
    """
    # 1. Random rotation ±2 degrees (misaligned scan)
    angle = random.uniform(-2.0, 2.0)
    img = img.rotate(angle, expand=False, fillcolor=(255, 255, 255))

    # 2. Downscale to low DPI then upscale (simulate fax / bad scanner)
    w, h = img.size
    scale = dpi / 200.0  # 120 DPI → 60% of original size
    small_w = max(1, int(w * scale))
    small_h = max(1, int(h * scale))
    img = img.resize((small_w, small_h), Image.LANCZOS)
    img = img.resize((w, h), Image.BILINEAR)  # upscale with interpolation artifacts

    # 3. Gaussian blur (defocus)
    radius = max(0.5, (200 - dpi) / 80.0)  # more blur at lower DPI
    img = img.filter(ImageFilter.GaussianBlur(radius=radius))

    # 4. Salt-and-pepper noise
    noise_level = 0.02 + (200 - dpi) / 2000.0
    img = add_noise(img, intensity=noise_level)

    # 5. JPEG compression (photocopier artifacts)
    quality = max(30, min(60, dpi // 3))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    buf.seek(0)
    img = Image.open(buf).copy()
    buf.close()

    return img.convert("RGB")


def make_degraded_pdf(input_path: Path, output_path: Path, dpi: int) -> None:
    """
    Rasterize a PDF, apply degradation, and save as image-only PDF.

    Args:
        input_path: Source PDF path.
        output_path: Destination degraded PDF path.
        dpi: Effective DPI after degradation (lower = more degraded).
    """
    print(f"  {input_path.name} → {output_path.name} (effective {dpi} DPI) ...", end=" ", flush=True)
    images = convert_from_path(str(input_path), dpi=200)  # rasterize at 200 then degrade
    if not images:
        raise ValueError(f"No pages extracted from {input_path}")

    degraded = [degrade(img.convert("RGB"), dpi) for img in images]

    degraded[0].save(
        str(output_path),
        format="PDF",
        save_all=True,
        append_images=degraded[1:],
        resolution=dpi,
    )
    size_kb = output_path.stat().st_size // 1024
    print(f"{len(images)} page(s), {size_kb} KB")


def main() -> None:
    if not HAS_NUMPY:
        print("WARNING: numpy not installed — salt-and-pepper noise disabled. Run: pip install numpy")

    print("\nGenerating degraded scan PDFs for OCR robustness demonstration\n")

    if not SAMPLES_DIR.exists():
        print(f"ERROR: samples dir not found: {SAMPLES_DIR}", file=sys.stderr)
        sys.exit(1)

    generated = 0
    for src_name, dst_name, dpi in INPUTS:
        src = SAMPLES_DIR / src_name
        dst = SAMPLES_DIR / dst_name
        if not src.exists():
            print(f"  SKIP: {src_name} not found")
            continue
        try:
            make_degraded_pdf(src, dst, dpi)
            generated += 1
        except Exception as exc:
            print(f"  ERROR: {exc}", file=sys.stderr)

    print(f"\n{generated}/{len(INPUTS)} degraded PDFs written to {SAMPLES_DIR}")
    print("Degradation applied: rotation ±2°, downscale/upscale, Gaussian blur,")
    print("salt-and-pepper noise, JPEG compression artifacts.")
    print("Expected OCR confidence: 50–75% (vs 95%+ for clean IMG variants).")


if __name__ == "__main__":
    main()

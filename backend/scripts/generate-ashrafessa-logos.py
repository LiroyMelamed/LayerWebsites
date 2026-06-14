#!/usr/bin/env python3
"""Generate sharp AshrafEssa logo assets from source PDF/PNG scan."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import cv2
import fitz
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
PUBLIC = FRONTEND / "public"
LOGOS = FRONTEND / "src" / "assets" / "images" / "logos"
DEFAULT_PDF = Path.home() / "Downloads" / "CamScanner 03.05.2026 17.55.pdf"


def extract_pdf(pdf_path: Path, zoom: float = 10.0) -> np.ndarray:
    doc = fitz.open(pdf_path)
    page = doc[0]
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    doc.close()
    if img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_RGBA2BGR)
    elif img.shape[2] == 3:
        img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    return img


def trim_white_margins(bgr: np.ndarray, fuzz: int = 12) -> np.ndarray:
    tmp = Path("/tmp/ashraf-trim.png")
    cv2.imwrite(str(tmp), bgr)
    out = Path("/tmp/ashraf-trimmed.png")
    subprocess.run(
        ["magick", str(tmp), "-fuzz", f"{fuzz}%", "-trim", "+repage", str(out)],
        check=True,
    )
    return cv2.imread(str(out))


def enhance_scan(bgr: np.ndarray) -> np.ndarray:
    """Denoise scan, recover contrast, sharpen without halos."""
    denoised = cv2.fastNlMeansDenoisingColored(bgr, None, 6, 6, 7, 21)
    lab = cv2.cvtColor(denoised, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
    l = clahe.apply(l)
    merged = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
    blurred = cv2.GaussianBlur(enhanced, (0, 0), 1.2)
    sharp = cv2.addWeighted(enhanced, 1.35, blurred, -0.35, 0)
    return sharp


def bgr_to_rgba_with_alpha(bgr: np.ndarray) -> np.ndarray:
    """Paper white -> transparent; smooth alpha for clean edges."""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    white = np.array([255, 255, 255], dtype=np.float32)
    diff = np.linalg.norm(rgb.astype(np.float32) - white, axis=2)
  # 0 = white paper, higher = ink/gold
    alpha = np.clip((diff - 18) * 4.5, 0, 255).astype(np.uint8)
    # Remove light grey scan noise in background
    grey = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    alpha[grey > 246] = 0
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
    rgba = np.dstack([rgb, alpha])
    return rgba


def rgba_to_pil(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray(rgba)


def fit_square(rgba: Image.Image, size: int, bg=(255, 255, 255, 255), pad: float = 0.07) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    inner = int(size * (1 - 2 * pad))
    copy = rgba.copy()
    copy.thumbnail((inner, inner), Image.Resampling.LANCZOS)
    x = (size - copy.width) // 2
    y = (size - copy.height) // 2
    canvas.paste(copy, (x, y), copy)
    return canvas


def resize_width(rgba: Image.Image, width: int) -> Image.Image:
    h = max(1, int(rgba.height * width / rgba.width))
    return rgba.resize((width, h), Image.Resampling.LANCZOS)


def white_variant(rgba: Image.Image) -> Image.Image:
    gray = np.array(rgba.convert("L"))
    white = 255 - gray
    alpha = np.array(rgba.split()[3])
    return Image.fromarray(np.dstack([white, white, white, alpha]))


def black_variant(rgba: Image.Image) -> Image.Image:
    """Same silhouette as logoLMwhite — pure black on transparent (login tint)."""
    gray = np.array(rgba.convert("L"))
    ink = 255 - gray
    alpha = np.array(rgba.split()[3])
    combined = ((ink.astype(np.uint16) * alpha) // 255).astype(np.uint8)
    rgb = np.zeros((gray.shape[0], gray.shape[1], 3), dtype=np.uint8)
    return Image.fromarray(np.dstack([rgb, combined]))


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix == ".ico":
        im.save(path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    else:
        im.save(path, format="PNG", optimize=True)


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not src.exists():
        sys.exit(f"Source not found: {src}")

    print(f"# Processing {src}")
    if src.suffix.lower() == ".pdf":
        bgr = extract_pdf(src, zoom=10.0)
    else:
        bgr = cv2.imread(str(src))

    print(f"# Raw {bgr.shape[1]}x{bgr.shape[0]}")
    bgr = trim_white_margins(bgr)
    print(f"# Trimmed {bgr.shape[1]}x{bgr.shape[0]}")
    bgr = enhance_scan(bgr)
    rgba = bgr_to_rgba_with_alpha(bgr)
    logo = rgba_to_pil(rgba)

    # Master square — downscale from large size for crisp icons
    master = fit_square(logo, 2048, pad=0.065)

    icon_sizes = {
        "android-chrome-512x512.png": 512,
        "android-chrome-192x192.png": 192,
        "apple-touch-icon.png": 180,
        "logo512.png": 512,
        "logo192.png": 192,
        "favicon.png": 512,
        "favicon-32x32.png": 32,
        "favicon-16x16.png": 16,
        "firm-logo.png": 512,
    }
    for name, px in icon_sizes.items():
        save(master.resize((px, px), Image.Resampling.LANCZOS), PUBLIC / name)
        print(f"# {PUBLIC / name}")

    save(master.resize((32, 32), Image.Resampling.LANCZOS), PUBLIC / "favicon.ico")

    save(resize_width(logo, 1000), LOGOS / "logo2.png")
    save(resize_width(logo, 260), LOGOS / "logo.png")
    lm_width = 420
    save(resize_width(black_variant(logo), lm_width), LOGOS / "logoLM.png")
    white = resize_width(white_variant(logo), lm_width)
    save(white, LOGOS / "logoLMwhite.png")
    save(white, PUBLIC / "logoLMwhite.png")

    print("# Done — all assets from scanned source")


if __name__ == "__main__":
    main()

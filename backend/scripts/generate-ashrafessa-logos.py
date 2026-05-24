#!/usr/bin/env python3
"""Generate sharpened AshrafEssa logo assets from source PDF/PNG scan."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
except ImportError:
    print("Install: pip3 install pymupdf pillow", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
PUBLIC = FRONTEND / "public"
LOGOS = FRONTEND / "src" / "assets" / "images" / "logos"

DEFAULT_PDF = Path.home() / "Downloads" / "CamScanner 03.05.2026 17.55.pdf"


def extract_pdf(pdf_path: Path, out_png: Path, zoom: float = 4.0) -> None:
    doc = fitz.open(pdf_path)
    page = doc[0]
    mat = fitz.Matrix(zoom, zoom)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    pix.save(str(out_png))
    doc.close()


def trim_fuzz(im: Image.Image, fuzz_pct: int = 12) -> Image.Image:
  tmp_in = Path("/tmp/ashraf-trim-in.png")
  tmp_out = Path("/tmp/ashraf-trim-out.png")
  im.convert("RGB").save(tmp_in)
  subprocess.run(
      ["magick", str(tmp_in), "-fuzz", f"{fuzz_pct}%", "-trim", "+repage", str(tmp_out)],
      check=True,
  )
  return Image.open(tmp_out).convert("RGBA")


def sharpen(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    for _ in range(2):
        rgb = rgb.filter(ImageFilter.UnsharpMask(radius=2, percent=200, threshold=2))
    rgb = ImageEnhance.Contrast(rgb).enhance(1.1)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.4)
    out = rgb.convert("RGBA")
    if im.mode == "RGBA":
        out.putalpha(im.split()[3])
    return out


def white_to_alpha(im: Image.Image, fuzz: int = 18) -> Image.Image:
    tmp_in = Path("/tmp/ashraf-wta-in.png")
    tmp_out = Path("/tmp/ashraf-wta-out.png")
    im.save(tmp_in)
    subprocess.run(
        [
            "magick",
            str(tmp_in),
            "-fuzz",
            f"{fuzz}%",
            "-transparent",
            "white",
            str(tmp_out),
        ],
        check=True,
    )
    return Image.open(tmp_out).convert("RGBA")


def fit_square(im: Image.Image, size: int, bg=(255, 255, 255, 255)) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), bg)
    im_r = im.copy()
    im_r.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - im_r.width) // 2
    y = (size - im_r.height) // 2
    canvas.paste(im_r, (x, y), im_r)
    return canvas


def crop_icon_square(im: Image.Image) -> Image.Image:
    """Top-centered square crop around scales emblem."""
    w, h = im.size
    side = int(min(w, h * 0.58))
    left = (w - side) // 2
    return im.crop((left, 0, left + side, side))


def resize_width(im: Image.Image, width: int) -> Image.Image:
    ratio = width / im.width
    height = max(1, int(im.height * ratio))
    return im.resize((width, height), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".ico":
        im.convert("RGBA").save(path, format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    else:
        im.save(path, optimize=True)


def make_white_logo(im: Image.Image) -> Image.Image:
    """Light logo for dark backgrounds (email headers)."""
    gray = im.convert("L")
    # Invert luminance; keep alpha from original
    inv = ImageOps.invert(gray)
    out = Image.merge("RGBA", (inv, inv, inv, im.split()[3]))
    return out


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PDF
    if not src.exists():
        print(f"Source not found: {src}", file=sys.stderr)
        sys.exit(1)

    raw_png = Path("/tmp/ashraf-raw.png")
    if src.suffix.lower() == ".pdf":
        print(f"# Extracting {src}")
        extract_pdf(src, raw_png)
    else:
        raw_png = src

    print("# Trim + sharpen")
    trimmed = trim_fuzz(Image.open(raw_png))
    sharp = sharpen(trimmed)
    sharp_rgb = sharp.convert("RGB")

    full_transparent = white_to_alpha(sharp)
    icon_src = crop_icon_square(sharp_rgb)
    icon_transparent = white_to_alpha(icon_src)

    # --- App / PWA icons (emblem, square) ---
    icon_512 = fit_square(icon_transparent, 512)
    icon_192 = fit_square(icon_transparent, 192)
    icon_180 = fit_square(icon_transparent, 180)
    icon_32 = fit_square(icon_transparent, 32)
    icon_16 = fit_square(icon_transparent, 16)

    public_icons = {
        "android-chrome-512x512.png": icon_512,
        "android-chrome-192x192.png": icon_192,
        "apple-touch-icon.png": icon_180,
        "logo512.png": icon_512,
        "logo192.png": icon_192,
        "favicon.png": icon_512,
        "favicon-32x32.png": icon_32,
        "favicon-16x16.png": icon_16,
        "firm-logo.png": fit_square(full_transparent, 512),
    }

    for name, img in public_icons.items():
        out = PUBLIC / name
        save_png(img.convert("RGBA") if name != "firm-logo.png" else img, out)
        print(f"# wrote {out}")

    save_png(icon_32, PUBLIC / "favicon.ico")

    # --- In-app logos ---
    logo2 = resize_width(full_transparent, 800)
    logo_ui = resize_width(full_transparent, 220)
    logo_small = resize_width(full_transparent, 105)

    save_png(logo2, LOGOS / "logo2.png")
    save_png(logo_ui, LOGOS / "logo.png")
    save_png(logo_small, LOGOS / "logoLM.png")
    save_png(make_white_logo(resize_width(full_transparent, 400)), LOGOS / "logoLMwhite.png")
    save_png(make_white_logo(resize_width(full_transparent, 400)), PUBLIC / "logoLMwhite.png")

    print("# Done — rebuild frontend and deploy to refresh bundles.")


if __name__ == "__main__":
    main()
